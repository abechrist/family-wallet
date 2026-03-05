// ═══════════════════════════════════════════
//  Family Wallet — Service Worker (PWA)
//  Versi: 1.0.0
// ═══════════════════════════════════════════

const CACHE_NAME = 'family-wallet-v1';
const CACHE_URLS = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Google Fonts (di-cache saat pertama load)
  'https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap'
];

// ── INSTALL: cache semua aset penting ──
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      // Cache satu per satu agar tidak gagal semua jika satu error
      return Promise.allSettled(
        CACHE_URLS.map(url => cache.add(url).catch(err => {
          console.warn('[SW] Failed to cache:', url, err);
        }))
      );
    }).then(() => {
      console.log('[SW] Install complete');
      return self.skipWaiting(); // langsung aktif tanpa tunggu tab lama ditutup
    })
  );
});

// ── ACTIVATE: hapus cache lama ──
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activate complete');
      return self.clients.claim(); // ambil kendali semua tab langsung
    })
  );
});

// ── FETCH: strategi Cache-First untuk aset lokal,
//           Network-First untuk request ke Google Apps Script ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Request ke Google Apps Script → selalu pakai network (jangan di-cache)
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline. Data tidak dapat dikirim ke server.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Google Fonts → Stale-While-Revalidate
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cached => {
          const networkFetch = fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          });
          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // Semua aset lokal → Cache-First, fallback ke network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        // Cache response baru (hanya GET yang valid)
        if (event.request.method === 'GET' && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Fallback offline: kembalikan index.html jika ada
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
