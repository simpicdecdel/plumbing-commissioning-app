const unrestrictedControls = Object.freeze({ disabled: false, passwordChangeRequired: false });

function readEntry(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); }
  catch { return null; }
}

function normaliseControls(controls = {}) {
  return {
    disabled: Boolean(controls.disabled),
    passwordChangeRequired: Boolean(controls.passwordChangeRequired)
  };
}

export function accessIsRestricted(controls = unrestrictedControls) {
  return Boolean(controls.disabled || controls.passwordChangeRequired);
}

export function readCachedAccess(storage, { membershipKey, controlsKey, userId }) {
  const cachedControls = readEntry(storage, controlsKey);
  const controlsVerified = cachedControls?.userId === userId;
  const controls = controlsVerified ? normaliseControls(cachedControls.controls) : { ...unrestrictedControls };
  if (!controlsVerified || accessIsRestricted(controls)) return { controls, membership: null };

  const cachedMembership = readEntry(storage, membershipKey);
  const membership = cachedMembership?.userId === userId ? cachedMembership.membership : null;
  return { controls, membership };
}

export function beginOnlineAccessRefresh(storage, { membershipKey, controlsKey, userId, controls }) {
  // Remove the older membership first. If this refresh is interrupted or the
  // membership query is denied, a later offline start must fail closed.
  storage.removeItem(membershipKey);
  storage.setItem(controlsKey, JSON.stringify({ userId, controls: normaliseControls(controls) }));
}

export function cacheVerifiedMembership(storage, { membershipKey, userId, membership }) {
  if (membership) storage.setItem(membershipKey, JSON.stringify({ userId, membership }));
  else storage.removeItem(membershipKey);
}
