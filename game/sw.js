/* Offline-Betrieb: alles einmal in den Cache, danach läuft das Spiel auch
   im Flugmodus. Bei jeder Änderung die Version hochzählen — dann räumt der
   Worker den alten Stand beim nächsten Start weg. */

const VERSION = 'aetherforge-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/ui.js',
  './js/state.js',
  './js/combat.js',
  './js/fusion.js',
  './js/glyph.js',
  './js/data.js',
  './js/util.js',
  './js/idle.js',
  './js/audio.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      /* Aus dem Cache antworten, im Hintergrund frische Fassung holen. */
      const net = fetch(e.request).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
