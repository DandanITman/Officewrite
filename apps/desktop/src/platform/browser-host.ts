import type { AppSettings, RecentFile, DocumentRevision } from '@officewrite/core';
import type { ImportDocResult, ListedDocument, OfficewriteAPI } from './api';

/**
 * A real implementation of the host bridge for officewrite.com/app.
 *
 * The Electron build gets its files, settings and dictionaries from the main
 * process. On the web there is no main process, so this module provides the
 * same thirty-method contract on top of what a browser actually offers:
 *
 *   documents   Origin Private File System, so paths, names, sizes and
 *               modified times behave the way the renderer already expects
 *   disk I/O    File System Access API where available, falling back to an
 *               <input type="file"> for opening and a download for saving
 *   settings    localStorage
 *
 * Where the browser genuinely cannot do the job - converting legacy .doc via
 * LibreOffice, or running Hunspell - it degrades openly rather than pretending.
 * See DEGRADED below; the app surfaces those limits rather than failing.
 *
 * Nothing here may be imported from `src/` directly. It is installed onto
 * `window.officewrite` by web-main.tsx, so `platform/index.ts` stays the single
 * place that resolves the bridge.
 */

/* ------------------------------------------------------------------ *
 * Minimal ambient typings.
 *
 * lib.dom does not yet carry the File System Access picker functions or the
 * OPFS iteration helpers across the TypeScript versions this repo builds on,
 * and widening the tsconfig lib to pick them up would pull in far more than we
 * want. Declaring exactly what we call keeps the surface honest.
 * ------------------------------------------------------------------ */

interface WritableStreamLike {
  write: (data: BufferSource | Blob | string) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
}

interface FileHandleLike {
  name: string;
  kind: 'file';
  getFile: () => Promise<File>;
  createWritable: () => Promise<WritableStreamLike>;
  isSameEntry?: (other: FileHandleLike) => Promise<boolean>;
}

interface DirectoryHandleLike {
  kind: 'directory';
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileHandleLike>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirectoryHandleLike>;
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>;
  values: () => AsyncIterableIterator<FileHandleLike | DirectoryHandleLike>;
}

type PickerAcceptType = { description?: string; accept: Record<string, string[]> };

interface PickerWindow {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: PickerAcceptType[];
  }) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: PickerAcceptType[];
  }) => Promise<FileHandleLike>;
}

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** The single folder documents live in. Mirrors the desktop default. */
const DOCS_DIR = '/Documents';
const DOCUMENT_EXTENSION = /\.(docx|officewrite|rtf|html?|txt)$/i;

const SETTINGS_KEY = 'officewrite.settings';
const RECENTS_KEY = 'officewrite.recents';
const DICTIONARY_KEY = 'officewrite.userDictionary';
const REVISIONS_PREFIX = 'officewrite.revisions:';

/** Kept in sync with the accept types the desktop file dialogs offer. */
const DOC_TYPES: PickerAcceptType[] = [
  {
    description: 'Documents',
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/rtf': ['.rtf'],
      'text/html': ['.html', '.htm'],
      'text/plain': ['.txt'],
      'application/json': ['.officewrite'],
    },
  },
];

const IMAGE_TYPES: PickerAcceptType[] = [
  {
    description: 'Images',
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'] },
  },
];

/** Mail-merge recipient lists, matching the desktop picker's filter. */
const DATA_TYPES: PickerAcceptType[] = [
  {
    description: 'Recipient lists',
    accept: { 'text/csv': ['.csv', '.tsv'], 'text/plain': ['.txt'] },
  },
];

/**
 * Capabilities the browser cannot provide. The app checks these to grey out the
 * affected commands rather than letting them fail at the click.
 */
export const DEGRADED = {
  /** Legacy .doc import shells out to LibreOffice on the desktop. */
  importLegacyDoc: false,
  /** Hunspell runs in the Electron main process; too heavy to ship to the web. */
  spellCheck: false,
  /** Electron renders PDF via its print engine; browsers go through Print. */
  exportPdf: false,
} as const;

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

/** Final path segment. Documents are flat, so this is also the OPFS key. */
function fileNameOf(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? '';
}

function docPath(name: string): string {
  return `${DOCS_DIR}/${name}`;
}

/**
 * Handles returned by the save picker, keyed by the synthetic path we hand back
 * to the renderer. Lets a later writeFile land on the user's real disk instead
 * of only in OPFS, without changing the path-shaped contract.
 */
const diskHandles = new Map<string, FileHandleLike>();

