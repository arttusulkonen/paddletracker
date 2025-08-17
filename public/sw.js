// public/sw.js
const CACHE = 'smashlog-v1';
const PRECACHE = [
  '/',
  '/mobile',
  '/manifest.webmanifest',
  '/icons/favicon-196x196.png',
  '/icons/mstile-310x310.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    return; 
  }

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webmanifest')
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(networkFirst(req));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const resp = await fetch(request);
  const copy = resp.clone();
  caches
    .open(CACHE)
    .then((c) => c.put(request, copy))
    .catch(() => {});
  return resp;
}

async function networkFirst(request) {
  try {
    const resp = await fetch(request);
    const copy = resp.clone();
    caches
      .open(CACHE)
      .then((c) => c.put(request, copy))
      .catch(() => {});
    return resp;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('Network error and no cache');
  }
}
