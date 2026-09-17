const CACHE_NAME = 'landslide-ai-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './admin.html',
  './admin.css',
  './admin.js',
  './manifest.json',
  './ner_boundary.geojson',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/leaflet.heat/dist/leaflet-heat.js'
];

// Install Event: Cache Static Assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Fetch Event: Network-First Strategy for API, Cache-First for static assets
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // If the request is for the backend API, use Network-First strategy
  if (requestUrl.port === '8000' || requestUrl.pathname.startsWith('/alerts') || requestUrl.pathname.startsWith('/reports')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If successful, cache the clone and return
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(err => {
          console.error("SW Network fetch failed:", err);
          return caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;
            // Reject so the frontend catch block triggers and shows the "Backend unavailable" UI
            return Promise.reject(new Error("Offline and no cache available"));
          });
        })
    );
  } else {
    // For static assets, use Cache-First strategy (fallback to network)
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(response => {
          // Cache the new resource
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        });
      })
    );
  }
});
