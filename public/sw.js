// public/sw.js
const CACHE = 'ppt-v1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll([
          '/',
          '/mobile',
          '/manifest.webmanifest',
          '/icons/favicon-196x196.png',
          '/icons/mstile-310x310.png',
        ])
      )
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return resp;
        })
        .catch(() => cached);
    })
  );
});
