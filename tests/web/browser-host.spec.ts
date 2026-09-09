import { test, expect } from '@playwright/test';

test('production browser app saves DOCX to real storage and reopens after reload', async ({ page }) => {
  await page.addInitScript(() => {
    // Exercise the download fallback without opening an operating-system picker.
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByTestId('home-screen')).toBeVisible();
  expect(await page.evaluate(() => '__OFFICEWRITE_TEST__' in window)).toBe(false);
  await page.getByTestId('home-blank-template').click();
  const editor = page.getByTestId('word-editor');
  await editor.fill('Production browser document survives reload.');
  const downloaded = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  expect((await downloaded).suggestedFilename()).toMatch(/\.docx$/);
  await expect(page.getByTestId('editor-filename')).not.toContainText('*');
  const files = await page.evaluate(() => window.officewrite.listDocuments('/Documents'));
  const saved = files.find(file => file.name.endsWith('.docx'));
  expect(saved?.size).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page.getByTestId('home-screen').getByText(saved!.name, { exact: true }).first().dblclick();
  await expect(page.getByTestId('word-editor')).toContainText('Production browser document survives reload.');
  expect(errors).toEqual([]);
});

test('theme and document defaults survive production browser startup', async ({ page }) => {
  await page.goto('./');
  await page.locator('.home-sidebar-nav.secondary button').filter({ hasText: 'Dark mode' }).click();
  await expect.poll(() => page.evaluate(() => window.officewrite.getSettings())).toMatchObject({ theme: 'dark' });
  await page.evaluate(async () => {
    const settings = await window.officewrite.getSettings();
    await window.officewrite.setSettings({ ...settings!, defaultFontFamily: 'Georgia' });
  });
  await page.reload();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await expect(page.locator('.home-sidebar-nav.secondary button').filter({ hasText: 'Light mode' })).toBeVisible();
  expect(await page.evaluate(() => window.officewrite.getSettings())).toMatchObject({ theme: 'dark', defaultFontFamily: 'Georgia' });
});

test('real browser storage supports copy, rename, deletion, and saved versions', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('home-screen')).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = window.officewrite;
    await host.writeFile('/Documents/original.txt', 'browser file content');
    const copy = await host.copyFile('/Documents/original.txt');
    const renamed = await host.renameFile(copy!, 'renamed.txt');
    const text = await host.readTextFile(renamed!);
    const revision = await host.saveRevision(renamed!, { text }, 'Saved version');
    const restored = await host.loadRevision(renamed!, revision.id);
    const deleted = await host.trashFile(renamed!);
    return { copy, renamed, text, restored, deleted, files: await host.listDocuments('/Documents') };
  });
  expect(result).toMatchObject({
    copy: '/Documents/original (1).txt', renamed: '/Documents/renamed.txt',
    text: 'browser file content', restored: { text: 'browser file content' }, deleted: true,
  });
  expect(result.files.map(file => file.name)).toEqual(['original.txt']);
});

test('browser PDF export opens print without creating an empty disk file', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-blank-template').click();
  await page.getByTestId('word-editor').fill('Browser PDF content');
  await page.evaluate(() => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => { throw new Error('PDF export must use the print destination picker'); },
    });
    window.print = () => { document.documentElement.dataset.printRequested = 'true'; };
  });
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByTestId('file-menu-export').click();
  await page.getByTestId('export-pdf').click();
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');
  expect(await page.evaluate(() => window.officewrite.listDocuments('/Documents'))).toEqual([]);
});
