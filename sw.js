/* Fine Edge Carpentry Manager - service worker
 * Only caches the app shell (page, icons, fonts, libraries) so the app can open offline.
 * It NEVER touches Supabase / API traffic or any non-GET request: all business data
 * is handled by the app itself (cloud + on-device copy), not by this file.
 */
var VERSION = 'fe-cm-v1';
var SHELL = 'shell-' + VERSION;
var LIBS = 'libs-' + VERSION;

var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];
var LIB_FILES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }),
      // libraries: best effort, one by one, so a CDN hiccup does not block install
      caches.open(LIBS).then(function (c) {
        return Promise.all(LIB_FILES.map(function (u) {
          return fetch(u).then(function (r) { if (r && r.ok) return c.put(u, r); }).catch(function () {});
        }));
      })
    ]).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== LIBS; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(req, cacheName, timeoutMs) {
  return caches.open(cacheName).then(function (cache) {
    return new Promise(function (resolve) {
      var done = false;
      function fallback() {
        cache.match(req, { ignoreSearch: true }).then(function (hit) {
          if (hit) { if (!done) { done = true; resolve(hit); } }
        });
      }
      var timer = setTimeout(fallback, timeoutMs);
      fetch(req).then(function (res) {
        clearTimeout(timer);
        if (res && res.ok) { cache.put(req, res.clone()); }
        if (!done) { done = true; resolve(res); }
      }).catch(function () {
        clearTimeout(timer);
        cache.match(req, { ignoreSearch: true }).then(function (hit) {
          if (!done) { done = true; resolve(hit || new Response('Offline', { status: 503, statusText: 'Offline' })); }
        });
      });
    });
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Never intercept data/API/auth traffic
  if (/supabase\.(co|in)$/.test(url.hostname)) return;
  if (url.pathname.indexOf('/rest/v1/') !== -1 || url.pathname.indexOf('/auth/v1/') !== -1) return;

  // Page navigations and same-origin app files: network first, cached copy if offline/slow
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(networkFirst(new Request('./index.html'), SHELL, 4000));
      return;
    }
    event.respondWith(networkFirst(req, SHELL, 4000));
    return;
  }

  // Known libraries and fonts: cached copy first, refreshed in background
  if (/(^|\.)jsdelivr\.net$|fonts\.googleapis\.com$|fonts\.gstatic\.com$/.test(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, LIBS));
  }
});

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
