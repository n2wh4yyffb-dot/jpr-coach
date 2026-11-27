// Sube este número cada vez que actualices la app.
const VERSION = 'jpr-v36';
const FILES = ['./', './index.html', './app.js', './config.js', './vendor/supabase.js', './manifest.webmanifest',
  './assets/logo-light.png', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
  './fonts/archivo-latin-wdth-normal.woff2', './fonts/archivo-latin-wdth-italic.woff2', './assets/logo-mark.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, {cache: 'reload'})))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));

// Solo los archivos de la propia app se guardan en caché. Los datos (Supabase) van siempre por internet.
// La página y el código van primero por internet (así cada cambio se ve al momento) y, sin conexión, salen de la caché.
// Fuentes, iconos e imágenes salen primero de la caché.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const fresh = e.request.mode === 'navigate' || /\.(js|html|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (fresh){
    const fromCache = () => caches.match(e.request, {ignoreSearch: true}).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
    const net = fetch(new Request(url.href, {cache: 'no-store', credentials: 'same-origin'})).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(VERSION).then(cache => cache.put(e.request, c)); return res; }
      return fromCache().then(hit => hit || res);
    });
    // Con mala cobertura no espera más de 5 segundos: tira de la caché.
    const slow = new Promise(r => setTimeout(r, 5000)).then(() => fromCache());
    e.respondWith(Promise.race([net.catch(fromCache), slow.then(hit => hit || net)]).then(r => r || net));
    return;
  }
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(hit => {
    const net = fetch(e.request).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(VERSION).then(cache => cache.put(e.request, c)); }
      return res;
    }).catch(() => hit);
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
