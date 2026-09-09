import { expect, test } from '@playwright/test';
import { mockRemoteClient } from '../helpers/mock-remote.js';

test.use({ serviceWorkers: 'block' });
const organisationId = '11111111-1111-4111-8111-111111111111';
const member = (role = 'administrator', org = organisationId) => ({ user: { id: 'user-1', email: 'test@example.invalid' }, membership: { organisationId: org, role, organisationName: 'Test Team' } });
const legacyRecord = { id: 'legacy-test', schemaVersion: 2, job: { siteName: 'Legacy local' }, plant: {}, units: [], results: {}, status: 'Completed', updatedAt: '2026-09-01T00:00:00Z' };

test.beforeEach(async ({ page }) => {
  await page.route('**/vendor/remote-client.min.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: mockRemoteClient }));
  await page.goto('/');
});

test('signed-out records are hidden and pending work returns after re-login', async ({ page, context }) => {
  await page.evaluate((state) => window.testSetAccess(state), member());
  await page.getByRole('button', { name: 'New record' }).click();
  await page.locator('#customer').fill('Pending private record');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#syncStatus')).toContainText('1 pending');
  await page.evaluate(() => window.testSetAccess({ user: null, membership: null }));
  await expect(page.locator('.record-card')).toHaveCount(0);
  await expect(page.locator('#formView')).toBeHidden();
  await expect(page.locator('#newRecordButton')).toBeDisabled();
  await expect(page.locator('#exportButton')).toBeDisabled();
  await page.evaluate((state) => window.testSetAccess(state), member());
  await expect(page.locator('.record-card')).toContainText('Pending private record');
  await context.setOffline(false);
  await expect(page.locator('#syncStatus')).toContainText('Synced');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mock-server-records')))).toHaveLength(1);
});

test('technicians cannot delete or restore and other organisations cannot see cached records', async ({ page }) => {
  await page.evaluate((state) => window.testSetAccess(state), member());
  await page.getByRole('button', { name: 'New record' }).click();
  await page.locator('#customer').fill('Private team record');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Back to records' }).click();
  await page.evaluate((state) => window.testSetAccess(state), member('technician'));
  await expect(page.locator('.record-card')).toContainText('Private team record');
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.locator('#restoreButton')).toBeHidden();
  await expect(page.locator('#deletedButton')).toBeHidden();
  const denied = await page.evaluate(async () => {
    const record = (await commissioningStore.listRecords())[0];
    try { await commissioningSync.queueDelete(record.id); return false; } catch { return true; }
  });
  expect(denied).toBe(true);
  await page.evaluate((state) => { localStorage.setItem('mock-hide-server-records', 'true'); window.testSetAccess(state); }, member('administrator', '22222222-2222-4222-8222-222222222222'));
  await expect(page.locator('.record-card')).toHaveCount(0);
});

test('local upload requires a downloaded backup and explicit confirmation', async ({ page }, testInfo) => {
  // An earlier IndexedDB record with no central sync entry.
  await page.evaluate((record) => commissioningStore.saveRecord(record), legacyRecord);
  await page.evaluate((state) => window.testSetAccess(state), member());
  await expect(page.locator('.record-card')).toContainText('Legacy local');
  for (const width of [390, 800, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Upload local records', exact: true }).click();
  expect(await page.locator('#uploadDialog').evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('upload-dialog.png') });
  await expect(page.locator('#confirmUploadButton')).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  expect((await download).suggestedFilename()).toContain('backup');
  await expect(page.locator('#confirmUploadButton')).toBeDisabled();
  await page.locator('#uploadBackupConfirmed').check();
  await page.getByRole('button', { name: 'Confirm upload' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mock-server-records') || '[]').length)).toBe(1);
  await expect(page.locator('#syncStatus')).toContainText('Synced');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mock-server-records')))).toHaveLength(1);
});

test('an interrupted draft remains private to its account and organisation', async ({ page }) => {
  await page.evaluate((state) => window.testSetAccess(state), member());
  await page.getByRole('button', { name: 'New record' }).click();
  await page.locator('#customer').fill('Unfinished private draft');
  await page.evaluate((state) => window.testSetAccess(state), member('administrator', '22222222-2222-4222-8222-222222222222'));
  await page.getByRole('button', { name: 'New record' }).click();
  await expect(page.locator('#customer')).toHaveValue('');
  await page.evaluate((state) => window.testSetAccess(state), member());
  await page.getByRole('button', { name: 'New record' }).click();
  await expect(page.locator('#customer')).toHaveValue('Unfinished private draft');
});

test('backup restore rejects pending or foreign records without partially importing', async ({ page, context }) => {
  await page.evaluate((state) => window.testSetAccess(state), member());
  await context.setOffline(true);
  await page.getByRole('button', { name: 'New record' }).click();
  await page.locator('#customer').fill('Pending record');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#syncStatus')).toContainText('1 pending');
  const result = await page.evaluate(async (org) => {
    const saved = (await commissioningStore.listRecords())[0];
    const fresh = { ...saved, id: 'fresh-backup-record' };
    let pendingError = ''; let foreignError = '';
    try { await commissioningStore.restoreForOrganisation([fresh, saved], org); } catch (error) { pendingError = error.message; }
    try { await commissioningStore.restoreForOrganisation([saved], '22222222-2222-4222-8222-222222222222'); } catch (error) { foreignError = error.message; }
    return { pendingError, foreignError, records: await commissioningStore.listRecords(), fresh: await commissioningStore.getRecord(fresh.id) };
  }, organisationId);
  expect(result.pendingError).toContain('pending');
  expect(result.foreignError).toContain('another organisation');
  expect(result.records).toHaveLength(1);
  expect(result.fresh).toBeUndefined();
});
