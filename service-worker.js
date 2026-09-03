const CACHE_NAME = 'plumbing-commissioning-v0.4.4-offline-config';
const CONFIG_CACHE_NAME = `${CACHE_NAME}-public-config`;
const CONFIG_URL = './config.js?v=0.4.4-offline-config';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=0.4.4-offline-config',
  './vendor/dexie.min.js?v=0.4.4-offline-config',
  './vendor/remote-client.min.js?v=0.4.4-offline-config',
  './storage.js?v=0.4.4-offline-config',
  './sync.js?v=0.4.4-offline-config',
  './app.js?v=0.4.4-offline-config',
  './manifest.webmanifest',
  './icons/app-icon.svg',
  './icons/app-icon-192.png',
  './icons/app-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
    caches.open(CONFIG_CACHE_NAME).then((cache) => cache.add(CONFIG_URL))
  ]).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  const currentCaches = new Set([CACHE_NAME, CONFIG_CACHE_NAME]);
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => !currentCaches.has(key)).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).pathname.endsWith('/config.js')) {
    event.respondWith(caches.open(CONFIG_CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(event.request);
        if (!response.ok) throw new Error(`Configuration request failed with ${response.status}`);
        await cache.put(event.request, response.clone());
        return response;
      } catch {
        return (await cache.match(event.request)) || new Response(
          'window.PLUMBING_APP_CONFIG = Object.freeze({});\n',
          { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } }
        );
      }
    }));
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
