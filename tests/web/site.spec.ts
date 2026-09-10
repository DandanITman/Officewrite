import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const releaseApi = 'https://api.github.com/repos/DandanITman/OfficeWrite/releases/latest';
const releasePage = 'https://github.com/DandanITman/OfficeWrite/releases/latest';

test.beforeEach(async ({ page }) => {
  // The 404 uses absolute assets so they resolve from any missing URL depth.
  await page.route('https://officewrite.com/site.css', route => route.fulfill({
    path: resolve('docs/site.css'), contentType: 'text/css',
  }));
  await page.route('https://officewrite.com/logo.png', route => route.fulfill({
    path: resolve('docs/logo.png'), contentType: 'image/png',
  }));
});

test('site tour loads every screenshot and supports keyboard navigation through Templates', async ({ page }) => {
  await page.route(releaseApi, route => route.fulfill({ status: 503, body: '' }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/content security policy/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('.topbar')).toHaveCSS('background-color', 'rgb(43, 87, 154)');
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
  let referrer: string | undefined = 'release request not received';
  await page.route(releaseApi, async route => {
    referrer = (await route.request().allHeaders()).referer;
    await route.fulfill({ json: {
      tag_name: 'v1.2.3', html_url: releasePage,
      assets: [{ name: 'Officewrite.Setup.1.2.3.exe', size: 104857600, browser_download_url: installer }],
    } });
  });
  await page.goto('/');
  await expect(page.locator('#download-btn')).toHaveAttribute('href', installer);
  await expect(page.locator('#download-btn-bottom')).toHaveAttribute('href', installer);
  await expect(page.locator('#download-btn-bottom')).toContainText('100.0 MB');
  expect(referrer).toBeUndefined();
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

for (const pathname of ['/', '/404.html']) {
  test(`site policy at ${pathname} blocks inline scripts and unapproved connections`, async ({ page }) => {
    await page.route(releaseApi, route => route.fulfill({ status: 503, body: '' }));
    let unapprovedRequests = 0;
    await page.route('https://untrusted.example/**', route => {
      unapprovedRequests++;
      return route.fulfill({
        body: 'unexpected connection', headers: { 'access-control-allow-origin': '*' },
      });
    });
    await page.goto(pathname);
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    const directives = new Map(policy?.split(';').map(directive => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources.join(' ')];
    }));
    expect(directives.get('default-src')).toBe("'none'");
    expect(directives.get('script-src')).toBe(pathname === '/' ? "'self'" : "'none'");
    expect(directives.get('connect-src')).toBe(pathname === '/' ? 'https://api.github.com' : "'none'");
    expect(directives.get('base-uri')).toBe("'none'");
    expect(directives.get('form-action')).toBe("'none'");
    expect(directives.get('object-src')).toBe("'none'");
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');

    const result = await page.evaluate(async () => {
      const script = document.createElement('script');
      script.textContent = 'document.documentElement.dataset.injectedScriptRan = "true"';
      document.head.append(script);
      const connectionBlocked = await fetch('https://untrusted.example/probe').then(() => false, () => true);
      return { inlineScriptRan: document.documentElement.dataset.injectedScriptRan, connectionBlocked };
    });
    expect(result.inlineScriptRan).toBeUndefined();
    expect(result.connectionBlocked).toBe(true);
    expect(unapprovedRequests).toBe(0);

    if (pathname === '/') {
      const structuredData = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() as string);
      expect(structuredData).toMatchObject({ '@type': 'SoftwareApplication', name: 'Officewrite' });
    } else {
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      await expect(page.locator('.topbar')).toHaveCSS('background-color', 'rgb(43, 87, 154)');
      await expect.poll(() => page.locator('.brand-logo').evaluate(image =>
        (image as HTMLImageElement).naturalWidth,
      )).toBeGreaterThan(0);
      await page.getByRole('link', { name: 'Go to the home page' }).click();
      await expect(page.getByRole('tablist', { name: 'Screenshots' })).toBeVisible();
    }
  });
}
