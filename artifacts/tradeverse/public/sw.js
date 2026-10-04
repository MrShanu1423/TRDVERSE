const V = 'tv-v3';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(['/', '/manifest.webmanifest', '/favicon.png','/icons/icon-192.png']))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.protocol === 'wss:' || url.hostname.includes('binance')) return;
  e.respondWith(fetch(req).then((res) => { if (res.ok && (url.origin === location.origin || /gstatic|googleapis/.test(url.hostname))) { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req).then((m) => m || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
