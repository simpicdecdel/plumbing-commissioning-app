import assert from 'node:assert/strict';
import test from 'node:test';
import { accessIsRestricted, beginOnlineAccessRefresh, cacheVerifiedMembership, readCachedAccess } from '../../access-cache.js';

const membershipKey = 'membership';
const controlsKey = 'controls';
const userId = 'technician-1';
const membership = { organisationId: 'organisation-1', role: 'technician' };

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

function cached(entry) { return JSON.stringify(entry); }

test('offline access requires matching verified controls and membership', () => {
  const storage = memoryStorage({
    [membershipKey]: cached({ userId, membership }),
    [controlsKey]: cached({ userId, controls: { disabled: false, passwordChangeRequired: false } })
  });
  assert.deepEqual(readCachedAccess(storage, { membershipKey, controlsKey, userId }), {
    controls: { disabled: false, passwordChangeRequired: false }, membership
  });

  const missingControls = memoryStorage({ [membershipKey]: cached({ userId, membership }) });
  assert.equal(readCachedAccess(missingControls, { membershipKey, controlsKey, userId }).membership, null);
});

test('a deactivation refresh clears stale membership before offline restart', () => {
  const storage = memoryStorage({
    [membershipKey]: cached({ userId, membership }),
    [controlsKey]: cached({ userId, controls: { disabled: false, passwordChangeRequired: false } })
  });
  const controls = { disabled: true, passwordChangeRequired: false };

  beginOnlineAccessRefresh(storage, { membershipKey, controlsKey, userId, controls });

  const offline = readCachedAccess(storage, { membershipKey, controlsKey, userId });
  assert.equal(accessIsRestricted(offline.controls), true);
  assert.equal(offline.membership, null);
});

test('a failed membership refresh cannot leave an older offline grant', () => {
  const storage = memoryStorage({
    [membershipKey]: cached({ userId, membership }),
    [controlsKey]: cached({ userId, controls: { disabled: false, passwordChangeRequired: false } })
  });

  beginOnlineAccessRefresh(storage, {
    membershipKey, controlsKey, userId,
    controls: { disabled: false, passwordChangeRequired: false }
  });

  assert.equal(readCachedAccess(storage, { membershipKey, controlsKey, userId }).membership, null);
});

test('a successful online refresh restores offline membership', () => {
  const storage = memoryStorage();
  beginOnlineAccessRefresh(storage, {
    membershipKey, controlsKey, userId,
    controls: { disabled: false, passwordChangeRequired: false }
  });
  cacheVerifiedMembership(storage, { membershipKey, userId, membership });

  assert.deepEqual(readCachedAccess(storage, { membershipKey, controlsKey, userId }).membership, membership);
});
