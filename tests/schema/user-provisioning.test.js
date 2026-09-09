import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter, provisionUsers, validateUsers, ORGANISATION_ID } from '../../scripts/provision-users.mjs';

const person = (overrides = {}) => ({ firstName: 'Test', surname: "O'Brien", email: 'test+tech01@example.invalid', role: 'technician', ...overrides });
function fixture() {
  const users = [], memberships = [], writes = [];
  let failMembership = false;
  const adapter = {
    async checkOrganisation() {},
    async listUsers() { return users; },
    async listMemberships() { return memberships; },
    async createUser(attributes) {
      writes.push('auth');
      const user = { ...attributes, id: `user-${users.length + 1}` };
      users.push(user);
      return user;
    },
    async addMembership(row) {
      if (failMembership) throw new Error('Temporary membership failure');
      writes.push('membership');
      memberships.push(row);
    }
  };
  return { adapter, users, memberships, writes, fail(value) { failMembership = value; } };
}

test('validates all rows and preserves plus aliases and human names', () => {
  assert.deepEqual(validateUsers([person({ email: ' Test+Tech01@example.invalid ', role: 'Technician' })]), [person()]);
  assert.throws(() => validateUsers([person(), person({ email: 'TEST+TECH01@example.invalid' })]), /duplicate/);
  assert.throws(() => validateUsers([person({ role: 'owner' })]), /role/);
  assert.throws(() => validateUsers([person({ email: 'bad address' })]), /email/);
  assert.throws(() => validateUsers([person({ firstName: '' })]), /name/);
});

test('preview does not write Auth or membership data', async () => {
  const f = fixture();
  const result = await provisionUsers({ users: [person()], adapter: f.adapter });
  assert.equal(result[0].status, 'preview: create');
  assert.deepEqual(f.writes, []);
});

test('creates confirmed Auth account and membership, then skips repeat without resetting password', async () => {
  const f = fixture();
  const run = () => provisionUsers({ users: [person()], adapter: f.adapter, apply: true });
  const first = await run();
  assert.equal(first[0].status, 'ready');
  assert.equal(f.users[0].password, 'password');
  assert.equal(f.users[0].email_confirm, true);
  assert.equal(f.users[0].user_metadata.full_name, "Test O'Brien");
  assert.equal(f.memberships[0].role, 'technician');
  f.users[0].password = 'changed-by-user';
  assert.equal((await run())[0].status, 'already exists');
  assert.equal(f.users[0].password, 'changed-by-user');
  assert.deepEqual(f.writes, ['auth', 'membership']);
  assert.ok(!JSON.stringify(first).includes('password'));
});

test('rejects conflicting existing role before creating any accounts in the batch', async () => {
  const f = fixture();
  f.users.push({ id: 'admin', email: person().email });
  f.memberships.push({ user_id: 'admin', organisation_id: ORGANISATION_ID, role: 'administrator' });
  await assert.rejects(provisionUsers({ users: [person({ email: 'new@example.invalid' }), person()], adapter: f.adapter, apply: true }), /existing role differs/);
  assert.deepEqual(f.writes, []);
});

test('does not grant unrelated existing accounts organisation access', async () => {
  const f = fixture();
  f.users.push({ id: 'other', email: person().email });
  await assert.rejects(provisionUsers({ users: [person()], adapter: f.adapter, apply: true }), /Manual review/);
  assert.deepEqual(f.writes, []);
});

test('resumes a partial creation without deleting the account or changing its password', async () => {
  const f = fixture();
  const run = () => provisionUsers({ users: [person()], adapter: f.adapter, apply: true });
  f.fail(true);
  await assert.rejects(run(), /membership failure/);
  assert.equal(f.users.length, 1);
  assert.equal(f.memberships.length, 0);
  f.fail(false);
  assert.equal((await run())[0].status, 'ready');
  assert.deepEqual(f.writes, ['auth', 'membership']);
});

test('partial creation cannot resume into a different role', async () => {
  const f = fixture();
  f.fail(true);
  await assert.rejects(provisionUsers({ users: [person()], adapter: f.adapter, apply: true }));
  f.fail(false);
  await assert.rejects(provisionUsers({ users: [person({ role: 'administrator' })], adapter: f.adapter, apply: true }), /Manual review/);
  assert.equal(f.memberships.length, 0);
});

test('SDK errors cannot leak request data or credentials', async () => {
  const adapter = createAdapter({ auth: { admin: { createUser: async () => ({ error: new Error('sensitive-request-password') }) } } });
  await assert.rejects(adapter.createUser({}), (error) => {
    assert.match(error.message, /Account creation failed/);
    assert.doesNotMatch(error.message, /sensitive-request/);
    return true;
  });
});
