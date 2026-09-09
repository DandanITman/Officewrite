import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

describe('production browser storage failures', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
  });

  async function setup(failWrite = false) {
    const files = new Map<string, Uint8Array>([['original.txt', new TextEncoder().encode('keep me')]]);
    const dir = {
      getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        if (!options?.create && !files.has(name)) throw new DOMException('missing', 'NotFoundError');
        return {
          name, kind: 'file',
          getFile: async () => ({ arrayBuffer: async () => files.get(name)!.buffer, size: files.get(name)!.byteLength, lastModified: name === 'original.txt' ? 1 : 2 }),
          createWritable: async () => ({
            write: async (data: ArrayBuffer) => {
              if (failWrite) throw new Error('quota exceeded');
              files.set(name, new Uint8Array(data));
            },
            close: async () => {},
          }),
        };
      }),
      removeEntry: vi.fn(async (name: string) => { files.delete(name); }),
      values: async function* () {
        for (const name of files.keys()) yield await dir.getFileHandle(name);
      },
    };
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => dir }) } });
    const { createBrowserHost } = await import('./browser-host');
    return { host: createBrowserHost(), files, dir };
  }

  it('does not delete the original when a rename write fails', async () => {
    const { host, files, dir } = await setup(true);
    expect(await host.renameFile('/Documents/original.txt', 'renamed.txt')).toBeNull();
    expect(files.has('original.txt')).toBe(true);
    expect(dir.removeEntry).not.toHaveBeenCalled();
  });

  it('does not report a successful copy when storage is full', async () => {
    const { host } = await setup(true);
    expect(await host.copyFile('/Documents/original.txt')).toBeNull();
  });

  it('reports disk write failure on every retry while keeping the browser backup', async () => {
    const { host, files } = await setup();
    const createWritable = vi.fn().mockRejectedValue(new Error('permission revoked'));
    (window as unknown as Record<string, unknown>).showSaveFilePicker = async () => ({ name: 'disk.txt', createWritable });
    expect(await host.saveFile('disk.txt')).toBe('/Documents/disk.txt');
    expect(await host.writeFile('/Documents/disk.txt', 'saved backup')).toBe(false);
    expect(await host.writeFile('/Documents/disk.txt', 'retry backup')).toBe(false);
    expect(new TextDecoder().decode(files.get('disk.txt'))).toBe('retry backup');
    expect(createWritable).toHaveBeenCalledTimes(2);
  });

  it('waits for the same storage initialization during concurrent reads', async () => {
    const { host } = await setup();
    const results = await Promise.all([
      host.readTextFile('/Documents/original.txt'),
      host.readTextFile('/Documents/original.txt'),
    ]);
    expect(results).toEqual(['keep me', 'keep me']);
  });

  it('reports revision quota errors instead of inventing a saved revision', async () => {
    const { host } = await setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await expect(host.saveRevision('/Documents/original.txt', {}, 'Manual save')).rejects.toThrow('Could not save version history');
  });

  it('imports same-named files separately without replacing an existing document', async () => {
    const { host, files } = await setup();
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [{
      getFile: async () => ({ name: 'original.txt', arrayBuffer: async () => new TextEncoder().encode('imported').buffer }),
    }];
    expect(await host.openFile()).toBe('/Documents/original (1).txt');
    expect(await host.openFile()).toBe('/Documents/original (2).txt');
    expect(new TextDecoder().decode(files.get('original.txt'))).toBe('keep me');
    expect(await host.readTextFile('/Documents/original (1).txt')).toBe('imported');
  });

  it('does not reuse a selected disk destination when importing a same-named file', async () => {
    const { host } = await setup();
    const createWritable = vi.fn();
    (window as unknown as Record<string, unknown>).showSaveFilePicker = async () => ({ name: 'disk.txt', createWritable });
    await host.saveFile('disk.txt');
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [{
      getFile: async () => ({ name: 'disk.txt', arrayBuffer: async () => new TextEncoder().encode('imported').buffer }),
    }];
    const imported = await host.openFile();
    expect(imported).toBe('/Documents/disk (1).txt');
    expect(await host.writeFile(imported!, 'edited import')).toBe(true);
    expect(createWritable).not.toHaveBeenCalled();
  });

  it('surfaces import storage failure but treats picker cancellation as cancellation', async () => {
    const { host } = await setup(true);
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [{
      getFile: async () => ({ name: 'new.txt', arrayBuffer: async () => new TextEncoder().encode('imported').buffer }),
    }];
    await expect(host.openFile()).rejects.toThrow('Could not store the selected file');
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => { throw new DOMException('cancelled', 'AbortError'); };
    expect(await host.openFile()).toBeNull();
  });

  it('keeps different disk files with identical names separate and reuses the same disk identity', async () => {
    const { host } = await setup();
    const firstWrite = vi.fn();
    const secondWrite = vi.fn();
    const first = { name: 'original.txt', createWritable: async () => ({ write: firstWrite, close: async () => {} }) };
    const second = { name: 'original.txt', createWritable: async () => ({ write: secondWrite, close: async () => {} }) };
    const picker = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce({
      ...first, isSameEntry: async (other: unknown) => other === first,
    });
    (window as unknown as Record<string, unknown>).showSaveFilePicker = picker;
    const firstPath = await host.saveFile('original.txt');
    const secondPath = await host.saveFile('original.txt');
    expect(firstPath).toBe('/Documents/original (1).txt');
    expect(secondPath).toBe('/Documents/original (2).txt');
    expect(await host.saveFile('original.txt')).toBe(firstPath);
    await host.writeFile(firstPath!, 'first disk');
    await host.writeFile(secondPath!, 'second disk');
    expect(new TextDecoder().decode(firstWrite.mock.calls[0][0])).toBe('first disk');
    expect(new TextDecoder().decode(secondWrite.mock.calls[0][0])).toBe('second disk');
    expect(await host.readTextFile('/Documents/original.txt')).toBe('keep me');
  });

  it('does not delete a document for an unchanged or path-shaped rename', async () => {
    const { host, files, dir } = await setup();
    expect(await host.renameFile('/Documents/original.txt', 'original.txt')).toBe('/Documents/original.txt');
    expect(await host.renameFile('/Documents/original.txt', 'folder/original.txt')).toBeNull();
    expect(await host.renameFile('/Documents/original.txt', 'folder\\original.txt')).toBeNull();
    expect(files.has('original.txt')).toBe(true);
    expect(dir.removeEntry).not.toHaveBeenCalled();
  });

  it('rolls back a renamed copy if the original cannot be removed', async () => {
    const { host, files, dir } = await setup();
    dir.removeEntry.mockRejectedValueOnce(new Error('access denied'));
    expect(await host.renameFile('/Documents/original.txt', 'renamed.txt')).toBeNull();
    expect(files.has('original.txt')).toBe(true);
    expect(files.has('renamed.txt')).toBe(false);
  });

  it('surfaces read errors instead of treating an unreadable document as absent', async () => {
    const { host, dir } = await setup();
    dir.getFileHandle.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    await expect(host.readFile('/Documents/original.txt')).rejects.toThrow('denied');
  });

  it('lists supported documents in newest-first order, excluding inserted images and recipient data', async () => {
    const { host, files } = await setup();
    files.set('image.png', new Uint8Array([1]));
    files.set('recipients.csv', new Uint8Array([2]));
    files.set('newer.docx', new Uint8Array([3]));
    expect((await host.listDocuments('/Documents')).map(file => file.name)).toEqual(['newer.docx', 'original.txt']);
  });

  it('aborts a failed disk stream so the next save can acquire the file again', async () => {
    const { host } = await setup();
    let locked = false;
    let fail = true;
    const abort = vi.fn(async () => { locked = false; });
    (window as unknown as Record<string, unknown>).showSaveFilePicker = async () => ({
      name: 'retry.txt', createWritable: async () => {
        if (locked) throw new Error('locked');
        locked = true;
        return {
          write: async () => { if (fail) throw new Error('write failed'); },
          close: async () => { locked = false; },
          abort,
        };
      },
    });
    const target = await host.saveFile('retry.txt');
    expect(await host.writeFile(target!, 'first attempt')).toBe(false);
    expect(abort).toHaveBeenCalledOnce();
    fail = false;
    expect(await host.writeFile(target!, 'retry')).toBe(true);
  });
});
