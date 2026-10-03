/* CepStok çevrimdışı önbellek */
const C = 'cepstok-v2';
const FILES = ['app.html', 'display.html', 'catalog.html', 'index.html', 'manifest.webmanifest', 'assets/css/app.css', 'assets/img/icon.svg',
  'assets/js/core.js', 'assets/js/pricing.js', 'assets/js/sync.js', 'assets/vendor/xlsx.full.min.js', 'assets/js/demo.js', 'assets/js/app.js', 'assets/js/m-dashboard.js', 'assets/js/m-pos.js', 'assets/js/m-products.js', 'assets/js/m-stock.js',
  'assets/js/m-contacts.js', 'assets/js/m-docs.js', 'assets/js/m-finance.js', 'assets/js/m-staff.js', 'assets/js/m-reports.js', 'assets/js/m-settings.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('api.php')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok && new URL(e.request.url).origin === location.origin) { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request)));
});
