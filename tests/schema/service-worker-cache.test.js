import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../service-worker.js', import.meta.url), 'utf8');

function worker() {
  const handlers = {};
  const deletedCaches = [];
  let cacheReads = 0;
  vm.runInNewContext(source, {
    URL, Response, Set,
    self: {
      location: new URL('https://app.example/plumbing/service-worker.js'),
      addEventListener: (name, handler) => { handlers[name] = handler; },
      clients: { claim: async () => {} }
    },
    caches: {
      match: async () => { cacheReads++; return new Response('stale response'); },
      keys: async () => ['plumbing-commissioning-v0.4.4-offline-config'],
      delete: async (name) => { deletedCaches.push(name); return true; }
    }
  });
  return { handlers, deletedCaches, cacheReads: () => cacheReads };
}

test('database reads bypass stale cached responses, including subsequent changes and deletions', async () => {
  const instance = worker();
  for (const url of [
    'https://project.supabase.co/rest/v1/commissioning_records?select=*',
    'https://project.supabase.co/auth/v1/user',
    'https://project.supabase.co/config.js',
    'https://app.example/plumbing/api/records'
  ]) {
    let intercepted = false;
    instance.handlers.fetch({ request: { method: 'GET', url }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, `Network request must bypass the worker: ${url}`);
  }
  assert.equal(instance.cacheReads(), 0);
});

test('the app shell remains available from the offline cache', async () => {
  const instance = worker();
  let response;
  instance.handlers.fetch({
    request: { method: 'GET', url: 'https://app.example/plumbing/index.html' },
    respondWith: (value) => { response = value; }
  });
  assert.equal(await (await response).text(), 'stale response');
  assert.equal(instance.cacheReads(), 1);
});

test('activation removes the previous cache containing stale database responses', async () => {
  const instance = worker();
  let completed;
  instance.handlers.activate({ waitUntil: (value) => { completed = value; } });
  await completed;
  assert.deepEqual(instance.deletedCaches, ['plumbing-commissioning-v0.4.4-offline-config']);
});
