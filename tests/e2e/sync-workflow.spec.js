import { devices, expect, test } from '@playwright/test';

const appUrl = 'http://127.0.0.1:4173/';
const mockRemoteClient = `
window.commissioningRemote = (() => {
  const listeners = new Set();
  const membership = { organisationId: '11111111-1111-4111-8111-111111111111', role: 'administrator', organisationName: 'Plumbing Commissioning' };
  let state = localStorage.getItem('mock-authenticated') === 'true'
    ? { user: { id: 'user-1', email: 'simpic@gmail.com' }, membership, recovery: false }
    : { user: null, membership: null, recovery: false };
  const readRows = () => JSON.parse(localStorage.getItem('mock-server-records') || '[]');
  const writeRows = (rows) => localStorage.setItem('mock-server-records', JSON.stringify(rows));
  const emit = () => listeners.forEach((listener) => listener(state));
  const conflict = () => { const error = new Error('Record revision conflict'); error.code = '40001'; throw error; };
  return {
    enabled: true,
    initialise: async () => state,
    getState: () => state,
    isRecovery: () => false,
    onStateChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    signIn: async (email) => {
      localStorage.setItem('mock-authenticated', 'true');
      state = { user: { id: 'user-1', email }, membership, recovery: false };
      emit();
      return state;
    },
    signOut: async () => {
      localStorage.removeItem('mock-authenticated');
      state = { user: null, membership: null, recovery: false };
      emit();
      return state;
    },
    sendPasswordSetupEmail: async () => undefined,
    listRecords: async () => localStorage.getItem('mock-hide-server-records') === 'true' ? [] : readRows(),
    getRecord: async (_organisationId, remoteId) => readRows().find((row) => row.id === remoteId) || null,
    saveRecord: async ({ remoteId, record, expectedRevision }) => {
      const rows = readRows();
      const index = rows.findIndex((row) => row.id === remoteId);
      if ((expectedRevision === 0 && index >= 0) || (expectedRevision > 0 && rows[index]?.revision !== expectedRevision)) conflict();
      const saved = {
        id: remoteId,
        payload: record,
        revision: expectedRevision === 0 ? 1 : expectedRevision + 1,
        updated_at: new Date().toISOString(),
        deleted_at: null
      };
      if (index >= 0) rows[index] = saved; else rows.push(saved);
      writeRows(rows);
      return saved;
    },
    deleteRecord: async ({ remoteId, expectedRevision }) => {
      const rows = readRows();
      const index = rows.findIndex((row) => row.id === remoteId);
      if (index < 0 || rows[index].revision !== expectedRevision) conflict();
      rows[index] = { ...rows[index], revision: expectedRevision + 1, updated_at: new Date().toISOString(), deleted_at: new Date().toISOString() };
      writeRows(rows);
      return rows[index];
    }
  };
})();`;

