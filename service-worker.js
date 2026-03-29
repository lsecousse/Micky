const CACHE_NAME = 'coachmike-20260329125710';
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/splash/splash-1320x2868.png',
  '/icons/splash/splash-1206x2622.png',
  '/icons/splash/splash-1290x2796.png',
  '/icons/splash/splash-1170x2532.png',
  '/icons/splash/splash-1179x2556.png',
  '/icons/splash/splash-1125x2436.png',
  '/icons/splash/splash-1242x2688.png',
  '/icons/splash/splash-828x1792.png',
  '/icons/splash/splash-750x1334.png',
  '/icons/splash/splash-640x1136.png',
  '/icons/splash/splash-2048x2732.png',
  '/icons/splash/splash-1668x2388.png',
  '/icons/splash/splash-1640x2360.png',
  '/icons/splash/splash-1488x2266.png',
  '/icons/splash/splash-1536x2048.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
