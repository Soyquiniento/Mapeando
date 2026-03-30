const CACHE_NAME = 'mapa-ruta-v2';
const TILE_CACHE = 'tiles-v1';
const STATIC_CACHE = 'static-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
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
// Escuchar mensajes del index.html
self.addEventListener('message', (event) => {
    if (event.data.type === 'DESCARGAR_REGION') {
        descargarZona(event.data.region);
    }
});

async function descargarZona(region) {
    const cache = await caches.open('mapa-ruta-v2'); // Asegúrate que coincida con tu nombre de caché
    let total = 0;
    let actual = 0;

    // 1. Contar cuántos cuadritos hay que bajar (para el %)
    for (let z = region.minZoom; z <= region.maxZoom; z++) {
        const xMin = lon2tile(region.minLon, z);
        const xMax = lon2tile(region.maxLon, z);
        const yMin = lat2tile(region.maxLat, z);
        const yMax = lat2tile(region.minLat, z);
        total += (xMax - xMin + 1) * (yMax - yMin + 1);
    }

    // 2. Descargar cada cuadrito (tile)
    for (let z = region.minZoom; z <= region.maxZoom; z++) {
        const xMin = lon2tile(region.minLon, z);
        const xMax = lon2tile(region.maxLon, z);
        const yMin = lat2tile(region.maxLat, z);
        const yMax = lat2tile(region.minLat, z);

        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                // Aquí va la URL de tus mapas (ajusta si usas otro servidor)
                const url = `https://openstreetmap.org{z}/${x}/${y}.png`;
                
                try {
                    const response = await fetch(url);
                    if (response.ok) await cache.put(url, response);
                } catch (e) { console.error("Error bajando tile", e); }

                actual++;
                // Enviar progreso al index.html
                const porcentaje = Math.round((actual / total) * 100);
                self.clients.matchAll().then(clients => {
                    clients.forEach(client => client.postMessage({ type: 'PROGRESO', valor: porcentaje }));
                });
            }
        }
    }
}

// Funciones matemáticas para convertir coordenadas a Tiles
function lon2tile(lon, zoom) { return Math.floor((lon + 180) / 360 * Math.pow(2, zoom)); }
function lat2tile(lat, zoom) { return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)); }
