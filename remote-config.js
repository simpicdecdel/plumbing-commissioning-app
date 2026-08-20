const SUPABASE_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]+$/;

export function validateRemoteConfig(config = {}) {
  const supabaseUrl = typeof config.supabaseUrl === 'string' ? config.supabaseUrl.trim() : '';
  const supabasePublishableKey = typeof config.supabasePublishableKey === 'string'
    ? config.supabasePublishableKey.trim()
    : '';

  if (!supabaseUrl && !supabasePublishableKey) {
    return Object.freeze({ enabled: false, reason: 'not-configured' });
  }

  if (!SUPABASE_URL_PATTERN.test(supabaseUrl)) {
    throw new Error('Supabase URL must use https://YOUR_PROJECT.supabase.co.');
  }

  if (!PUBLISHABLE_KEY_PATTERN.test(supabasePublishableKey)) {
    throw new Error('Use a Supabase publishable key. Secret and service-role keys are forbidden.');
  }

  return Object.freeze({
    enabled: true,
    supabaseUrl,
    supabasePublishableKey
  });
}

export function getRemoteConfig(globalObject = window) {
  return validateRemoteConfig(globalObject.PLUMBING_APP_CONFIG);
}
