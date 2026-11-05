const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker(fetchImpl, initial = []) {
  const origin = 'https://example.test/race/';
  const url = key => new URL(typeof key === 'string' ? key : key.url, origin).href;
  const entries = new Map(initial.map(([k, v]) => [url(k), v]));
  const handlers = {};
  const cache = {
    match: async key => entries.get(url(key))?.clone(),
    put: async (key, response) => entries.set(url(key), response.clone())
  };
  const removed = [];
  const context = vm.createContext({
    URL, Response, Request, AbortController, setTimeout, clearTimeout,
    fetch: fetchImpl,
    self: { location: new URL('sw.js', origin), registration: {scope: origin},
      addEventListener: (name, handler) => handlers[name] = handler,
      clients: {claim: async () => {}}, skipWaiting: async () => {} },
    caches: { open: async () => cache, match: cache.match,
      keys: async () => ['pst100-v8', 'pst100-v9', 'another-app-v1'],
      delete: async key => removed.push(key) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), context);
  async function request(file) {
    let response;
    const pending = [];
    handlers.fetch({ request: new Request(url(file)),
      respondWith: p => response = p, waitUntil: p => pending.push(p) });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return { request, entries, removed, handlers, origin };
}

for (const status of [404, 503]) {
  test(`HTTP ${status} falls back to a good cached page without overwriting it`, async () => {
    const w = worker(async () => new Response('server error', {status}), [['index.html', new Response('race app')]]);
    assert.equal(await (await w.request('index.html')).text(), 'race app');
    assert.equal(await w.entries.get(w.origin + 'index.html').text(), 'race app');
  });
}

test('offline reload returns the cached app', async () => {
  const w = worker(async () => { throw new TypeError('offline'); }, [['index.html', new Response('race app')]]);
  assert.equal(await (await w.request('index.html')).text(), 'race app');
});

test('a successful online response is cached for the next offline visit', async () => {
  let online = true;
  const w = worker(async () => { if (!online) throw new TypeError('offline'); return new Response('updated app'); });
  assert.equal(await (await w.request('index.html')).text(), 'updated app');
  online = false;
  assert.equal(await (await w.request('index.html')).text(), 'updated app');
});

test('activation preserves caches owned by other apps on the same origin', async () => {
  const w = worker(async () => new Response('ok'));
  let pending;
  w.handlers.activate({waitUntil: p => pending = p});
  await pending;
  assert.ok(!w.removed.includes('another-app-v1'));
  assert.ok(w.removed.includes('pst100-v8'));
});
