import { createClient } from '@supabase/supabase-js';
import { getRemoteConfig } from '../remote-config.js';
import { accessIsRestricted, beginOnlineAccessRefresh, cacheVerifiedMembership, readCachedAccess } from '../access-cache.js';

const config = getRemoteConfig(window);
const listeners = new Set();
let recoveryMode = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
let state = Object.freeze({ user: null, membership: null, recovery: recoveryMode });
let client;
const membershipKey = `commissioning-membership:${config.supabaseUrl || 'disabled'}`;
const controlsKey = `commissioning-account-controls:${config.supabaseUrl || 'disabled'}`;
let resolving = 0;

function isRecovery() { return recoveryMode; }
function notify(nextState) {
  recoveryMode = Boolean(nextState.recovery);
  state = Object.freeze(nextState);
  listeners.forEach((listener) => listener(state));
  return state;
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function requireData(data, error) {
  if (error) throw error;
  return data;
}

async function loadMembership(user) {
  if (!user) return null;
  const { data, error } = await client.from('organisation_members')
    .select('organisation_id, role, organisations(name)')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? {
    organisationId: data.organisation_id,
    organisationName: data.organisations?.name || '',
    role: data.role
  } : null;
}

async function resolveState(session, recovery = isRecovery()) {
  const request = ++resolving;
  const user = session?.user || null;
  let membership = null;
  let controls = { disabled:false, passwordChangeRequired:false };
  if (user) {
    try {
      if (!navigator.onLine) {
        ({ controls, membership } = readCachedAccess(localStorage, {
          membershipKey, controlsKey, userId: user.id
        }));
      } else {
        const response = await client.rpc('get_my_access_controls');
        if (response.error) throw response.error;
        controls = response.data || controls;
        if (request === resolving) beginOnlineAccessRefresh(localStorage, {
          membershipKey, controlsKey, userId: user.id, controls
        });
        membership = accessIsRestricted(controls) ? null : await loadMembership(user);
        if (request === resolving) {
          cacheVerifiedMembership(localStorage, { membershipKey, userId: user.id, membership });
        }
      }
    }
    catch (error) { console.error('Could not load organisation membership.', error); }
  }
  if (request !== resolving) return state;
  if (!user) { localStorage.removeItem(membershipKey); localStorage.removeItem(controlsKey); }
  return notify({ user, membership, recovery, ...controls });
}

const disabled = {
  enabled: false,
  initialise: async () => state,
  getState: () => state,
  isRecovery,
  onStateChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
};

let api = disabled;
if (config.enabled) {
  client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
  });
  client.auth.onAuthStateChange((event, session) => {
    const recovery = event === 'PASSWORD_RECOVERY' || (event === 'INITIAL_SESSION' && recoveryMode);
    setTimeout(() => resolveState(session, recovery)
      .catch((authError) => console.error('Could not update authentication state.', authError)), 0);
  });
  api = {
    enabled: true,
    getState: () => state,
    isRecovery,
    onStateChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async initialise() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return resolveState(data.session, isRecovery());
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return resolveState(data.session, false);
    },
    async sendPasswordResetEmail(email) {
      const redirectTo = `${location.origin}${location.pathname}`;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },
    async updatePassword(password) {
      let user;
      if (state.passwordChangeRequired) {
        const email = state.user?.email;
        await api.adminRequest({ action:'change_password', password });
        // An admin password update revokes the previous Auth session. Establish
        // a new session instead of querying getUser with the invalidated token.
        const response = await client.auth.signInWithPassword({ email, password });
        if (response.error) throw new Error('Password changed. Sign in again with your new password.');
        user = response.data.user;
      } else {
        const { data, error } = await client.auth.updateUser({ password });
        if (error) throw error;
        user = data.user;
      }
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      return resolveState({ user }, false);
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      return resolveState(null, false);
    },
    async refreshAccess() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return resolveState(data.session);
    },
    assignmentAccess: true,
    async adminRequest(body) {
      const { data, error } = await client.functions.invoke('admin-console', { body });
      if (error) {
        let message = 'Admin request failed. Check your connection and permissions.';
        try { const details = await error.context.json(); message = details.error || message; } catch {}
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    async consoleRpc(name, args = {}) {
      if (!['admin_console_context','admin_console_statistics','admin_console_users','admin_console_activity'].includes(name)) throw new Error('Unknown console request.');
      const { data, error } = await client.rpc(name,args);
      return requireData(data,error);
    },
    async consoleRecords({ organisationId, search='', state='active', offset=0 }) {
      let query = client.from('commissioning_records').select('*',{count:'exact'}).eq('organisation_id',organisationId);
      if (state === 'active') query = query.is('deleted_at',null);
      if (state === 'deleted') query = query.not('deleted_at','is',null);
      if (search) query = query.ilike('payload->job->>siteName',`%${search}%`);
      const { data,error,count } = await query.order('updated_at',{ascending:false}).order('id').range(offset,offset+49);
      return { rows:requireData(data,error), total:count };
    },
    async listRecords(organisationId, knownRecordIds = []) {
      const { data, error } = await client.rpc('sync_assigned_commissioning_records', {
        target_organisation_id: organisationId, known_record_ids: knownRecordIds
      });
      const snapshot = requireData(data, error);
      return [...snapshot.records, ...snapshot.withdrawn.map((id) => ({ id, access_revoked: true }))];
    },
    async listTechnicians(organisationId) {
      const { data, error } = await client.rpc('list_assignable_technicians', { target_organisation_id: organisationId });
      return requireData(data, error);
    },
    async getRecord(organisationId, remoteId) {
      const { data, error } = await client.from('commissioning_records')
        .select('id, payload, assigned_technician_id, revision, updated_at, deleted_at')
        .eq('organisation_id', organisationId)
        .eq('id', remoteId)
        .maybeSingle();
      const record = requireData(data, error);
      if (record) return record;
      const deletions = await client.rpc('list_commissioning_deletions', { target_organisation_id: organisationId });
      return (requireData(deletions.data, deletions.error) || []).find((marker) => marker.id === remoteId) || null;
    },
    async saveRecord({ remoteId, organisationId, record, expectedRevision }) {
      const { data, error } = await client.rpc('save_commissioning_record', {
        record_id: remoteId,
        target_organisation_id: organisationId,
        record_payload: record,
        expected_revision: expectedRevision
      });
      return firstRow(requireData(data, error));
    },
    async deleteRecord({ remoteId, organisationId, expectedRevision }) {
      const { data, error } = await client.rpc('soft_delete_commissioning_record', {
        record_id: remoteId,
        target_organisation_id: organisationId,
        expected_revision: expectedRevision
      });
      return firstRow(requireData(data, error));
    },
    async restoreRecord({ remoteId, organisationId, expectedRevision }) {
      const { data, error } = await client.rpc('restore_commissioning_record', {
        record_id: remoteId, target_organisation_id: organisationId, expected_revision: expectedRevision
      });
      return firstRow(requireData(data, error));
    }
  };
}

window.commissioningRemote = Object.freeze(api);