async function createContext(browser, options = {}) {
  const context = await browser.newContext({ ...devices['iPhone 13'], ...options });
  await context.route('**/vendor/remote-client.min.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: mockRemoteClient }));
  return context;
}

async function signIn(page) {
  await page.getByRole('button', { name: 'Sign in' }).click();
  const form = page.locator('#signInForm');
  await form.getByLabel('Email').fill('simpic@gmail.com');
  await form.getByLabel('Password').fill('test-password');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Administrator' })).toBeVisible();
}

async function createRecord(page, siteName) {
  await page.getByRole('button', { name: 'New record' }).click();
  await page.locator('#customer').fill(siteName);
  await page.locator('#address').fill('10 Sync Street, Sydney NSW');
  await page.locator('#technician').fill('Sync Tester');
  await page.locator('#plantName').fill('Synced Plant');
  await page.locator('[data-unit-field="label"]').first().fill('SYNC-HWS-01');
  await page.locator('#outcome').selectOption('Passed');
  await page.getByRole('button', { name: 'Complete record' }).click();
}

test('uploads on one fresh device and downloads on another', async ({ browser }) => {
  const phoneContext = await createContext(browser);
  const phone = await phoneContext.newPage();
  await phone.goto(appUrl);
  await signIn(phone);
  await createRecord(phone, 'Cross-device Site');
  await expect(phone.locator('#syncStatus')).toHaveText('Synced just now');
  await expect(phone.locator('.record-card').filter({ hasText: 'Cross-device Site' })).toContainText('Saved by technician');
  await expect(phone.locator('.record-card').filter({ hasText: 'Cross-device Site' })).toContainText('Sync Tester');
  await expect(phone.locator('.record-card').filter({ hasText: 'Cross-device Site' })).toContainText('Sync details');
  await expect.poll(() => phone.evaluate(() => JSON.parse(localStorage.getItem('mock-server-records') || '[]').length)).toBe(1);
  const sharedState = await phoneContext.storageState();
  const serverRows = sharedState.origins
    .find((origin) => origin.origin === appUrl.slice(0, -1))?.localStorage
    .find((item) => item.name === 'mock-server-records');
  expect(JSON.parse(serverRows?.value || '[]')).toHaveLength(1);
  await phoneContext.close();

  const desktopContext = await createContext(browser, { storageState: sharedState, viewport: { width: 1280, height: 800 } });
  const desktop = await desktopContext.newPage();
  await desktop.goto(appUrl);
  await expect(desktop.locator('.record-card').filter({ hasText: 'Cross-device Site' })).toBeVisible();
  await expect(desktop.locator('#syncStatus')).toHaveText('Synced just now');
  await desktopContext.close();
});

test('does not upload existing local records merely because the user signs in', async ({ browser }) => {
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto(appUrl);
  await createRecord(page, 'Pre-existing Local Site');
  await signIn(page);
  await expect(page.locator('#syncStatus')).toHaveText('Synced just now');
  const localSyncDetails = page.locator('.record-card').filter({ hasText: 'Pre-existing Local Site' })
    .locator('.record-detail-column').filter({ hasText: 'Sync details' });
  await expect(localSyncDetails).toContainText('Local only');
  await expect(localSyncDetails).toContainText('Not synced');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mock-server-records') || '[]'))).toHaveLength(0);
  await context.close();
});

test('queues a signed-in edit offline and uploads after reconnecting', async ({ browser }) => {
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto(appUrl);
  await signIn(page);
  await context.setOffline(true);
  await createRecord(page, 'Offline Queue Site');
  await expect(page.locator('#syncStatus')).toHaveText('1 pending');
  await context.setOffline(false);
  await expect(page.locator('#syncStatus')).toHaveText('Synced just now');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mock-server-records') || '[]'))).toHaveLength(1);
  await context.close();
});

test('keeps a saved local record when a server list response omits it', async ({ browser }) => {
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto(appUrl);
  await signIn(page);
  await page.evaluate(() => localStorage.setItem('mock-hide-server-records', 'true'));
  await createRecord(page, 'Temporarily Hidden Site');

  await expect(page.locator('#syncStatus')).toHaveText('Synced just now');
  await expect(page.locator('.record-card').filter({ hasText: 'Temporarily Hidden Site' })).toBeVisible();
  await context.close();
});

test('preserves the local edit and reports a revision conflict', async ({ browser }) => {
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto(appUrl);
  await signIn(page);
  await createRecord(page, 'Original Site');
  await expect(page.locator('#syncStatus')).toHaveText('Synced just now');

  await page.locator('.record-card').filter({ hasText: 'Original Site' }).getByRole('button', { name: 'Open' }).click();
  await page.locator('#customer').fill('Local Conflicting Edit');
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('mock-server-records'));
    rows[0].revision = 2;
    rows[0].payload.job.siteName = 'Server Edit';
    rows[0].updated_at = new Date().toISOString();
    localStorage.setItem('mock-server-records', JSON.stringify(rows));
  });
  await page.getByRole('button', { name: 'Complete record' }).click();

  await expect(page.locator('#syncStatus')).toHaveText('1 conflict');
  await expect(page.locator('.record-card').filter({ hasText: 'Local Conflicting Edit' })).toBeVisible();
  await expect(page.locator('.record-card').filter({ hasText: 'Server Edit' })).toHaveCount(0);
  await context.close();
});
