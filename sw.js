// ============================================================
// SommCurator — sw.js v1.1
// SW minimalista: sem cache de HTML, apenas assets estáticos
// O index.html SEMPRE vem da rede para garantir updates
// ============================================================

const SW_VERSION = 'sc-v1.1';
const CACHE_NAME = 'sc-assets-v1.1';

// Apenas assets que nunca mudam (fontes, ícones)
// NÃO inclui index.html — ele sempre vem da rede
const PRECACHE = [];

self.addEventListener('install', event => {
  console.log('[SW] install', SW_VERSION);
  // Ativa imediatamente sem esperar tab fechar
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] activate', SW_VERSION);
  // Remove caches antigos
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
        console.log('[SW] deleting old cache:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // NUNCA cachear HTML — sempre buscar da rede
  if (event.request.destination === 'document' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // NUNCA cachear requests do Supabase
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para tudo mais: rede primeiro, cache como fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SC_FORCE_SYNC') {
    event.source?.postMessage({ type: 'SC_SYNC_COMPLETE', success: 0, failed: 0 });
  }
  if (event.data?.type === 'SC_GET_PENDING_COUNT') {
    event.source?.postMessage({ type: 'SC_PENDING_COUNT', count: 0 });
  }
});
