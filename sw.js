// SommCurator — sw.js v1.2
// Cache-first para app shell (offline real)
// Network-first para Supabase (dados sempre frescos)

var SW_VERSION = 'sc-v1.2';
var CACHE_NAME = 'sc-assets-v1.2';

var PRECACHE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(PRECACHE); })
      .then(function() { return self.skipWaiting(); })
      .catch(function(err) { console.warn('[SW] precache:', err); return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  var isAppShell = (
    event.request.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/')
  );

  if (isAppShell) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SC_FORCE_SYNC') {
    if (event.source) event.source.postMessage({ type: 'SC_SYNC_COMPLETE', success: 0, failed: 0 });
  }
  if (event.data && event.data.type === 'SC_GET_PENDING_COUNT') {
    if (event.source) event.source.postMessage({ type: 'SC_PENDING_COUNT', count: 0 });
  }
});
