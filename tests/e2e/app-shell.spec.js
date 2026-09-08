import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#networkStatus')).toHaveText('Online');
});

test('shows the current release without horizontal overflow', async ({ page }) => {
  await expect(page).toHaveTitle('Plumbing Commissioning');
  await expect(page.getByText('v0.4.5', { exact: true })).toBeVisible();
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
  const ignoredEnvironmentResponse = await request.get('/.env.live-tests');
  expect(ignoredEnvironmentResponse.status()).toBe(403);

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
  expect(workerSource).toContain("plumbing-commissioning-v0.4.5-fresh-sync");
  expect(workerSource).toContain("'./storage.js?v=0.4.5-fresh-sync'");
  expect(workerSource).toContain("'./sync.js?v=0.4.5-fresh-sync'");
  expect(workerSource).toContain("'./vendor/dexie.min.js?v=0.4.5-fresh-sync'");
  expect(workerSource).toContain("'./vendor/remote-client.min.js?v=0.4.5-fresh-sync'");
  expect(workerSource).not.toMatch(/APP_SHELL[\s\S]*config\.js[\s\S]*\];/);
  expect(workerSource).toContain("pathname.endsWith('/config.js')");
  expect(workerSource).toContain('CONFIG_CACHE_NAME');
  expect(workerSource).toContain("cache.add(CONFIG_URL)");
  expect(workerSource).toContain('cache.put(event.request, response.clone())');
});

test('registers a service worker that controls the application shell and caches public config', async ({ page }) => {
  const registration = await page.evaluate(async () => {
    const readyRegistration = await navigator.serviceWorker.ready;
    return readyRegistration.active?.scriptURL;
  });
  expect(registration).toMatch(/\/service-worker\.js$/);

  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Commissioning records' })).toBeVisible();

  const cachedConfig = await page.evaluate(async () => {
    const cacheName = (await caches.keys()).find((name) => name.endsWith('-public-config'));
    if (!cacheName) return null;
    const response = await (await caches.open(cacheName)).match('./config.js?v=0.4.5-fresh-sync');
    return response?.text() || null;
  });
  expect(cachedConfig).toBe('window.PLUMBING_APP_CONFIG = Object.freeze({});\n');
});

test('a controlled page receives fresh remote additions and deletions without reloading', async ({ page }) => {
  let records = ['original'];
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    response.end(JSON.stringify(records));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const url = `http://127.0.0.1:${server.address().port}/rest/v1/commissioning_records`;
    const readRecords = () => page.evaluate(async (endpoint) => (await fetch(endpoint)).json(), url);
    expect(await readRecords()).toEqual(['original']);
    records = ['original', 'new phone record'];
    expect(await readRecords()).toEqual(records);
    records = [];
    expect(await readRecords()).toEqual([]);
    expect(await page.evaluate(async (endpoint) => Boolean(await caches.match(endpoint)), url)).toBe(false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
