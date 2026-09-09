import { ipcMain, type BrowserWindow } from 'electron';
import { writeFileAtomically } from '../atomicFile';
import { importDocFile } from '../docImport';
import { checkWords, suggestWord } from '../spell';
import { addToUserDictionary, getUserDictionary, isKnownWord } from '../userDictionary';

/** Printing, PDF export, legacy .doc conversion and spell check. */
export function registerOutputIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('print:document', async (_e, options?: { copies?: number; pageRange?: string }) => {
    const win = getWindow();
    if (!win) return false;

    // The Print pane sets copies and a page range before the OS dialog.
    // The UI uses page numbers; Electron expects zero-based inclusive indexes.
    const pageRanges = (options?.pageRange ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
        const from = Number(match?.[1]);
        const to = Number(match?.[2] ?? match?.[1]);
        if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to < from) {
          throw new Error('Enter a valid page range, such as 1-3, 5.');
        }
        return { from: from - 1, to: to - 1 };
      });

    const copies = options?.copies ?? 1;
    if (!Number.isSafeInteger(copies) || copies < 1) throw new Error('Enter a positive number of copies.');
    return new Promise<boolean>((resolve, reject) => {
      win.webContents.print({
        copies,
        ...(pageRanges.length ? { pageRanges } : {}),
      }, (success, failureReason) => {
        if (success) resolve(true);
        else if (/cancel/i.test(failureReason)) resolve(false);
        else reject(new Error(failureReason || 'Printing failed.'));
      });
    });
  });

  ipcMain.handle('export:pdf', async (_e, savePath?: string, pageSize?: string) => {
    const win = getWindow();
    if (!win) return null;

    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      // The page box, including its margins, comes from the @page rule the
      // renderer injects for the document's page setup.
      preferCSSPageSize: true,
      pageSize: (pageSize as 'A4' | 'Letter' | 'Legal') ?? 'Letter',
      margins: { marginType: 'none' },
    });

    if (savePath) {
      await writeFileAtomically(savePath, pdf);
    }
    return pdf;
  });

  ipcMain.handle('import:doc', async (_e, filePath: string) => importDocFile(filePath));

  ipcMain.handle('spell:checkWords', async (_e, words: string[], language?: string) => {
    const results = await checkWords(words, language ?? 'en-US');
    // Words the user added are correct regardless of what the dictionary says.
    return Promise.all(
      results.map(async (correct, i) => correct || isKnownWord(words[i] ?? '')),
    );
  });

  ipcMain.handle('spell:getUserDictionary', async () => getUserDictionary());

  ipcMain.handle('spell:addWord', async (_e, word: string) => addToUserDictionary(word));

  ipcMain.handle('spell:suggest', async (_e, word: string, language?: string) =>
    suggestWord(word, language ?? 'en-US'),
  );
}
