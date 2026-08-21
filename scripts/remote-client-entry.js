import { createClient } from '@supabase/supabase-js';
import { getRemoteConfig } from '../remote-config.js';

const config = getRemoteConfig(window);
const listeners = new Set();
let state = Object.freeze({ user: null, membership: null, recovery: isRecovery() });
let client;

function isRecovery() { return new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery'; }
function notify(nextState) {
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
  const user = session?.user || null;
  let membership = null;
  if (user) {
    try { membership = await loadMembership(user); }
    catch (error) { console.error('Could not load organisation membership.', error); }
  }
  return notify({ user, membership, recovery });
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
  api = {
    enabled: true,
    getState: () => state,
    isRecovery,
    onStateChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async initialise() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      client.auth.onAuthStateChange((event, session) => {
        setTimeout(() => resolveState(session, event === 'PASSWORD_RECOVERY')
          .catch((authError) => console.error('Could not update authentication state.', authError)), 0);
      });
      return resolveState(data.session, isRecovery());
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return resolveState(data.session, false);
    },
    async sendPasswordSetupEmail(email) {
      const redirectTo = `${location.origin}${location.pathname}`;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { data, error } = await client.auth.updateUser({ password });
      if (error) throw error;
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      return resolveState({ user: data.user }, false);
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      return resolveState(null, false);
    },
    async listRecords(organisationId) {
      const { data, error } = await client.from('commissioning_records')
        .select('id, payload, revision, updated_at, deleted_at')
        .eq('organisation_id', organisationId)
        .order('updated_at', { ascending: true });
      return requireData(data, error) || [];
    },
    async getRecord(organisationId, remoteId) {
      const { data, error } = await client.from('commissioning_records')
        .select('id, payload, revision, updated_at, deleted_at')
        .eq('organisation_id', organisationId)
        .eq('id', remoteId)
        .maybeSingle();
      return requireData(data, error);
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
    }
  };
}

window.commissioningRemote = Object.freeze(api);
