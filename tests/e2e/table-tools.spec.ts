import { test, expect, type Page } from '@playwright/test';
import {
  resetTestState,
  openBlankDocument,
  switchRibbonTab,
  acceptAppDialogs,
  insertDefaultTable,
} from '../helpers/playwright';

const editor = (page: Page) => page.getByTestId('word-editor');

/** Insert the default 3x3 table and put the caret in its first body cell. */
async function insertTable(page: Page) {
  await insertDefaultTable(page);
  await editor(page).locator('table').waitFor({ state: 'visible' });
  await editor(page).locator('td').first().click();
}

/**
 * Click a table tool on the contextual Table Layout tab.
 *
 * The table commands live on a contextual tab that appears only while the
 * caret is inside a table, and Delete Row/Column/Table sit in a menu there.
 */
async function tableTool(page: Page, testId: string) {
  await switchRibbonTab(page, 'tableLayout');
  const inDeleteMenu = ['table-delete-row', 'table-delete-col', 'table-delete'].includes(testId);
  if (inDeleteMenu) await page.getByTestId('table-delete-menu').click();
  if (testId.startsWith('table-style-') && testId !== 'table-style-gallery') await page.getByTestId('table-style-gallery').click();
  await page.getByTestId(testId).click();
}

/**
 * The table tools had no coverage at all.
 *
 * Before this feature existed the app could insert a 3x3 table and never touch
 * it again - there was no way to add or remove a row or column, merge cells,
 * toggle a header row, or delete the table except with undo.
 */
