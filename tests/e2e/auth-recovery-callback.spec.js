import { expect, test } from '@playwright/test';

const supabaseUrl = 'https://recovery-test.supabase.co';
const userId = '11111111-1111-4111-8111-111111111111';

function testAccessToken() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    expiresAt,
    token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      aud: 'authenticated', email: 'recovery@example.com', exp: expiresAt,
      role: 'authenticated', sub: userId
    })}.test-signature`
  };
}

test('opens the reset form after Supabase consumes a recovery callback', async ({ page }) => {
  const { expiresAt, token } = testAccessToken();

  await page.route('**/config.js*', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.PLUMBING_APP_CONFIG = Object.freeze({
      supabaseUrl: '${supabaseUrl}',
      supabasePublishableKey: 'sb_publishable_recovery_test_key_123456'
    });`
  }));
  await page.route(`${supabaseUrl}/**`, (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/auth/v1/user') {
      return route.fulfill({ json: {
        id: userId, aud: 'authenticated', role: 'authenticated', email: 'recovery@example.com',
        app_metadata: {}, user_metadata: {}, identities: [],
        created_at: '2026-08-21T00:00:00.000Z', updated_at: '2026-08-21T00:00:00.000Z'
      } });
    }
    if (pathname === '/rest/v1/organisation_members') {
      return route.fulfill({ json: {
        organisation_id: '22222222-2222-4222-8222-222222222222',
        role: 'administrator', organisations: { name: 'Recovery Test' }
      } });
    }
    return route.fulfill({ status: 204, body: '' });
  });

  const hash = new URLSearchParams({
    access_token: token,
    expires_at: String(expiresAt),
    expires_in: '3600',
    refresh_token: 'recovery-test-refresh-token',
    token_type: 'bearer',
    type: 'recovery'
  });
  await page.goto(`/#${hash}`);

  await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();
  await expect(page.locator('#setPasswordForm')).toBeVisible();
  await expect(page.locator('#signInForm')).toBeHidden();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
});
