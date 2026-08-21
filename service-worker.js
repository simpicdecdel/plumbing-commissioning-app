const CACHE_NAME = 'plumbing-commissioning-v0.4.1-conflict';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=0.4.1-conflict',
  './vendor/dexie.min.js?v=0.4.1-conflict',
  './vendor/remote-client.min.js?v=0.4.1-conflict',
  './storage.js?v=0.4.1-conflict',
  './sync.js?v=0.4.1-conflict',
  './app.js?v=0.4.1-conflict',
  './manifest.webmanifest',
  './icons/app-icon.svg',
  './icons/app-icon-192.png',
  './icons/app-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).pathname.endsWith('/config.js')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)
    .then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    })
    .catch(() => caches.match('./index.html'))));
});
