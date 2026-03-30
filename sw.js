const CACHE_NAME = 'mapa-emergencia-v3'; // Cambiamos a v3 para forzar la actualización
const OFFLINE_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com',
  'https://unpkg.com',
  'https://maplibre.org'
];

// 1. Instalación: Guardar archivos base (HTML, JS, CSS)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    })
  );
  self.skipWaiting();
});

// 2. Activación: Limpiar cachés viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
});

// 3. Estrategia de carga: Primero buscar en Cache, si no, ir a Internet
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((networkResponse) => {
        // Guardar automáticamente en caché lo que el usuario va viendo
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      });
    }).catch(() => {
      // Si falla todo (offline y no está en caché), no hacer nada o mostrar error
    })
  );
});

// 4. Lógica de Descarga Masiva por Región
self.addEventListener('message', (event) => {
  if (event.data.type === 'DESCARGAR_REGION') {
    descargarZona(event.data.region);
  }
});

async function descargarZona(region) {
  const cache = await caches.open(CACHE_NAME);
  let total = 0;
  let actual = 0;

  // Calcular total de tiles a descargar
  for (let z = region.minZoom; z <= region.maxZoom; z++) {
    const xMin = lon2tile(region.minLon, z);
    const xMax = lon2tile(region.maxLon, z);
    const yMin = lat2tile(region.maxLat, z);
    const yMax = lat2tile(region.minLat, z);
    total += (xMax - xMin + 1) * (yMax - yMin + 1);
  }

  // Descargar cada tile (cuadrito del mapa)
  for (let z = region.minZoom; z <= region.maxZoom; z++) {
    const xMin = lon2tile(region.minLon, z);
    const xMax = lon2tile(region.maxLon, z);
    const yMin = lat2tile(region.maxLat, z);
    const yMax = lat2tile(region.minLat, z);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const url = `https://openstreetmap.org{z}/${x}/${y}.png`;
        
        try {
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        } catch (e) {
          console.error("Error en tile:", url);
        }

        actual++;
        const porcentaje = Math.round((actual / total) * 100);
        
        // Avisar al index.html el progreso
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({ type: 'PROGRESO', valor: porcentaje }));
      }
    }
  }
}

// Funciones matemáticas para convertir coordenadas a Tiles (URL de imágenes)
function lon2tile(lon, zoom) { return Math.floor((lon + 180) / 360 * Math.pow(2, zoom)); }
function lat2tile(lat, zoom) { return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)); }

