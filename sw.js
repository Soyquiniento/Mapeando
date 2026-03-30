const CACHE_NAME = 'mapa-ruta-v1';
const TILE_CACHE = 'tiles-v1';
const STATIC_CACHE = 'static-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js',
  'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== TILE_CACHE && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache tiles from OSM tile servers
  const isTile =
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('tiles.stadiamaps.com') ||
    url.pathname.match(/\/\d+\/\d+\/\d+\.(png|jpg|webp)$/);

  if (isTile) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // Static assets: cache first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => caches.match('/index.html'));
    })
  );
});

// Receive message from main thread to clear tile cache
self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_TILE_CACHE') {
    caches.delete(TILE_CACHE).then(() => {
      self.clients.matchAll().then((clients) =>
        clients.forEach((c) => c.postMessage('CACHE_CLEARED'))
      );
    });
  }
  if (event.data === 'GET_CACHE_SIZE') {
    caches.open(TILE_CACHE).then(async (cache) => {
      const keys = await cache.keys();
      self.clients.matchAll().then((clients) =>
        clients.forEach((c) => c.postMessage({ type: 'CACHE_SIZE', count: keys.length }))
      );
    });
  }
});
