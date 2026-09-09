import { test, expect } from '@playwright/test';
import {
  resetTestState,
  openBlankDocument,
  typeInEditor,
  focusEditor,
  switchRibbonTab,
  seedAllSampleFiles,
  openSeededFile,
  saveToPath,
  goHome,
  openBackstage,
  fileMenu,
  acceptAppDialogs,
  dismissAlert,
  answerPrompt,
  answerConfirm,
  setAutoSaveInterval,
  PATHS,
} from '../helpers/playwright';
import { getSampleDocxBase64, getSampleOfficewrite } from '../fixtures/fileFixtures';

test.describe('File and document lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    acceptAppDialogs(page);
    await resetTestState(page);
    await seedAllSampleFiles(page);
  });

  test('TC-FILE-003: opens .docx through Ctrl+O', async ({ page }) => {
    await openSeededFile(page, PATHS.docx);
    await expect(page.getByTestId('word-editor')).toContainText('Imported sample paragraph');
  });

  test('TC-FILE-005: opens .txt file', async ({ page }) => {
    await openSeededFile(page, PATHS.txt);
    await expect(page.getByTestId('word-editor')).toContainText('Plain text line one');
  });

  test('TC-FILE-006: opens .rtf file', async ({ page }) => {
    await openSeededFile(page, PATHS.rtf);
    await expect(page.getByTestId('word-editor')).toContainText('Imported sample paragraph');
  });

  test('opens .officewrite native file', async ({ page }) => {
    await openSeededFile(page, PATHS.officewrite);
    await expect(page.getByTestId('word-editor')).toContainText('Imported sample paragraph');
  });

  test('native saves preserve endnotes, sources, citation style and editing restrictions', async ({ page }) => {
    const extras = {
      endnotes: [{ id: 'note-1', text: 'Endnote text' }],
      sources: [{ id: 'source-1', type: 'book', author: 'Example Author', title: 'Example Book', year: '2026', tag: 'Ex26' }],
      citationStyle: 'mla',
      restrictEditing: true,
      styleSetId: 'modern',
    };
    const source = JSON.stringify({ ...JSON.parse(getSampleOfficewrite()), ...extras });
    await page.evaluate(({ path, source }) => window.__OFFICEWRITE_TEST__?.seedFile(path, source), { path: PATHS.officewrite, source });
    await openSeededFile(page, PATHS.officewrite);
    await saveToPath(page, PATHS.officewrite);
    const saved = await page.evaluate((path) => window.__OFFICEWRITE_TEST__?.readStoredFile(path), PATHS.officewrite);
    expect(JSON.parse(saved!)).toMatchObject(extras);
    await goHome(page);
    await openSeededFile(page, PATHS.officewrite);
    await expect(page.getByTestId('restrict-banner')).toBeVisible();
    await expect(page.locator('.doc-endnotes')).toContainText('Endnote text');
  });

  test('New and Open let users cancel before losing unsaved changes', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Keep this unsaved text');
    await page.keyboard.press('Control+n');
    await answerConfirm(page, false);
    await expect(page.getByTestId('word-editor')).toContainText('Keep this unsaved text');
    await page.evaluate((path) => window.__OFFICEWRITE_TEST__?.setOpenFileResult(path), PATHS.txt);
    await page.keyboard.press('Control+o');
    await answerConfirm(page, false);
    await expect(page.getByTestId('word-editor')).toContainText('Keep this unsaved text');
    await page.evaluate((path) => window.__OFFICEWRITE_TEST__?.setOpenFileResult(path), PATHS.txt);
    await page.keyboard.press('Control+o');
    await answerConfirm(page, true);
    await expect(page.getByTestId('word-editor')).toContainText('Plain text line one');
    await expect(page).toHaveTitle(/sample\.txt - Officewrite/);
  });

  test('TC-FILE-008: opens legacy .doc with text fallback', async ({ page }) => {
    await page.evaluate(() => {
      window.__OFFICEWRITE_TEST__?.seedFile('C:\\OfficewriteTest\\legacy.doc', 'placeholder');
      window.__OFFICEWRITE_TEST__?.setImportDocResult({
        format: 'text',
        data: 'Legacy extracted text',
        source: 'extractor',
        warning: 'LibreOffice not installed',
      });
    });
    await openSeededFile(page, PATHS.doc);
    await expect(page.getByTestId('word-editor')).toContainText('Legacy extracted text');
  });

  test('opens legacy .doc via LibreOffice DOCX conversion mock', async ({ page }) => {
    const docxB64 = await getSampleDocxBase64();
    await page.evaluate(
      ({ b64 }) => {
        window.__OFFICEWRITE_TEST__?.seedFile('C:\\OfficewriteTest\\legacy.doc', 'placeholder');
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        window.__OFFICEWRITE_TEST__?.setImportDocResult({
          format: 'docx',
          data: bytes.buffer,
          source: 'libreoffice',
        });
      },
      { b64: docxB64 },
    );
    await openSeededFile(page, PATHS.doc);
    await expect(page.getByTestId('word-editor')).toContainText('Imported sample paragraph');
  });

  test('saves as .docx by default', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'DOCX save test');
    await saveToPath(page, PATHS.savedDocx);
    const b64 = await page.evaluate(
      (path) => window.__OFFICEWRITE_TEST__?.readStoredBinaryBase64(path),
      PATHS.savedDocx,
    );
    expect(b64).toBeTruthy();
    expect(b64!.startsWith('UEsDB')).toBe(true);
  });

  test('saves as plain .txt stripping formatting', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Plain only');
    await focusEditor(page);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+b');
    await saveToPath(page, PATHS.savedTxt);
    const saved = await page.evaluate(
      (path) => window.__OFFICEWRITE_TEST__?.readStoredFile(path),
      PATHS.savedTxt,
    );
    expect(saved).toBe('Plain only');
    expect(saved).not.toContain('bold');
  });

  test('saves as .rtf', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'RTF export');
    await saveToPath(page, PATHS.savedRtf);
    const saved = await page.evaluate(
      (path) => window.__OFFICEWRITE_TEST__?.readStoredFile(path),
      PATHS.savedRtf,
    );
    expect(saved).toContain('RTF export');
    expect(saved).toContain('\\rtf');
  });

  test('TC-FILE-007: saves as .html', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'HTML export');
    await saveToPath(page, PATHS.savedHtml);
    const saved = await page.evaluate(
      (path) => window.__OFFICEWRITE_TEST__?.readStoredFile(path),
      PATHS.savedHtml,
    );
    expect(saved).toContain('HTML export');
    expect(saved!.toLowerCase()).toContain('<html');
  });

  test('saves as native .officewrite with revision history', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Native format');
    await saveToPath(page, PATHS.savedOfficewrite);
    const saved = await page.evaluate(
      (path) => window.__OFFICEWRITE_TEST__?.readStoredFile(path),
      PATHS.savedOfficewrite,
    );
    expect(saved).toContain('Native format');
    expect(saved).toContain('"version"');
    await typeInEditor(page, ' updated');
    await saveToPath(page, PATHS.savedOfficewrite);
    const revisions = await page.evaluate(
      (path) => window.officewrite.listRevisions(path),
      PATHS.savedOfficewrite,
    );
    expect(revisions.length).toBeGreaterThanOrEqual(1);
  });

  test('TC-FILE-004: exports DOCX from backstage', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Backstage export');
    await openBackstage(page, 'export');
    await page.evaluate((p) => window.__OFFICEWRITE_TEST__?.setSaveFileResult(p), PATHS.savedDocx);
    await page.getByTestId('export-docx').click();
    await expect
      .poll(async () =>
        page.evaluate(
          (path) => window.__OFFICEWRITE_TEST__?.readStoredBinaryBase64(path),
          PATHS.savedDocx,
        ),
      )
      .not.toBeNull();
  });

  test('TC-FILE-012: shows dirty asterisk then clears after save', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Dirty doc');
    await expect(page.getByTestId('editor-filename')).toContainText('*');
    await saveToPath(page, PATHS.savedDocx);
    await expect(page.getByTestId('editor-filename')).not.toContainText('*');
  });

  test('TC-FILE-020: Ctrl+S saves document', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Keyboard save');
    await page.evaluate((p) => window.__OFFICEWRITE_TEST__?.setSaveFileResult(p), PATHS.savedDocx);
    await page.keyboard.press('Control+s');
    await expect
      .poll(async () =>
        page.evaluate((path) => window.__OFFICEWRITE_TEST__?.readStoredBinaryBase64(path), PATHS.savedDocx),
      )
      .not.toBeNull();
  });

  test('Ctrl+N creates new blank document', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Old doc');
    await page.keyboard.press('Control+n');
    await answerConfirm(page, true);
    await expect(page.getByTestId('word-editor')).not.toContainText('Old doc');
  });

  test('Ctrl+O opens seeded file', async ({ page }) => {
    await openBlankDocument(page);
    await page.evaluate((p) => window.__OFFICEWRITE_TEST__?.setOpenFileResult(p), PATHS.txt);
    await page.keyboard.press('Control+o');
    await expect(page.getByTestId('word-editor')).toContainText('Plain text line one');
  });

  test('TC-FILE-011: auto-saves after interval when file has path', async ({ page }) => {
    await openBlankDocument(page);
    await saveToPath(page, PATHS.savedDocx);
    await setAutoSaveInterval(page, 400);
    await typeInEditor(page, ' auto');
    await expect
      .poll(
        async () => {
          const b64 = await page.evaluate(
            (path) => window.__OFFICEWRITE_TEST__?.readStoredBinaryBase64(path),
            PATHS.savedDocx,
          );
          return b64?.length ?? 0;
        },
        { timeout: 5000 },
      )
      .toBeGreaterThan(100);
  });

  test('TC-FILE-013: adds saved file to recent documents on home', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Recent me');
    await saveToPath(page, PATHS.recentDoc);
    await goHome(page);
    await expect(page.getByTestId('home-recent-row')).toContainText('recent.docx');
  });

  test('TC-FILE-014: pins document to favorites tab', async ({ page }) => {
    await openBlankDocument(page);
    await saveToPath(page, PATHS.pinnedDoc);
    await goHome(page);
    await page.getByTestId('home-recent-row').getByTitle('Pin to favorites').click();
    await page.getByTestId('home-tab-favorites').click();
    await expect(page.getByTestId('home-recent-row')).toContainText('pinned.officewrite');
  });

  test('browse folder opens first document', async ({ page }) => {
    await page.getByRole('button', { name: /Browse folder/i }).click();
    await expect(page.getByTestId('word-editor')).toContainText('Folder doc one');
  });

  test('TC-FILE-015: restores version from backstage history', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Version one');
    await saveToPath(page, PATHS.savedOfficewrite);
    await page.evaluate(() =>
      window.__OFFICEWRITE_TEST__?.loadEditorContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Version two' }] }],
      }),
    );
    await saveToPath(page, PATHS.savedOfficewrite);
    await openBackstage(page, 'history');
    await page.getByRole('button', { name: 'Restore' }).first().click();
    await expect(page.getByTestId('word-editor')).toContainText('Version one');
  });

  test('TC-FILE-019: edits metadata in backstage Info and persists in .officewrite save', async ({ page }) => {
    await openBlankDocument(page);
    await openBackstage(page, 'info');
    await page.getByLabel('Title').fill('My Title');
    await page.getByLabel('Author').fill('Test Author');
    await page.getByRole('button', { name: /Back to document/i }).click();
    await saveToPath(page, PATHS.savedOfficewrite);
    const saved = await page.evaluate(
      (path) => window.__OFFICEWRITE_TEST__?.readStoredFile(path),
      PATHS.savedOfficewrite,
    );
    expect(saved).toContain('My Title');
    expect(saved).toContain('Test Author');
  });

  test('navigates all backstage sections', async ({ page }) => {
    await openBlankDocument(page);
    await openBackstage(page);
    for (const section of ['info', 'new', 'open', 'save', 'export', 'print', 'history', 'options']) {
      await page.getByTestId(`backstage-nav-${section}`).click();
      await expect(page.getByTestId('backstage')).toBeVisible();
    }
  });

  test('mock PDF export records Electron call', async ({ page }) => {
    await openBlankDocument(page);
    await page.evaluate((p) => window.__OFFICEWRITE_TEST__?.setSaveFileResult(p), PATHS.pdf);
    // File > Export opens the backstage, where the formats live.
    await openBackstage(page, 'export');
    await page.getByTestId('export-pdf').click();
    await expect
      .poll(async () => page.evaluate(() => window.__OFFICEWRITE_TEST__?.getExportPdfCallCount()))
      .toBe(1);
  });

  test('mock print records Electron call', async ({ page }) => {
    await openBlankDocument(page);
    await fileMenu(page, 'print');
    await expect
      .poll(async () => page.evaluate(() => window.__OFFICEWRITE_TEST__?.getPrintCallCount()))
      .toBe(1);
  });

  test('cancels first save dialog without writing file', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Cancel save');
    await page.evaluate(() => window.__OFFICEWRITE_TEST__?.setSaveFileResult(null));
    await page.keyboard.press('Control+s');
    const files = await page.evaluate(() => window.__OFFICEWRITE_TEST__?.listStoredFiles() ?? []);
    expect(files.filter((f) => f.includes('Cancel'))).toHaveLength(0);
  });

  test('TC-FILE-016: loads business letter template', async ({ page }) => {
    await page.getByTestId('home-template-letter').click();
    await expect(page.getByTestId('word-editor')).toContainText('Dear [Recipient]');
  });

  test('TC-FILE-017: loads report template with headings', async ({ page }) => {
    await page.getByTestId('home-template-report').click();
    await expect(page.getByTestId('word-editor')).toContainText('Report Title');
    await expect(page.getByTestId('word-editor')).toContainText('Introduction');
  });

  test('TC-FILE-018: loads resume template', async ({ page }) => {
    await page.getByTestId('home-template-resume').click();
    await expect(page.getByTestId('word-editor')).toContainText('Experience');
    await expect(page.getByTestId('word-editor')).toContainText('Education');
  });
});