test.describe('Table tools', () => {
  test.beforeEach(async ({ page }) => {
    acceptAppDialogs(page);
    await resetTestState(page);
    await openBlankDocument(page);
  });

  test('inserts exact dimensions with an optional header', async ({ page }) => {
    await switchRibbonTab(page, 'insert');
    await page.getByTestId('ribbon-table').click();
    await page.getByTestId('table-custom-columns').fill('4');
    await page.getByTestId('table-custom-rows').fill('9');
    await page.getByTestId('table-custom-header').uncheck();
    await page.getByTestId('table-custom-insert').click();
    await expect(editor(page).locator('tr')).toHaveCount(9);
    await expect(editor(page).locator('td')).toHaveCount(36);
    await expect(editor(page).locator('th')).toHaveCount(0);
    await switchRibbonTab(page, 'tableLayout');
    await expect(page.getByTestId('table-context-summary')).toHaveText('9 × 4 table');
  });

  test('table size grid supports directional keyboard selection', async ({ page }) => {
    await switchRibbonTab(page, 'insert');
    await page.getByTestId('ribbon-table').click();
    const first = page.getByRole('button', { name: '1 by 1 table', exact: true });
    await first.focus();
    await expect(page.locator('.rb-table-picker-label')).toHaveText('1 column × 1 row');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.rb-table-picker-label')).toHaveText('2 columns × 1 row');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: '2 by 2 table', exact: true })).toBeFocused();
    await expect(page.locator('.rb-table-picker-label')).toHaveText('2 columns × 2 rows');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('table-custom-columns')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: '2 by 2 table', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(editor(page).locator('tr')).toHaveCount(2);
    await expect(editor(page).locator('th,td')).toHaveCount(4);
  });

  test('styles render on the document and selection remains visible over shading', async ({ page }) => {
    await insertTable(page);
    await tableTool(page, 'table-style-bandedRows');
    await expect(editor(page).locator('table')).toHaveAttribute('data-table-style', 'bandedRows');
    const colors = await editor(page).locator('tr').evaluateAll((rows) => rows.slice(1).map((row) => getComputedStyle(row.querySelector('td')!).backgroundColor));
    expect(colors[0]).not.toBe(colors[1]);
    await page.getByTestId('table-select').click();
    await page.getByRole('menuitem', { name: 'Select Cell', exact: true }).click();
    await expect(editor(page).locator('.selectedCell')).toHaveCount(1);
    await expect(page.getByTestId('table-merge-cells')).toBeDisabled();
    await expect(page.getByTestId('table-split-cell')).toBeDisabled();
  });

  test('AutoFit restores page width after narrow columns', async ({ page }) => {
    await insertTable(page);
    await switchRibbonTab(page, 'tableLayout');
    await page.getByTestId('table-select').click();
    await page.getByRole('menuitem', { name: 'Select Table', exact: true }).click();
    await page.getByTestId('table-column-width').fill('0.4');
    await page.getByTestId('table-column-width').blur();
    const table = editor(page).locator('table');
    const before = await table.evaluate((el) => el.getBoundingClientRect().width);
    await page.getByTestId('table-autofit').click();
    await page.getByTestId('table-autofit-window').click();
    const sizes = await table.evaluate((el) => ({ width: el.getBoundingClientRect().width, parent: el.parentElement!.clientWidth }));
    expect(sizes.width).toBeGreaterThan(before);
    expect(Math.abs(sizes.width - sizes.parent)).toBeLessThan(6);
  });

  test('sorts whole rows from the selected column and preserves the header', async ({ page }) => {
    await insertTable(page);
    await page.keyboard.type('Zebra');
    await editor(page).locator('td').nth(3).click();
    await page.keyboard.type('Apple');
    await tableTool(page, 'table-sort');
    await page.getByRole('menuitem', { name: 'Ascending (A to Z)' }).click();
    await expect(editor(page).locator('tr').nth(1)).toContainText('Apple');
    await expect(editor(page).locator('tr').nth(2)).toContainText('Zebra');
    await expect(editor(page).locator('tr').first().locator('th')).toHaveCount(3);
  });

  for (const width of [1280, 900]) {
    test(`table controls remain inside the visible ribbon at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 860 });
      await insertTable(page);
      await switchRibbonTab(page, 'tableLayout');
      await expect.poll(async () => page.getByRole('tabpanel').evaluate((panel) => {
        const box = panel.getBoundingClientRect();
        return [...panel.querySelectorAll('button, input')].filter((control) => {
          const bounds = control.getBoundingClientRect();
          return bounds.width > 0 && (bounds.left < box.left - 1 || bounds.right > box.right + 1 || bounds.bottom > box.bottom + 1);
        }).map((control) => control.getAttribute('data-testid') || control.textContent);
      })).toEqual([]);
    });
  }

  test('wide tab labels cannot hide table tools behind the strip actions', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 860 });
    // Reproduce wider fallback-font metrics without depending on a host font.
    await page.addStyleTag({ content: '.office-ribbon-tabs .ribbon-tab { letter-spacing: 1.5px; }' });
    await insertTable(page);
    const tab = page.getByTestId('ribbon-tab-tableLayout');
    // The newly available tab must be revealed before any click scrolls it.
    await expect.poll(() => tab.evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      const strip = button.parentElement!.getBoundingClientRect();
      return bounds.left >= strip.left - 1 && bounds.right <= strip.right + 1;
    })).toBe(true);
    await switchRibbonTab(page, 'tableLayout');
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    const tabBounds = await tab.boundingBox();
    const actions = await page.locator('.ribbon-strip-actions').boundingBox();
    // Scroll offsets round to whole pixels while font measurements can be fractional.
    expect(tabBounds!.x + tabBounds!.width).toBeLessThanOrEqual(actions!.x + 1);
    await page.getByTestId('strip-comments').click();
    await expect(page.getByTestId('strip-comments')).toHaveClass(/is-active/);
    await page.getByTestId('strip-comments').click();
    await page.getByTestId('strip-editing-mode').click();
    await expect(page.getByTestId('editing-mode-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('ribbon-collapse').click();
    await expect(page.getByTestId('ribbon-layout-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await tab.focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('ribbon-tab-home')).toBeFocused();
    await page.keyboard.press('End');
    await expect(tab).toBeFocused();
    await expect(page.getByTestId('table-add-row-after')).toBeVisible();
  });

  test('the entire table panel reflows for wider fallback-font metrics', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 860 });
    await page.addStyleTag({ content: '[role="tabpanel"], [role="tabpanel"] * { font-family: Arial, sans-serif !important; letter-spacing: 1.5px !important; }' });
    await insertTable(page);
    await switchRibbonTab(page, 'tableLayout');
    const panel = page.getByRole('tabpanel');
    await expect.poll(() => panel.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [...element.querySelectorAll('button, input')].filter((control) => {
        const bounds = control.getBoundingClientRect();
        return bounds.width > 0 && (bounds.left < box.left - 1 || bounds.right > box.right + 1 || bounds.top < box.top - 1 || bounds.bottom > box.bottom + 1);
      }).map((control) => control.getAttribute('data-testid') || control.textContent);
    })).toEqual([]);
    const groupRows = await panel.locator(':scope > .rb-group').evaluateAll(groups => new Set(groups.map(group => Math.round(group.getBoundingClientRect().top))).size);
    expect(groupRows).toBeGreaterThan(1);
    await page.getByTestId('table-style-gallery').click();
    await page.getByTestId('table-style-bandedRows').click();
    await expect(editor(page).locator('table')).toHaveAttribute('data-table-style', 'bandedRows');
    await page.getByTitle('Cell Shading', { exact: true }).click();
    await expect(page.locator('.color-picker-popover')).toBeVisible();
  });

  test('TC-TBL-001: the table tools appear only when the caret is in a table', async ({ page }) => {
    await switchRibbonTab(page, 'insert');
    await expect(page.getByTestId('ribbon-tab-tableLayout')).toHaveCount(0);

    await insertTable(page);
    // The contextual tab activates on entering the table.
    await expect(page.getByTestId('ribbon-tab-tableLayout')).toBeVisible();
    await switchRibbonTab(page, 'tableLayout');
    await expect(page.getByTestId('table-add-row-after')).toBeVisible();
  });

  test('TC-TBL-002: inserts a row above and below', async ({ page }) => {
    await insertTable(page);
    // 3x3 with a header row: 1 header row + 2 body rows.
    await expect(editor(page).locator('tr')).toHaveCount(3);

    await tableTool(page, 'table-add-row-before');
    await expect(editor(page).locator('tr')).toHaveCount(4);

    await editor(page).locator('td').first().click();
    await tableTool(page, 'table-add-row-after');
    await expect(editor(page).locator('tr')).toHaveCount(5);
  });

  test('TC-TBL-003: deletes a row', async ({ page }) => {
    await insertTable(page);
    await expect(editor(page).locator('tr')).toHaveCount(3);

    await tableTool(page, 'table-delete-row');
    await expect(editor(page).locator('tr')).toHaveCount(2);
  });

  test('TC-TBL-004: inserts a column left and right', async ({ page }) => {
    await insertTable(page);
    await expect(editor(page).locator('tr').first().locator('th, td')).toHaveCount(3);

    await tableTool(page, 'table-add-col-before');
    await expect(editor(page).locator('tr').first().locator('th, td')).toHaveCount(4);

    await editor(page).locator('td').first().click();
    await tableTool(page, 'table-add-col-after');
    await expect(editor(page).locator('tr').first().locator('th, td')).toHaveCount(5);
  });

  test('TC-TBL-005: deletes a column', async ({ page }) => {
    await insertTable(page);
    await expect(editor(page).locator('tr').first().locator('th, td')).toHaveCount(3);

    await tableTool(page, 'table-delete-col');
    await expect(editor(page).locator('tr').first().locator('th, td')).toHaveCount(2);
  });

  test('TC-TBL-006: merges cells across a selection', async ({ page }) => {
    await insertTable(page);

    // Select the first two cells of the first body row.
    const cells = editor(page).locator('td');
    await cells.nth(0).click();
    await cells.nth(1).click({ modifiers: ['Shift'] });

    await tableTool(page, 'table-merge-cells');

    await expect(editor(page).locator('td[colspan="2"]')).toHaveCount(1);
  });

  test('TC-TBL-007: splits a merged cell again', async ({ page }) => {
    await insertTable(page);

    const cells = editor(page).locator('td');
    await cells.nth(0).click();
    await cells.nth(1).click({ modifiers: ['Shift'] });
    await tableTool(page, 'table-merge-cells');
    await expect(editor(page).locator('td[colspan="2"]')).toHaveCount(1);

    await editor(page).locator('td[colspan="2"]').click();
    await tableTool(page, 'table-split-cell');
    await expect(editor(page).locator('td[colspan="2"]')).toHaveCount(0);
  });

  test('TC-TBL-008: toggles the header row', async ({ page }) => {
    await insertTable(page);
    await expect(editor(page).locator('th')).toHaveCount(3);

    // Toggling from the first body cell converts that row into headers.
    await tableTool(page, 'table-toggle-header');
    await expect(editor(page).locator('th')).not.toHaveCount(3);
  });

  test('TC-TBL-009: deletes the whole table', async ({ page }) => {
    await insertTable(page);
    await expect(editor(page).locator('table')).toHaveCount(1);

    await tableTool(page, 'table-delete');
    await expect(editor(page).locator('table')).toHaveCount(0);
  });

  /**
   * "Select Table" used to run selectAll(), so it selected the whole document.
   * Typing straight after it destroyed everything outside the table.
   */
  test('TC-TBL-011: Select Table selects the table, not the document', async ({ page }) => {
    await page.getByTestId('word-editor').click();
    await page.keyboard.type('Keep this paragraph');
    await page.keyboard.press('Enter');
    await insertTable(page);

    await switchRibbonTab(page, 'tableLayout');
    await page.getByTestId('table-select').click();
    await page.getByRole('menuitem', { name: 'Select Table' }).click();
    await page.keyboard.type('x');

    // The paragraph outside the table must survive.
    await expect(editor(page)).toContainText('Keep this paragraph');
  });

  /**
   * the Cell Size group. There was no way to give a column a specific
   * width at all - the only width control reset them.
   */
  test('TC-TBL-012: column width and row height can be set explicitly', async ({ page }) => {
    await insertTable(page);
    await switchRibbonTab(page, 'tableLayout');

    const before = await editor(page).locator('td').first().evaluate((el) => el.getBoundingClientRect().width);

    await page.getByTestId('table-column-width').fill('3');
    await page.getByTestId('table-column-width').blur();

    await expect
      .poll(async () =>
        editor(page).locator('td').first().evaluate((el) => Math.round(el.getBoundingClientRect().width)),
      )
      .not.toBe(Math.round(before));
  });

  test('TC-TBL-013: distribute columns evens the widths', async ({ page }) => {
    await insertTable(page);
    await switchRibbonTab(page, 'tableLayout');
    await page.getByTestId('table-column-width').fill('1');
    await page.getByTestId('table-column-width').blur();

    await page.getByTestId('table-distribute-columns').click();

    const widths = await editor(page)
      .locator('tr')
      .first()
      .locator('td, th')
      .evaluateAll((cells) => cells.map((c) => Math.round(c.getBoundingClientRect().width)));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
  });

  /**
   * Distribute measured the FIRST table in the document, not the caret's, so
   * in a two-table document it sized the second from the first one's width and
   * wrote widths the table could not hold - persisted through save.
   */
  test('TC-TBL-014: distribute sizes the caret table, not the first one', async ({ page }) => {
    await insertTable(page);
    // A second, narrower table below the first.
    await page.getByTestId('word-editor').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await insertDefaultTable(page);

    const tables = page.getByTestId('word-editor').locator('table');
    await expect(tables).toHaveCount(2);

    // Narrow the first table's columns so the two tables differ in width.
    await tables.first().locator('td').first().click();
    await switchRibbonTab(page, 'tableLayout');
    await page.getByTestId('table-column-width').fill('1');
    await page.getByTestId('table-column-width').blur();

    // Distribute the SECOND table; it must not inherit the first's width.
    await tables.nth(1).locator('td').first().click();
    await switchRibbonTab(page, 'tableLayout');
    await page.getByTestId('table-distribute-columns').click();

    const secondWidth = await tables.nth(1).evaluate((el) => el.getBoundingClientRect().width);
    const cells = await tables
      .nth(1)
      .locator('tr')
      .first()
      .locator('td, th')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    const summed = cells.reduce((total, width) => total + width, 0);
    // The columns should still add up to their own table, not a narrower one.
    expect(Math.abs(summed - secondWidth)).toBeLessThanOrEqual(8);
  });

  /**
   * The Cell Size group measures the caret's cell on every render, and
   * prosemirror-tables' selectedRect THROWS outside a table rather than
   * returning null. The Table Layout panel renders for a frame after the caret
   * leaves, so clicking out of a table took the entire app to a blank screen.
   */
  test('TC-TBL-015: clicking out of a table does not crash the app', async ({ page }) => {
    await page.getByTestId('word-editor').click();
    await page.keyboard.type('above the table');
    await page.keyboard.press('Enter');
    await insertTable(page);
    await switchRibbonTab(page, 'tableLayout');

    await page.getByTestId('word-editor').locator('> p').first().click();

    // The app must still be there.
    await expect(page.getByTestId('ribbon')).toBeVisible();
    await expect(page.getByTestId('word-editor')).toBeVisible();
  });

  test('TC-TBL-010: typed cell content survives a structural edit', async ({ page }) => {
    await insertTable(page);
    await page.keyboard.type('kept text');
    // AutoCorrect capitalises the sentence's first word.
    await expect(editor(page).locator('td').first()).toContainText('Kept text');

    await editor(page).locator('td').first().click();
    await tableTool(page, 'table-add-row-after');

    await expect(editor(page).locator('td').first()).toContainText('Kept text');
  });
});
