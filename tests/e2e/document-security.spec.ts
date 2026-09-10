import { test, expect } from '@playwright/test';
import { resetTestState, openSeededFile, openBlankDocument, grantClipboard } from '../helpers/playwright';
import { getSampleOfficewrite, TINY_PNG_BASE64 } from '../fixtures/fileFixtures';

test('HTML open blocks remote resources before rendering while retaining embedded pictures', async ({ page }) => {
  const requests: string[] = [];
  await page.route('https://tracking.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
  await resetTestState(page);
  const html = `<p>Safe imported text</p><img src="https://tracking.invalid/pixel" srcset="https://tracking.invalid/large 2x" alt="Remote diagram"><iframe src="https://tracking.invalid/frame"></iframe><img src="data:image/png;base64,${TINY_PNG_BASE64}" alt="Embedded diagram">`;
  await page.evaluate((content) => window.__OFFICEWRITE_TEST__?.seedFile('C:/OfficewriteTest/security.html', content), html);
  await openSeededFile(page, 'C:/OfficewriteTest/security.html');
  await expect(page.getByTestId('word-editor')).toContainText('Safe imported text');
  await expect(page.locator('.blocked-document-image')).toContainText('Picture blocked');
  await expect(page.locator('.blocked-document-image')).toContainText('Remote diagram');
  await expect.poll(() => page.getByAltText('Embedded diagram').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(requests).toEqual([]);
});

test('native documents cannot authorize remote pictures and copying never creates a loading image', async ({ page }) => {
  const requests: string[] = [];
  await page.route('https://tracking.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
  await resetTestState(page);
  await grantClipboard(page);
  const file = JSON.parse(getSampleOfficewrite());
  file.content.content.push({ type: 'image', attrs: { src: 'https://tracking.invalid/native', alt: 'Remote diagram', allowExternal: true } });
  await page.evaluate((content) => window.__OFFICEWRITE_TEST__?.seedFile('C:/OfficewriteTest/security.officewrite', content), JSON.stringify(file));
  await openSeededFile(page, 'C:/OfficewriteTest/security.officewrite');
  await expect(page.locator('.blocked-document-image')).toContainText('Remote diagram');
  await page.getByTestId('word-editor').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  const clipboard = await page.evaluate(async () => {
    for (const item of await navigator.clipboard.read()) if (item.types.includes('text/html')) return (await item.getType('text/html')).text();
    return '';
  });
  expect(clipboard).toContain('data-blocked-image');
  expect(clipboard).not.toContain('<img');
  expect(requests).toEqual([]);
});

test('HTML pasted through the keyboard stays inert before the editor parses it', async ({ page }) => {
  const requests: string[] = [];
  await page.route('https://tracking.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
  await resetTestState(page);
  await openBlankDocument(page);
  await grantClipboard(page);
  await page.evaluate(async () => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob(['<p>Pasted text</p><img src="https://tracking.invalid/paste" alt="Pasted diagram">'], { type: 'text/html' }),
  })]));
  await page.getByTestId('word-editor').click();
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('word-editor')).toContainText('Pasted text');
  await expect(page.locator('.blocked-document-image')).toContainText('Pasted diagram');
  expect(requests).toEqual([]);
});

test('header control characters remain CSS string data without adding screen rules', async ({ page }) => {
  await resetTestState(page);
  const file = JSON.parse(getSampleOfficewrite());
  file.headerFooter = {
    header: 'Title\n\r\f"; } } body { --injected: yes; } /*\\',
    footer: 'Page %p of %P', showPageNumbers: false,
  };
  await page.evaluate((content) => window.__OFFICEWRITE_TEST__?.seedFile('C:/OfficewriteTest/header.officewrite', content), JSON.stringify(file));
  await openSeededFile(page, 'C:/OfficewriteTest/header.officewrite');
  const result = await page.evaluate(() => {
    const style = document.getElementById('officewrite-print-styles') as HTMLStyleElement;
    return {
      injected: getComputedStyle(document.body).getPropertyValue('--injected'),
      rules: Array.from(style.sheet!.cssRules).map(rule => rule.cssText),
      source: style.textContent,
    };
  });
  expect(result.injected).toBe('');
  expect(result.rules[0]).toContain('@page');
  expect(result.source).toContain('counter(page)');
  expect(result.source).toContain('counter(pages)');
  expect(result.rules.filter(rule => rule.startsWith('body'))).toEqual([]);
});
