import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { launchApp, openBlankDocument, type LaunchedApp } from './helpers';

let launched: LaunchedApp | undefined;
test.afterEach(async () => { await launched?.close(); launched = undefined; });

async function exportFromBackstage(application: LaunchedApp, target: string) {
  // Control only the OS destination picker; exercise the actual Export command.
  await application.app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, target);
  await application.window.getByTestId('ribbon-tab-file').click();
  await application.window.getByTestId('file-menu-export').click();
  await application.window.getByTestId('export-pdf').click();
  await expect.poll(() => existsSync(target)).toBe(true);
}

for (const id of ['invoice', 'projectbrief', 'creativebrief']) {
  test(`exports the styled ${id} template with the native PDF engine`, async ({}, testInfo) => {
    launched = await launchApp();
    const page = launched.window;
    await page.getByTestId('home-nav-new').click();
    await page.getByTestId(`home-template-${id}`).click();
    await expect(page.getByTestId('word-editor')).toBeVisible();
    await expect(page.getByTestId('word-editor').locator('table').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const target = testInfo.outputPath(`${id}.pdf`);
    await exportFromBackstage(launched, target);
    const bytes = readFileSync(target);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(bytes.byteLength).toBeGreaterThan(1000);
    await testInfo.attach(`${id} PDF`, { path: target, contentType: 'application/pdf' });
  });
}

test('exports a long document across multiple PDF pages', async ({}, testInfo) => {
  launched = await launchApp();
  await openBlankDocument(launched.window);
  await launched.window.getByTestId('word-editor').click();
  await launched.window.keyboard.insertText(Array.from({ length: 100 }, (_, index) =>
    `Paragraph ${index + 1}: A long document must continue onto the next printed page without clipping its content.`,
  ).join('\n'));
  const target = testInfo.outputPath('multipage.pdf');
  await exportFromBackstage(launched, target);
  const bytes = readFileSync(target);
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  expect((bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThan(2);
  await testInfo.attach('Multipage PDF', { path: target, contentType: 'application/pdf' });
});
