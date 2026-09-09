import { test, expect } from '@playwright/test';

const releaseApi = 'https://api.github.com/repos/DandanITman/OfficeWrite/releases/latest';
const releasePage = 'https://github.com/DandanITman/OfficeWrite/releases/latest';

test('site tour loads every screenshot and supports keyboard navigation through Templates', async ({ page }) => {
  await page.route(releaseApi, route => route.fulfill({ status: 503, body: '' }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const tabs = page.getByRole('tablist', { name: 'Screenshots' }).getByRole('tab');
  const image = page.locator('#tour-image');
  const panel = page.getByRole('tabpanel');
  for (const tab of await tabs.all()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toHaveAttribute('aria-labelledby', await tab.getAttribute('id') as string);
    await expect(image).toHaveAttribute('alt', `Officewrite: ${(await tab.innerText()).trim()}`);
    const shot = await tab.getAttribute('data-shot');
    await expect(image).toHaveAttribute('src', `shots/${shot}.png`);
    await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  const first = tabs.first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  const templates = page.getByRole('tab', { name: 'Templates', exact: true });
  await expect(templates).toBeFocused();
  await expect(templates).toHaveAttribute('aria-selected', 'true');
  await expect(image).toHaveAttribute('src', 'shots/templates.png');
  await page.keyboard.press('End');
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(first).toBeFocused();
  expect(errors).toEqual([]);
});

test('site download buttons resolve the installer asset', async ({ page }) => {
  const installer = 'https://github.com/DandanITman/OfficeWrite/releases/download/v1.2.3/Officewrite.Setup.1.2.3.exe';
  await page.route(releaseApi, route => route.fulfill({ json: {
    tag_name: 'v1.2.3', html_url: releasePage,
    assets: [{ name: 'Officewrite.Setup.1.2.3.exe', size: 104857600, browser_download_url: installer }],
  } }));
  await page.goto('/');
  await expect(page.locator('#download-btn')).toHaveAttribute('href', installer);
  await expect(page.locator('#download-btn-bottom')).toHaveAttribute('href', installer);
  await expect(page.locator('#download-btn-bottom')).toContainText('100.0 MB');
});

test('Templates remains reachable on a phone-sized website layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(releaseApi, route => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Templates', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toHaveAccessibleName('Templates');
  await expect.poll(() => page.locator('#tour-image').evaluate(img =>
    (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
  )).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const status of [404, 503]) {
  test(`site keeps usable download links after release API HTTP ${status}`, async ({ page }) => {
    await page.route(releaseApi, route => route.fulfill({ status, body: '' }));
    await page.goto('/');
    for (const selector of ['#download-btn', '#download-btn-bottom']) {
      await expect(page.locator(selector)).toHaveAttribute('href', releasePage);
      await expect(page.locator(selector)).toHaveText('View releases');
    }
  });
}
