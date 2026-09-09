import { expect, test } from '@playwright/test';
import { resetTestState } from '../helpers/playwright';

test.beforeEach(async ({ page }) => { await resetTestState(page); });

test('prints templates without workspace offsets, clipping containers or table scrollbars', async ({ page }) => {
  await page.getByTestId('home-nav-new').click();
  await page.getByTestId('home-template-invoice').click();
  await expect(page.getByTestId('word-editor').locator('table')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  const layout = await page.evaluate(() => {
    const printArea = document.querySelector<HTMLElement>('.print-area')!;
    const table = printArea.querySelector<HTMLTableElement>('table')!;
    table.querySelector('th')!.classList.add('row-resize-target');
    const wrapper = table.closest('.tableWrapper')!;
    const ancestors: Array<{ display: string; overflow: string; background: string }> = [];
    let node = printArea.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      ancestors.push({ display: style.display, overflow: style.overflow, background: style.backgroundColor });
      node = node.parentElement;
    }
    return {
      top: printArea.getBoundingClientRect().top,
      left: printArea.getBoundingClientRect().left,
      ancestors,
      wrapperOverflow: getComputedStyle(wrapper).overflow,
      tableWidth: table.getBoundingClientRect().width,
      documentWidth: printArea.getBoundingClientRect().width,
      columns: [...table.querySelectorAll('col')].map(column => column.style.getPropertyValue('--print-column-width')),
      ribbonDisplay: getComputedStyle(document.querySelector('[data-testid="ribbon"]')!).display,
      resizeDecoration: getComputedStyle(table.querySelector('.row-resize-target')!, '::after').display,
      pageBackground: [...(document.getElementById('officewrite-print-styles') as HTMLStyleElement).sheet!.cssRules]
        .find(rule => rule instanceof CSSPageRule && !rule.selectorText)?.cssText,
    };
  });
  // The template intentionally gives its first heading 4px of paragraph spacing.
  expect(layout.top).toBeLessThanOrEqual(4);
  expect(layout.left).toBe(0);
  expect(layout.ancestors.every(style => style.display === 'block' && style.overflow === 'visible')).toBe(true);
  expect(layout.ancestors.every(style => style.background === 'rgb(255, 255, 255)')).toBe(true);
  expect(layout.wrapperOverflow).toBe('visible');
  expect(layout.tableWidth).toBeLessThanOrEqual(layout.documentWidth + 1);
  expect(layout.columns.every(width => width.endsWith('%'))).toBe(true);
  expect(layout.ribbonDisplay).toBe('none');
  expect(layout.resizeDecoration).toBe('none');
  expect(layout.pageBackground).toContain('background: rgb(255, 255, 255)');
});

test('flows a long document across actual PDF pages', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    const path = 'C:/OfficewriteTest/multipage.officewrite';
    const content = { type: 'doc', content: Array.from({ length: 100 }, (_, index) => ({
      type: 'paragraph', content: [{ type: 'text', text: `Paragraph ${index + 1}. This content must continue onto another printed page instead of being clipped by the editor viewport.` }],
    })) };
    window.__OFFICEWRITE_TEST__?.seedFile(path, JSON.stringify({ version: 3, content }));
    window.__OFFICEWRITE_TEST__?.setOpenFileResult(path);
  });
  await page.keyboard.press('Control+o');
  await expect(page.getByTestId('word-editor')).toContainText('Paragraph 100.');
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? [];
  expect(pages.length).toBeGreaterThan(1);
  await testInfo.attach('multipage PDF', { body: pdf, contentType: 'application/pdf' });
});

for (const columnCount of [1, 2]) test(`keeps explicit page breaks with ${columnCount} print columns`, async ({ page }) => {
  await page.evaluate((count) => {
    const path = 'C:/OfficewriteTest/columns.officewrite';
    const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    window.__OFFICEWRITE_TEST__?.seedFile(path, JSON.stringify({
      version: 3,
      pageSetup: { columns: { count, gap: 24, line: true } },
      content: { type: 'doc', content: [paragraph('First printed page'), { type: 'pageBreak' }, paragraph('Second printed page')] },
    }));
    window.__OFFICEWRITE_TEST__?.setOpenFileResult(path);
  }, columnCount);
  await page.keyboard.press('Control+o');
  await expect(page.getByTestId('word-editor')).toContainText('Second printed page');
  await page.emulateMedia({ media: 'print' });
  const columns = await page.getByTestId('word-editor').evaluate(element => getComputedStyle(element).columnCount);
  expect(columns).toBe(columnCount === 1 ? 'auto' : '2');
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(2);
});
