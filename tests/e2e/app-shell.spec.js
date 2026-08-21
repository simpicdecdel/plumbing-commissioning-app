import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#networkStatus')).toHaveText('Online');
});

test('shows the current release without horizontal overflow', async ({ page }) => {
  await expect(page).toHaveTitle('Plumbing Commissioning');
  await expect(page.getByText('v0.4.2', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Commissioning records' })).toBeVisible();

  const layout = await page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    headerOverflow: document.querySelector('.app-header').scrollWidth > document.querySelector('.app-header').clientWidth,
    userAgent: navigator.userAgent,
    viewportWidth: window.innerWidth
  }));

  expect(layout.documentOverflow).toBe(false);
  expect(layout.headerOverflow).toBe(false);
  expect(layout.userAgent).toContain('iPhone');
  expect(layout.viewportWidth).toBe(390);
});

test('serves a valid installable shell', async ({ request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    name: 'Plumbing Commissioning',
    display: 'standalone',
    start_url: './'
  });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192' }),
    expect.objectContaining({ sizes: '512x512' })
  ]));

  const workerResponse = await request.get('/service-worker.js');
  expect(workerResponse.ok()).toBe(true);
  const workerSource = await workerResponse.text();
  expect(workerSource).toContain("plumbing-commissioning-v0.4.2-password-reset");
  expect(workerSource).toContain("'./storage.js?v=0.4.2-password-reset'");
  expect(workerSource).toContain("'./sync.js?v=0.4.2-password-reset'");
  expect(workerSource).toContain("'./vendor/dexie.min.js?v=0.4.2-password-reset'");
  expect(workerSource).toContain("'./vendor/remote-client.min.js?v=0.4.2-password-reset'");
  expect(workerSource).not.toMatch(/APP_SHELL[\s\S]*config\.js[\s\S]*\];/);
  expect(workerSource).toContain("pathname.endsWith('/config.js')");
});

test('registers a service worker that controls the application shell', async ({ page }) => {
  const registration = await page.evaluate(async () => {
    const readyRegistration = await navigator.serviceWorker.ready;
    return readyRegistration.active?.scriptURL;
  });
  expect(registration).toMatch(/\/service-worker\.js$/);

  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Commissioning records' })).toBeVisible();
});
