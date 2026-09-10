import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getSampleOfficewrite } from '../fixtures/fileFixtures';
import { launchApp, type LaunchedApp } from './helpers';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

test('native file opening blocks remote pictures and injected formatting while retaining editing', async ({}, testInfo) => {
  const file = JSON.parse(getSampleOfficewrite());
  file.content.content = [
    {
      type: 'paragraph',
      attrs: { lineHeight: '1;position:fixed;inset:0;z-index:2147483647;background:white;--injected:yes' },
      content: [{ type: 'text', text: 'Untrusted formatting' }],
    },
    {
      type: 'paragraph',
      attrs: { lineHeight: '1.5', textAlign: 'center' },
      content: [{ type: 'text', text: 'Ordinary formatting' }],
    },
    {
      type: 'image',
      attrs: { src: 'https://tracking.invalid/native-picture', alt: 'Remote diagram', allowExternal: true },
    },
  ];
  const filePath = testInfo.outputPath('untrusted.officewrite');
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(file), 'utf-8');

  launched = await launchApp();
  const page = launched.window;
  const requests: string[] = [];
  await page.route('https://tracking.invalid/**', route => {
    requests.push(route.request().url());
    return route.abort();
  });

  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("img-src 'self' data:");
  expect(policy).toContain("object-src 'none'");
  await expect(page.getByTestId('home-screen')).toBeVisible();

  // Replace only the OS picker; the visible Open command reads the real file.
  await launched.app.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, filePath);
  await page.keyboard.press('Control+o');

  const editor = page.getByTestId('word-editor');
  await expect(editor).toContainText('Untrusted formatting');
  await expect(page.locator('.blocked-document-image')).toContainText('Remote diagram');
  await expect(editor.locator('img[src^="https://tracking.invalid/"]')).toHaveCount(0);
  const untrusted = editor.locator('p').filter({ hasText: 'Untrusted formatting' });
  await expect(untrusted).not.toHaveCSS('position', 'fixed');
  expect(await untrusted.evaluate(element => getComputedStyle(element).getPropertyValue('--injected'))).toBe('');

  const ordinary = editor.locator('p').filter({ hasText: 'Ordinary formatting' });
  await expect(ordinary).toHaveCSS('text-align', 'center');
  await ordinary.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' remains editable');
  await expect(ordinary).toContainText('Ordinary formatting remains editable');
  expect(requests).toEqual([]);
});