let opfsRoot: DirectoryHandleLike | null = null;
let opfsPending: Promise<DirectoryHandleLike | null> | null = null;

/**
 * OPFS is available in every current browser, but not in older Safari and not
 * in some private-browsing modes. Resolve once and let callers fall back.
 */
async function documentsDir(): Promise<DirectoryHandleLike | null> {
  if (!opfsPending) opfsPending = openDocumentsDir();
  return opfsPending;
}

async function availableDocumentPath(name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? name : `${stem} (${index})${extension}`;
    const path = docPath(candidate);
    if (!diskHandles.has(path) && !await readStored(path)) return path;
  }
  throw new Error('Too many files share this name. Rename the selected file and try again.');
}

async function openDocumentsDir(): Promise<DirectoryHandleLike | null> {
  try {
    const storage = navigator.storage as unknown as {
      getDirectory?: () => Promise<DirectoryHandleLike>;
    };
    if (!storage?.getDirectory) return (opfsRoot = null);
    const root = await storage.getDirectory();
    opfsRoot = await root.getDirectoryHandle('documents', { create: true });
  } catch {
    opfsRoot = null;
  }
  return opfsRoot;
}

/** In-memory stand-in so the editor still works where OPFS is unavailable. */
const memoryFiles = new Map<string, { data: Uint8Array; modified: number }>();

async function readStored(path: string): Promise<Uint8Array | null> {
  const name = fileNameOf(path);
  const dir = await documentsDir();
  if (!dir) {
    return memoryFiles.get(name)?.data ?? null;
  }
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}

async function writeStored(path: string, data: Uint8Array): Promise<boolean> {
  const name = fileNameOf(path);
  const dir = await documentsDir();
  if (!dir) {
    memoryFiles.set(name, { data, modified: Date.now() });
    return true;
  }
  try {
    const handle = await dir.getFileHandle(name, { create: true });
    await writeHandle(handle, data);
    return true;
  } catch {
    return false;
  }
}

async function writeHandle(handle: FileHandleLike, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  try {
    // Copy the selected view, not any extra bytes from its backing buffer.
    await writable.write(bytes.slice().buffer as ArrayBuffer);
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exhausted, or storage blocked entirely in private mode.
    return false;
  }
}

