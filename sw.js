// Sube este número cada vez que actualices la app.
const VERSION = 'jpr-v24';
const FILES = ['./', './index.html', './app.js', './config.js', './vendor/supabase.js', './manifest.webmanifest',
  './assets/logo-light.png', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
  './fonts/archivo-latin-wdth-normal.woff2', './fonts/archivo-latin-wdth-italic.woff2', './assets/logo-mark.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, {cache: 'reload'})))).then(() => self.skipWaiting())));
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

// Avisos en el móvil (aviso de pasos y otros recordatorios del coach)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'JPR Coach', {
    body: d.body || '', icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: d.tag || undefined, data: {url: d.url || './'},
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
