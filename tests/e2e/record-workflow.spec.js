import { expect, test } from '@playwright/test';

async function openNewRecord(page) {
  await page.getByRole('button', { name: 'New record' }).click();
  await expect(page.getByRole('heading', { name: 'New commissioning' })).toBeVisible();
}

async function fillRequiredRecord(page, overrides = {}) {
  await page.locator('#customer').fill(overrides.siteName || 'iPhone Test Site');
  await page.locator('#address').fill('10 Test Street, Sydney NSW');
  await page.locator('#technician').fill('Mobile Tester');
  await page.locator('#plantName').fill('Plant Room 1');
  await page.locator('[data-unit-field="label"]').first().fill(overrides.unitLabel || 'HWS-IPHONE-01');
  await page.locator('[data-unit-field="serialNumber"]').first().fill(overrides.serialNumber || 'IOS-0001');
  await page.locator('#outcome').selectOption('Passed');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#networkStatus')).toHaveText('Online');
});

test('completes, persists and searches a commissioning record', async ({ page }) => {
  await openNewRecord(page);
  await fillRequiredRecord(page);
  await page.getByRole('button', { name: 'Complete record' }).click();

  const record = page.locator('.record-card').filter({ hasText: 'iPhone Test Site' });
  await expect(record).toContainText('Plant Room 1');
  await expect(record).toContainText('Passed');

  await page.reload();
  await expect(page.locator('.record-card').filter({ hasText: 'iPhone Test Site' })).toBeVisible();

  await page.locator('#recordSearch').fill('IOS-0001');
  await expect(page.locator('.record-card')).toHaveCount(1);
  await expect(page.locator('.record-card')).toContainText('iPhone Test Site');
});

test('restores an autosaved draft after reload', async ({ page }) => {
  await openNewRecord(page);
  await page.locator('#customer').fill('Autosaved iPhone Site');
  await page.locator('#plantName').fill('Draft Plant');
  await expect(page.locator('#saveStatus')).toHaveText('Draft saved on this device.');

  await page.reload();
  await page.getByRole('button', { name: 'New record' }).click();
  await expect(page.locator('#customer')).toHaveValue('Autosaved iPhone Site');
  await expect(page.locator('#plantName')).toHaveValue('Draft Plant');
});

test('requires detail for a unit fault or exception', async ({ page }) => {
  await openNewRecord(page);
  await fillRequiredRecord(page, { siteName: 'Fault Validation Site' });

  const unitStatus = page.locator('[data-unit-field="status"]').first();
  const exception = page.locator('[data-unit-field="exception"]').first();
  await unitStatus.selectOption('Fault / exception');
  await expect(exception).toHaveAttribute('required', '');

  await page.getByRole('button', { name: 'Complete record' }).click();
  await expect(page.getByRole('heading', { name: 'New commissioning' })).toBeVisible();

  await exception.fill('Burner failed during commissioning.');
  await page.locator('#outcome').selectOption('Failed');
  await page.getByRole('button', { name: 'Complete record' }).click();
  await expect(page.locator('.record-card').filter({ hasText: 'Fault Validation Site' })).toContainText('1 fault / exception');
});

test('restores a valid backup and replaces a matching record ID', async ({ page }) => {
  await openNewRecord(page);
  await fillRequiredRecord(page, { siteName: 'Existing Device Site', unitLabel: 'EXISTING-01' });
  await page.getByRole('button', { name: 'Complete record' }).click();

  const backup = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    records: [{
      id: 'restore-test-record', schemaVersion: 2, status: 'Completed',
      job: { siteName: 'Restored iPhone Site', reference: 'RESTORE-1', address: '20 Backup Road', commissioningDate: '2026-08-20', technician: 'Restore Tester' },
      plant: { name: 'Restored Plant', location: 'Roof', type: 'Commercial hot water plant' },
      units: [{ id: 'restore-unit', label: 'RESTORE-HWS-01', manufacturer: '', model: '', serialNumber: '', status: 'Operational', exception: '' }],
      installationChecks: {}, results: { outcome: 'Passed' }, handover: {}, updatedAt: '2026-08-20T00:00:00.000Z'
    }]
  };

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#restoreFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#storageNotice')).toHaveText('Backup restored: 1 added, 0 replaced.');
  await expect(page.locator('.record-card').filter({ hasText: 'Restored iPhone Site' })).toBeVisible();
  await expect(page.locator('.record-card').filter({ hasText: 'Existing Device Site' })).toBeVisible();

  backup.records[0].job.siteName = 'Updated Restored Site';
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#restoreFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#storageNotice')).toHaveText('Backup restored: 0 added, 1 replaced.');
  await expect(page.locator('.record-card').filter({ hasText: 'Updated Restored Site' })).toBeVisible();
  await expect(page.locator('.record-card').filter({ hasText: 'Restored iPhone Site' })).toHaveCount(0);
});

test('rejects an invalid backup without changing records', async ({ page }) => {
  await page.locator('#restoreFile').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
  await expect(page.locator('#storageNotice')).toHaveText('Backup not restored: The file is not valid JSON.');
  await expect(page.locator('.record-card')).toHaveCount(0);
});