test.describe('File dialog alerts', () => {
  test.beforeEach(async ({ page }) => {
    await resetTestState(page);
  });

  for (const entryPoint of ['keyboard', 'file menu', 'backstage'] as const) {
    test(`reports printer failures from ${entryPoint}`, async ({ page }) => {
      await openBlankDocument(page);
      await page.evaluate(() => {
        window.officewrite.printDocument = async () => { throw new Error('Printer unavailable'); };
      });
      if (entryPoint === 'keyboard') await page.keyboard.press('Control+p');
      else if (entryPoint === 'file menu') await fileMenu(page, 'print');
      else {
        await openBackstage(page, 'print');
        await page.getByTestId('print-confirm').click();
      }
      await dismissAlert(page, /Printing failed.*Printer unavailable/);
      await expect(page.getByTestId('word-editor')).toBeVisible();
    });
  }

  for (const failure of ['false result', 'exception'] as const) {
    test(`failed saves retain unsaved content after ${failure}`, async ({ page }) => {
      await openBlankDocument(page);
      await typeInEditor(page, 'Unsaved text');
      await page.evaluate(({ path, failure }) => {
        window.__OFFICEWRITE_TEST__?.setSaveFileResult(path);
        window.officewrite.writeFile = async () => {
          if (failure === 'exception') throw new Error('Disk unavailable');
          return false;
        };
      }, { path: PATHS.savedDocx, failure });
      await page.keyboard.press('Control+s');
      await dismissAlert(page, /Could not save the document/);
      await expect(page).toHaveTitle('Untitled * - Officewrite');
      await expect(page.getByTestId('word-editor')).toContainText('Unsaved text');
      expect(await page.evaluate((path) => window.__OFFICEWRITE_TEST__?.readStoredFile(path), PATHS.savedDocx)).toBeNull();
    });
  }

  for (const picker of ['openFile', 'saveFile', 'openImageFile', 'openDataFile'] as const) {
    test(`shows ${picker} errors without losing the current document`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await openBlankDocument(page);
      await typeInEditor(page, 'Keep this document');
      await page.evaluate((method) => {
        window.officewrite[method] = async () => { throw new Error('Permission denied while selecting the file'); };
      }, picker);
      if (picker === 'openFile') await page.keyboard.press('Control+o');
      else if (picker === 'saveFile') await page.keyboard.press('Control+s');
      else if (picker === 'openImageFile') {
        await switchRibbonTab(page, 'insert');
        await page.getByTestId('ribbon-pictures').click();
      } else {
        await switchRibbonTab(page, 'mailings');
        await page.getByTestId('mailings-select-recipients').click();
        await page.getByTestId('mailings-existing-list').click();
      }
      await dismissAlert(page, /Could not select the file.*Permission denied/);
      await expect(page.getByTestId('word-editor')).toContainText('Keep this document');
      await expect(page).toHaveTitle('Untitled * - Officewrite');
      expect(errors).toEqual([]);
    });
  }

  test('reports an unavailable default save folder and keeps edits unsaved', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Keep this document');
    await page.evaluate(() => {
      window.officewrite.getDefaultSaveDir = async () => { throw new Error('Default folder is unavailable'); };
    });
    await page.keyboard.press('Control+s');
    await dismissAlert(page, /Could not select the file.*Default folder is unavailable/);
    await expect(page).toHaveTitle('Untitled * - Officewrite');
    await expect(page.getByTestId('word-editor')).toContainText('Keep this document');
  });

  test('reports PDF export failures and keeps the source document', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'PDF source content');
    await page.evaluate((path) => {
      window.__OFFICEWRITE_TEST__?.setSaveFileResult(path);
      window.officewrite.exportPdf = async () => { throw new Error('Output file is locked'); };
    }, PATHS.pdf);
    await openBackstage(page, 'export');
    await page.getByTestId('export-pdf').click();
    await dismissAlert(page, /Could not export the PDF.*Output file is locked/);
    await expect(page).toHaveTitle('Untitled * - Officewrite');
  });

  for (const operation of ['rename', 'copy'] as const) {
    test(`reports ${operation} permission failures without losing the saved document`, async ({ page }) => {
      await openBlankDocument(page);
      await typeInEditor(page, 'Saved document');
      await saveToPath(page, PATHS.savedDocx);
      await page.evaluate((operation) => {
        window.officewrite[operation === 'rename' ? 'renameFile' : 'copyFile'] = async () => { throw new Error('Access denied'); };
      }, operation);
      await fileMenu(page, operation);
      if (operation === 'rename') await answerPrompt(page, 'Renamed document');
      await dismissAlert(page, new RegExp(`Could not ${operation}.*Access denied`));
      await expect(page.getByTestId('word-editor')).toContainText('Saved document');
      await expect(page).toHaveTitle('saved.docx - Officewrite');
    });
  }

  test('failed deletion keeps the open document and unsaved edits', async ({ page }) => {
    await openBlankDocument(page);
    await saveToPath(page, PATHS.savedDocx);
    await typeInEditor(page, 'Keep unsaved edits');
    await page.evaluate(() => { window.officewrite.trashFile = async () => false; });
    await fileMenu(page, 'delete');
    await answerConfirm(page, true);
    await dismissAlert(page, /Could not delete the document/);
    await expect(page.getByTestId('word-editor')).toContainText('Keep unsaved edits');
    await expect(page).toHaveTitle(/\* - Officewrite$/);
  });

  for (const nextAction of ['edit', 'new document'] as const) {
    test(`a delayed save preserves newer ${nextAction}`, async ({ page }) => {
      await openBlankDocument(page);
      await typeInEditor(page, 'Original snapshot');
      const path = 'C:/OfficewriteTest/delayed.officewrite';
      await page.evaluate((path) => {
        window.__OFFICEWRITE_TEST__?.setSaveFileResult(path);
        const write = window.officewrite.writeFile;
        window.officewrite.writeFile = async (...args) => {
          await new Promise<void>((resolve) => {
            window.addEventListener('release-delayed-save', () => resolve(), { once: true });
            document.documentElement.dataset.savePending = 'true';
          });
          return write(...args);
        };
      }, path);
      await page.keyboard.press('Control+s');
      await expect(page.locator('html')).toHaveAttribute('data-save-pending', 'true');
      if (nextAction === 'new document') {
        await page.keyboard.press('Control+n');
        await answerConfirm(page, true);
      } else {
        await page.keyboard.press('Control+End');
      }
      await typeInEditor(page, ' Latest changes');
      await page.evaluate(() => window.dispatchEvent(new Event('release-delayed-save')));
      await expect.poll(async () => page.evaluate(async (path) => (await window.officewrite.listRevisions(path)).length, path)).toBe(1);
      await expect(page).toHaveTitle(nextAction === 'edit' ? 'delayed.officewrite * - Officewrite' : 'Untitled * - Officewrite');
      await expect(page.getByTestId('word-editor')).toContainText('Latest changes');
      const saved = await page.evaluate((path) => window.__OFFICEWRITE_TEST__?.readStoredFile(path), path);
      expect(saved).toContain('Original snapshot');
      expect(saved).not.toContain('Latest changes');
    });
  }

  test('alerts on unsupported file type', async ({ page }) => {
    await openBlankDocument(page);
    await page.evaluate(() => {
      window.__OFFICEWRITE_TEST__?.seedFile('C:/OfficewriteTest/bad.xyz', 'data');
      window.__OFFICEWRITE_TEST__?.setOpenFileResult('C:/OfficewriteTest/bad.xyz');
    });
    await page.keyboard.press('Control+o');
    // The in-app dialog, not window.alert: uiPrompt no longer has a test-mode
    // branch, so tests and users now travel the same path.
    await dismissAlert(page, /Unsupported file type/i);
  });

  test('TC-FILE-023: reports a corrupted .officewrite file instead of failing silently', async ({ page }) => {
    await page.evaluate(() => {
      window.__OFFICEWRITE_TEST__?.seedFile('C:/OfficewriteTest/bad.officewrite', '{not json');
      window.__OFFICEWRITE_TEST__?.setOpenFileResult('C:/OfficewriteTest/bad.officewrite');
    });
    await page.locator('.home-sidebar-nav').getByRole('button', { name: 'Open' }).click();
    // Previously this asserted only that the home screen was still visible --
    // which it was because JSON.parse threw an unhandled rejection. The app now
    // reports the problem.
    await dismissAlert(page, /corrupted/i);
    await expect(page.getByTestId('home-screen')).toBeVisible();
  });

  test('reports a corrupted DOCX and preserves the current unsaved document', async ({ page }) => {
    await openBlankDocument(page);
    await typeInEditor(page, 'Keep this document');
    await page.evaluate(() => {
      const path = 'C:/OfficewriteTest/corrupt.docx';
      window.__OFFICEWRITE_TEST__?.seedBinaryFile(path, btoa('not a DOCX archive'));
      window.__OFFICEWRITE_TEST__?.setOpenFileResult(path);
    });
    await page.keyboard.press('Control+o');
    await dismissAlert(page, /Could not open the document/);
    await expect(page.getByTestId('word-editor')).toContainText('Keep this document');
    await expect(page).toHaveTitle('Untitled * - Officewrite');
  });

  for (const malformed of ['unknown node', 'unknown mark', 'invalid nesting'] as const) {
    test(`rejects native ${malformed} without adopting a blank document`, async ({ page }) => {
      await openBlankDocument(page);
      await typeInEditor(page, 'Keep this document');
      await page.evaluate((malformed) => {
        const text = { type: 'text', text: 'Recover this content', ...(malformed === 'unknown mark' ? { marks: [{ type: 'unsupportedMark' }] } : {}) };
        const paragraph = { type: 'paragraph', content: [text] };
        const block = malformed === 'unknown node' ? { ...paragraph, type: 'unsupportedNode' }
          : malformed === 'invalid nesting' ? { type: 'paragraph', content: [paragraph] } : paragraph;
        const path = 'C:/OfficewriteTest/malformed.officewrite';
        window.__OFFICEWRITE_TEST__?.seedFile(path, JSON.stringify({ version: 3, content: { type: 'doc', content: [block] } }));
        window.__OFFICEWRITE_TEST__?.setOpenFileResult(path);
      }, malformed);
      await page.keyboard.press('Control+o');
      await dismissAlert(page, /corrupted/i);
      await expect(page.getByTestId('word-editor')).toContainText('Keep this document');
      await expect(page).toHaveTitle('Untitled * - Officewrite');
    });
  }

  test('asks before discarding edits made while another document is loading', async ({ page }) => {
    await seedAllSampleFiles(page);
    await openBlankDocument(page);
    await page.evaluate((path) => {
      window.__OFFICEWRITE_TEST__?.setOpenFileResult(path);
      const read = window.officewrite.readTextFile;
      window.officewrite.readTextFile = async (target) => {
        if (target.replace(/\\/g, '/') === path) await new Promise<void>(resolve => {
          window.addEventListener('release-delayed-open', () => resolve(), { once: true });
          document.documentElement.dataset.openPending = 'true';
        });
        return read(target);
      };
    }, PATHS.txt);
    await page.keyboard.press('Control+o');
    await expect(page.locator('html')).toHaveAttribute('data-open-pending', 'true');
    await typeInEditor(page, 'Changes made while loading');
    await page.evaluate(() => window.dispatchEvent(new Event('release-delayed-open')));
    await answerConfirm(page, false);
    await expect(page.getByTestId('word-editor')).toContainText('Changes made while loading');
    await expect(page).toHaveTitle('Untitled * - Officewrite');
  });

  test('ignores a stale open after a newer document has already opened', async ({ page }) => {
    await seedAllSampleFiles(page);
    await openBlankDocument(page);
    await page.evaluate((path) => {
      window.__OFFICEWRITE_TEST__?.setOpenFileResult(path);
      const read = window.officewrite.readTextFile;
      window.officewrite.readTextFile = async (target) => {
        if (target.replace(/\\/g, '/') === path) await new Promise<void>(resolve => {
          window.addEventListener('release-delayed-open', () => resolve(), { once: true });
          document.documentElement.dataset.openPending = 'true';
        });
        const result = await read(target);
        if (target.replace(/\\/g, '/') === path) document.documentElement.dataset.openComplete = 'true';
        return result;
      };
    }, PATHS.txt);
    await page.keyboard.press('Control+o');
    await expect(page.locator('html')).toHaveAttribute('data-open-pending', 'true');
    await page.evaluate((path) => window.__OFFICEWRITE_TEST__?.setOpenFileResult(path), PATHS.officewrite);
    await page.keyboard.press('Control+o');
    await expect(page).toHaveTitle('sample.officewrite - Officewrite');
    await page.evaluate(() => window.dispatchEvent(new Event('release-delayed-open')));
    await expect(page.locator('html')).toHaveAttribute('data-open-complete', 'true');
    await expect(page).toHaveTitle('sample.officewrite - Officewrite');
    await expect(page.getByTestId('word-editor')).toContainText('Imported sample paragraph');
  });
});
