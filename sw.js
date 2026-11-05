// Offline cache for PST100 Race Day. Bump VERSION on every deploy.
const VERSION = 'pst100-v10';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pst100-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates arrive when online), fall back to cache offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const copy = r.clone();
      e.waitUntil(caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {}));
      return r;
    }).catch(() => caches.open(VERSION).then(c => c.match(e.request, {ignoreSearch: true}).then(r => r || (e.request.mode === 'navigate' ? c.match('./index.html') : Response.error()))))
  );
});
