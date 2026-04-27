// ============================================================
// sw.js — Family Bank service worker
// ------------------------------------------------------------
// Strategy:
//   • App shell (same origin)         → stale-while-revalidate
//   • Navigation (HTML documents)     → network-first, cache as fallback
//   • Cacheable 3rd-party CDNs        → stale-while-revalidate
//   • Live APIs (Firestore, Auth, …)  → passthrough, never cached
//
// Bump CACHE_NAME to force a full refresh of cached assets after a
// release. Old caches are pruned on `activate`.
// ============================================================

const CACHE_NAME = 'family-bank-v3';

// Same-origin assets to pre-cache on first install so the offline-first
// experience works from session #2 onward.
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/main.js',
  './js/config.js',
  './js/utils.js',
  './js/store.js',
  './js/auth.js',
  './js/banks.js',
  './js/firebase.js',
  './js/views/login.js',
  './js/views/group-gate.js',
  './js/views/home.js',
  './js/views/stats.js',
  './js/views/family.js',
  './js/views/settings.js',
  './js/components/modal.js',
  './js/components/toast.js',
  './js/components/transaction-form.js',
  './js/components/add-group-form.js',
  './assets/icon.svg',
];

// Cross-origin hostnames we SHOULD cache (static libs/fonts/CDNs).
const CACHEABLE_HOSTS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com',   // Firebase SDK ESM modules
];

// Hosts we MUST NOT cache — live APIs, auth, user images.
const PASSTHROUGH_HOSTS = [
  'firestore.googleapis.com',
  'securetoken.googleapis.com',
  'identitytoolkit.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebase.googleapis.com',
  'api.vietqr.io',
  'img.vietqr.io',
  'open.larksuite.com',
  'open.feishu.cn',
  'api.dicebear.com',
  'lh3.googleusercontent.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch((e) => console.warn('[sw] precache partial:', e)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Never intercept live APIs / user content — let them hit the network.
  if (PASSTHROUGH_HOSTS.some((h) => url.hostname.includes(h))) return;

  const isSameOrigin = url.origin === self.location.origin;
  const isCacheableCdn = CACHEABLE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
  if (!isSameOrigin && !isCacheableCdn) return;

  // 2) HTML navigations: network-first so new deploys propagate fast.
  //    Fall back to cached index.html when offline.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((fresh) => {
          const copy = fresh.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return fresh;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // 3) Everything else (JS modules, CSS, fonts, SVG, CDN libs):
  //    stale-while-revalidate — serve cache instantly, refresh in background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((fresh) => {
          // Only cache OK or opaque responses (opaque = cross-origin no-cors)
          if (fresh && (fresh.status === 200 || fresh.type === 'opaque')) {
            const copy = fresh.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return fresh;
        })
        .catch(() => cached); // offline: keep serving cached
      return cached || networkFetch;
    })
  );
});

// Allow the page to trigger immediate activation after a new SW waits
// (useful when we add an "update ready" UI later).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