/** Offer the bytes as a download - the only way out on Firefox and Safari. */
function downloadBytes(name: string, data: Uint8Array): void {
  const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next frame; revoking synchronously cancels the download in
  // Safari before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Read a file the user picked through a plain <input>, for browsers with no picker. */
function promptForFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    // 'cancel' does not fire everywhere; the focus fallback covers the rest.
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener(
      'focus',
      () => setTimeout(() => finish(input.files?.[0] ?? null), 500),
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

/* ------------------------------------------------------------------ *
 * The bridge
 * ------------------------------------------------------------------ */

export function createBrowserHost(): OfficewriteAPI {
  const picker = window as unknown as PickerWindow;
  let dirty = false;
  const saveAndCloseHandlers = new Set<() => void>();

  /** Copy a picked file into OPFS so the rest of the app sees a normal path. */
  async function adopt(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // A same-named file from another folder must not replace a saved document
    // or inherit a disk handle previously chosen for that document.
    const path = await availableDocumentPath(file.name);
    if (!(await writeStored(path, bytes))) throw new Error('Could not store the selected file. Browser storage may be full.');
    return path;
  }

  const host: OfficewriteAPI = {
    /* ---- opening ------------------------------------------------- */

    openFile: async () => {
      if (picker.showOpenFilePicker) {
        try {
          const [handle] = await picker.showOpenFilePicker({ types: DOC_TYPES });
          if (!handle) return null;
          return await adopt(await handle.getFile());
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return null;
          throw error;
        }
      }
      const file = await promptForFile('.docx,.rtf,.html,.htm,.txt,.officewrite');
      return file ? adopt(file) : null;
    },

    openImageFile: async () => {
      if (picker.showOpenFilePicker) {
        try {
          const [handle] = await picker.showOpenFilePicker({ types: IMAGE_TYPES });
          if (!handle) return null;
          return await adopt(await handle.getFile());
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return null;
          throw error;
        }
      }
      const file = await promptForFile('image/*');
      return file ? adopt(file) : null;
    },

    openDataFile: async () => {
      if (picker.showOpenFilePicker) {
        try {
          const [handle] = await picker.showOpenFilePicker({ types: DATA_TYPES });
          if (!handle) return null;
          return await adopt(await handle.getFile());
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return null;
          throw error;
        }
      }
      const file = await promptForFile('.csv,.tsv,.txt');
      return file ? adopt(file) : null;
    },

    openFolder: async () => DOCS_DIR,

    /* ---- saving -------------------------------------------------- */

    saveFile: async (defaultPath?: string) => {
      const suggested = defaultPath ? fileNameOf(defaultPath) : 'Document.docx';
      // PDF output is produced by the browser's own print dialog. Do not
      // create an empty disk file before that dialog asks for its destination.
      if (/\.pdf$/i.test(suggested)) return docPath(suggested);
      if (picker.showSaveFilePicker) {
        try {
          const handle = await picker.showSaveFilePicker({
            suggestedName: suggested,
            types: DOC_TYPES,
          });
          for (const [knownPath, knownHandle] of diskHandles) {
            if (handle === knownHandle || await handle.isSameEntry?.(knownHandle)) return knownPath;
          }
          const path = await availableDocumentPath(handle.name);
          // Remember the handle so writeFile reaches the real file, not just OPFS.
          diskHandles.set(path, handle);
          return path;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return null;
          throw error;
        }
      }
      // No picker: keep it in OPFS under the suggested name. writeFile also
      // triggers a download, which is the only route to disk here.
      return availableDocumentPath(suggested);
    },

    /* ---- file I/O ------------------------------------------------ */

    readFile: async (filePath: string) => {
      const bytes = await readStored(filePath);
      if (!bytes) throw new Error(`Cannot read ${filePath}: not found in browser storage.`);
      return bytes;
    },

    readTextFile: async (filePath: string) => {
      const bytes = await readStored(filePath);
      if (!bytes) throw new Error(`Cannot read ${filePath}: not found in browser storage.`);
      return new TextDecoder().decode(bytes);
    },

    writeFile: async (filePath: string, data: Uint8Array | string) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const ok = await writeStored(filePath, bytes);

      const handle = diskHandles.get(filePath);
      if (handle) {
        try {
          await writeHandle(handle, bytes);
        } catch {
          // The handle went stale (permission revoked, file moved). The OPFS
          // copy above still holds the content, so the edit is not lost.
          return false;
        }
      } else if (!picker.showSaveFilePicker) {
        downloadBytes(fileNameOf(filePath), bytes);
      }
      return ok;
    },

    renameFile: async (filePath: string, newName: string) => {
      if (!newName.trim() || /[\\/]/.test(newName) || newName === '.' || newName === '..') return null;
      if (newName === fileNameOf(filePath)) return filePath;
      const dir = await documentsDir();
      const bytes = await readStored(filePath);
      if (!bytes) return null;
      const target = docPath(newName);
      if (dir) {
        try {
          await dir.getFileHandle(newName);
          return null; // name already taken, matching the desktop contract
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
        }
      } else if (memoryFiles.has(newName)) {
        return null;
      }
      if (!(await writeStored(target, bytes))) return null;
      if (dir) {
        try {
          await dir.removeEntry(fileNameOf(filePath));
        } catch {
          await dir.removeEntry(newName).catch(() => {});
          return null;
        }
      }
      else memoryFiles.delete(fileNameOf(filePath));
      diskHandles.delete(filePath);
      return target;
    },

    copyFile: async (filePath: string) => {
      const bytes = await readStored(filePath);
      if (!bytes) return null;
      const name = fileNameOf(filePath);
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      // Match the desktop's numbered duplicate rather than overwriting.
      for (let n = 1; n < 1000; n += 1) {
        const candidate = `${stem} (${n})${ext}`;
        const exists = await readStored(docPath(candidate));
        if (!exists) {
          return (await writeStored(docPath(candidate), bytes)) ? docPath(candidate) : null;
        }
      }
      return null;
    },

    trashFile: async (filePath: string) => {
      const dir = await documentsDir();
      diskHandles.delete(filePath);
      if (!dir) return memoryFiles.delete(fileNameOf(filePath));
      try {
        await dir.removeEntry(fileNameOf(filePath));
        return true;
      } catch {
        return false;
      }
    },

    listDocuments: async () => {
      const dir = await documentsDir();
      if (!dir) {
        return [...memoryFiles.entries()].filter(([name]) => DOCUMENT_EXTENSION.test(name)).map(([name, entry]) => ({
          path: docPath(name),
          name,
          modified: entry.modified,
          size: entry.data.byteLength,
        })).sort((a, b) => b.modified - a.modified);
      }
      const out: ListedDocument[] = [];
      try {
        for await (const entry of dir.values()) {
          if (entry.kind !== 'file' || !DOCUMENT_EXTENSION.test(entry.name)) continue;
          const file = await entry.getFile();
          out.push({
            path: docPath(entry.name),
            name: entry.name,
            modified: file.lastModified,
            size: file.size,
          });
        }
      } catch {
        /* listing is best-effort */
      }
      return out.sort((a, b) => b.modified - a.modified);
    },

    getDefaultSaveDir: async () => DOCS_DIR,

    /* ---- settings and recents ------------------------------------ */

    getSettings: async () => readJson<AppSettings | null>(SETTINGS_KEY, null),
    setSettings: async (settings: AppSettings) => writeJson(SETTINGS_KEY, settings),
    getRecents: async () => readJson<RecentFile[]>(RECENTS_KEY, []),
    setRecents: async (recents: RecentFile[]) => writeJson(RECENTS_KEY, recents),

    /* ---- revisions ----------------------------------------------- */

    saveRevision: async (path: string, snapshot: unknown, label: string) => {
      const key = REVISIONS_PREFIX + path;
      const list = readJson<Array<DocumentRevision & { snapshot: unknown }>>(key, []);
      const revision: DocumentRevision = {
        // crypto.randomUUID needs a secure context; officewrite.com is HTTPS,
        // but keep a fallback so a plain-HTTP preview still works.
        id: globalThis.crypto?.randomUUID?.() ?? `rev-${Date.now()}-${list.length}`,
        timestamp: Date.now(),
        label,
        filePath: path,
      };
      list.unshift({ ...revision, snapshot });
      // The desktop keeps twenty per document; match it so quota stays bounded.
      if (!writeJson(key, list.slice(0, 20))) {
        throw new Error('Could not save version history. Browser storage may be full.');
      }
      return revision;
    },

    listRevisions: async (path: string) =>
      readJson<DocumentRevision[]>(REVISIONS_PREFIX + path, []).map(
        ({ id, timestamp, label, filePath }) => ({ id, timestamp, label, filePath }),
      ),

    loadRevision: async (path: string, id: string) => {
      const list = readJson<Array<DocumentRevision & { snapshot: unknown }>>(
        REVISIONS_PREFIX + path,
        [],
      );
      return list.find((r) => r.id === id)?.snapshot ?? null;
    },

    /* ---- printing and export ------------------------------------- */

    printDocument: async () => {
      window.print();
      return true;
    },

    /**
     * Electron renders PDF through Chromium's print engine, which the page
     * cannot call directly. Open the print dialog instead: every browser offers
     * "Save as PDF" there. Null tells the caller no bytes came back, so it does
     * not try to write a file.
     */
    exportPdf: async () => {
      window.print();
      return null;
    },

    /* ---- degraded ------------------------------------------------ */

    importDoc: async (): Promise<ImportDocResult> => {
      throw new Error(
        'Converting legacy .doc files needs the desktop app, which runs LibreOffice to do it. ' +
          'Save the file as .docx and open that instead.',
      );
    },

    // Hunspell lives in the Electron main process. Reporting every word as
    // correct disables the red underlines rather than covering the page in them.
    spellCheckWords: async (words: string[]) => words.map(() => true),
    spellSuggest: async () => [],
    getUserDictionary: async () => readJson<string[]>(DICTIONARY_KEY, []),
    addWordToDictionary: async (word: string) => {
      const words = readJson<string[]>(DICTIONARY_KEY, []);
      const lower = word.toLowerCase();
      if (!words.includes(lower)) words.push(lower);
      writeJson(DICTIONARY_KEY, words);
      return words;
    },

    /* ---- shell integration --------------------------------------- */

    openExternal: async (url: string) => {
      // Only http(s); a javascript: or data: URL here would be an XSS vector.
      if (!/^https?:\/\//i.test(url)) return false;
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },

    setDirty: async (value: boolean) => {
      dirty = value;
      return true;
    },

    closeNow: async () => true,

    onSaveAndClose: (callback: () => void) => {
      saveAndCloseHandlers.add(callback);
      return () => saveAndCloseHandlers.delete(callback);
    },

    // A web page cannot be handed a file at launch, and there is no second
    // instance to forward one from. Both resolve empty by design.
    takePendingFile: async () => null,
    onOpenFile: () => () => {},
  };

  /**
   * Warn before a reload or tab close while edits are unsaved. The desktop does
   * this from the main process once setDirty tells it to; beforeunload is the
   * browser equivalent, and it reads the same closure flag.
   */
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    // Browsers ignore custom text now, but returnValue must be set to prompt.
    event.returnValue = '';
  });

  return host;
}
