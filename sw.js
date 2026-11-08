// Sube este número cada vez que actualices la app.
const VERSION = 'jpr-v3';
const FILES = ['./', './index.html', './app.js', './config.js', './vendor/supabase.js', './manifest.webmanifest',
  './assets/logo-light.png', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
  './fonts/inter-latin-400-normal.woff2', './fonts/inter-latin-500-normal.woff2', './fonts/inter-latin-600-normal.woff2', './fonts/inter-latin-700-normal.woff2'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));

// Solo los archivos de la propia app se guardan en caché. Los datos (Supabase) van siempre por internet.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(hit => {
    const net = fetch(e.request).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(VERSION).then(cache => cache.put(e.request, c)); }
      return res;
    }).catch(() => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
    return hit || net;
  }));
});
