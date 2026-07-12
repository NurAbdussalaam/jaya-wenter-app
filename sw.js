/* ============================================================
   JAYA WENTER APP — sw.js (Service Worker)
   Caching dasar untuk PWA — agar app bisa di-install
   dan loading lebih cepat pada kunjungan berikutnya.
   ============================================================ */

const CACHE_NAME = 'jaya-wenter-v1';

const ASSET_TO_CACHE = [
  '/index.html',
  '/manifest.json',
  '/assets/css/main.css',
  '/assets/js/utils.js',
  '/owner/index.html',
  '/agen/index.html'
];

/* ── INSTALL: simpan asset dasar ke cache ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSET_TO_CACHE).catch(() => {
        // Jika ada asset gagal di-cache (misal belum ada saat dev), lanjutkan saja
      });
    })
  );
  self.skipWaiting();
});

/* ── ACTIVATE: bersihkan cache versi lama ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

/* ── FETCH STRATEGY ──
   - Untuk request ke Firebase / API eksternal: selalu network (jangan cache,
     karena data harus selalu real-time/terbaru).
   - Untuk asset statis (HTML/CSS/JS lokal): cache-first, fallback ke network.
*/
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Jangan cache request ke Firebase / domain eksternal
  if (url.includes('firestore.googleapis.com') ||
      url.includes('identitytoolkit.googleapis.com') ||
      url.includes('googleapis.com') ||
      url.includes('gstatic.com') ||
      url.includes('wa.me')) {
    return; // biarkan browser handle langsung (network)
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Cache asset statis baru secara otomatis (hanya GET & sukses)
        if (event.request.method === 'GET' && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Jika offline dan tidak ada di cache, tampilkan fallback sederhana
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
