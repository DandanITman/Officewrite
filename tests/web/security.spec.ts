import { test, expect } from '@playwright/test';
import { getSampleOfficewrite } from '../fixtures/fileFixtures';

test('production native documents cannot turn formatting into covering CSS or remote fills', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }));
  const requests: string[] = [];
  await page.route('https://tracking.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
  const file = JSON.parse(getSampleOfficewrite());
  file.content.content = [
    { type: 'paragraph', attrs: { lineHeight: '1;position:fixed;inset:0;z-index:2147483647;background:white;--injected:yes' }, content: [{ type: 'text', text: 'Untrusted formatting' }] },
    { type: 'paragraph', attrs: { lineHeight: '1.5', textAlign: 'center' }, content: [{ type: 'text', text: 'Ordinary formatting', marks: [{ type: 'textStyle', attrs: { fontSize: '14pt', color: '#123456' } }] }] },
    { type: 'textBox', attrs: { fill: 'url(https://tracking.invalid/fill)' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text box content' }] }] },
  ];
  await page.goto('./');
  await expect(page.getByTestId('home-screen')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles({ name: 'formatting.officewrite', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  const editor = page.getByTestId('word-editor');
  await expect(editor).toContainText('Untrusted formatting');
  const paragraph = editor.locator('p').filter({ hasText: 'Untrusted formatting' });
  await expect(paragraph).not.toHaveCSS('position', 'fixed');
  expect(await paragraph.evaluate(el => getComputedStyle(el).getPropertyValue('--injected'))).toBe('');
  await expect(editor.locator('p').filter({ hasText: 'Ordinary formatting' })).toHaveCSS('text-align', 'center');
  await expect(page.getByTestId('text-box')).toHaveCSS('background-image', 'none');
  expect(requests).toEqual([]);
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' remains editable');
  await expect(editor).toContainText('Untrusted formatting remains editable');
});

test('production browser policy allows normal editing and blocks external document pictures', async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  await page.addInitScript(() => Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }));
  await page.route('https://tracking.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("img-src 'self' data:");
  expect(policy).toContain("object-src 'none'");
  await expect(page.getByTestId('home-screen')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles({ name: 'privacy.html', mimeType: 'text/html', buffer: Buffer.from('<p>Private browser document</p><img src="https://tracking.invalid/production" alt="Blocked diagram">') });
  await expect(page.getByTestId('word-editor')).toContainText('Private browser document');
  await expect(page.locator('.blocked-document-image')).toContainText('Blocked diagram');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
