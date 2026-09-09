import { test, expect } from '@playwright/test';
import { acceptAppDialogs, openBlankDocument, resetTestState, saveToPath, typeInEditor } from '../helpers/playwright';

for (const extension of ['officewrite', 'txt']) {
  test(`Save-and-close waits for overlapping ${extension} saves and leaves the newest snapshot on disk`, async ({ page }) => {
    acceptAppDialogs(page);
    await resetTestState(page);
    await openBlankDocument(page);
    await typeInEditor(page, 'Baseline');
    const path = `C:/OfficewriteTest/ordered.${extension}`;
    await saveToPath(page, path);

    await page.evaluate(() => {
      const root = document.documentElement;
      const write = window.officewrite.writeFile;
      let writes = 0;
      root.dataset.orderedWrites = '0';
      root.dataset.orderedClose = 'pending';
      window.officewrite.writeFile = async (...args) => {
        const sequence = ++writes;
        root.dataset.orderedWrites = String(sequence);
        await new Promise<void>(resolve => window.addEventListener(`release-write-${sequence}`, () => resolve(), { once: true }));
        return write(...args);
      };
      window.officewrite.closeNow = async proceed => {
        root.dataset.orderedClose = String(proceed);
        return true;
      };
    });

    await page.keyboard.press('Control+End');
    await page.keyboard.type(' earlier');
    await page.keyboard.press('Control+s');
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-ordered-writes', '1');

    await page.keyboard.type(' newer');
    await page.evaluate(() => window.__OFFICEWRITE_TEST__?.emitSaveAndClose());
    // Two rendering turns let the close handler schedule its save. No timing
    // delay controls completion: each write has an explicit release event.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(root).toHaveAttribute('data-ordered-writes', '1');
    await expect(root).toHaveAttribute('data-ordered-close', 'pending');

    await page.evaluate(() => window.dispatchEvent(new Event('release-write-1')));
    await expect(root).toHaveAttribute('data-ordered-writes', '2');
    const olderSnapshot = await page.evaluate(path => window.__OFFICEWRITE_TEST__?.readStoredFile(path), path);
    expect(olderSnapshot).toContain('Baseline earlier');
    expect(olderSnapshot).not.toContain('newer');
    await expect(page).toHaveTitle(`ordered.${extension} * - Officewrite`);
    await expect(root).toHaveAttribute('data-ordered-close', 'pending');

    await page.evaluate(() => window.dispatchEvent(new Event('release-write-2')));
    await expect(root).toHaveAttribute('data-ordered-close', 'true');
    await expect(page).toHaveTitle(`ordered.${extension} - Officewrite`);
    const latestSnapshot = await page.evaluate(path => window.__OFFICEWRITE_TEST__?.readStoredFile(path), path);
    expect(latestSnapshot).toContain('Baseline earlier newer');
    await expect(page.getByTestId('word-editor')).toHaveText('Baseline earlier newer');
  });
}
