/* sw.js — service worker mínimo pra PWA offline-friendly */
const CACHE = 'bistroflow-v1';
const ASSETS = [
  './',
  './index.html',
  './blog.html',
  './login.html',
  './cadastro.html',
  './dashboard.html',
  './manifest.webmanifest',
  './assets/css/reset.css',
  './assets/css/variables.css',
  './assets/css/base.css',
  './assets/css/animations.css',
  './assets/css/components.css',
  './assets/css/sections.css',
  './assets/css/auth.css',
  './assets/css/dashboard.css',
  './assets/css/responsive.css',
  './assets/js/utils.js',
  './assets/js/animations.js',
  './assets/js/console.js',
  './assets/js/counters.js',
  './assets/js/navigation.js',
  './assets/js/render.js',
  './assets/js/interactions.js',
  './assets/js/auth.js',
  './assets/js/store.js',
  './assets/js/dashboard.js',
  './assets/js/main.js',
  './assets/data/content.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
