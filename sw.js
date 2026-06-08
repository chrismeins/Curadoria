// ============================================================
// SommCurator — sw.js
// Service Worker: Cache + IndexedDB + Sync bidirecional
// Versão: 1.0
// ============================================================

const SW_VERSION    = 'sc-v1.0';
const CACHE_STATIC  = `${SW_VERSION}-static`;
const CACHE_API     = `${SW_VERSION}-api`;
const IDB_NAME      = 'sommcurator-offline';
const IDB_VERSION   = 1;

// Arquivos que sempre ficam em cache (shell do app)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── INSTALL ──────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('sc-') && k !== CACHE_STATIC && k !== CACHE_API)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Supabase REST API → network-first com fallback para IDB
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1/')) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }

  // 2. App shell → cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(handleStaticRequest(event.request));
    return;
  }

  // 3. Tudo mais → network normal
  event.respondWith(fetch(event.request));
});

// ── API HANDLER (network-first + IDB fallback) ───────────────────────────
async function handleApiRequest(request) {
  // Apenas GET vai para cache/IDB — mutations sempre vão para a rede
  if (request.method !== 'GET') {
    try {
      const response = await fetch(request.clone());
      return response;
    } catch(e) {
      // Offline durante mutation → enfileirar para sync
      await enqueueOperation(request.clone());
      return new Response(
        JSON.stringify({ offline: true, queued: true }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // GET: tenta rede primeiro
  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse.ok) {
      // Salva no cache de API
      const cache = await caches.open(CACHE_API);
      cache.put(request.clone(), networkResponse.clone());
      // Salva no IDB para acesso estruturado
      await saveToIDB(request.url, await networkResponse.clone().json());
    }
    return networkResponse;
  } catch(e) {
    // Offline → tenta IDB primeiro, depois cache
    const idbData = await getFromIDB(request.url);
    if (idbData) {
      return new Response(JSON.stringify(idbData), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Offline': 'true' }
      });
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Offline': 'true' }
    });
  }
}

// ── STATIC HANDLER (cache-first) ─────────────────────────────────────────
async function handleStaticRequest(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch(e) {
    // Offline e não tem cache — retorna o index.html (SPA fallback)
    return caches.match('/index.html');
  }
}

// ── INDEXEDDB ─────────────────────────────────────────────────────────────
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      // Store de cache de API (GET responses)
      if (!db.objectStoreNames.contains('api_cache')) {
        const store = db.createObjectStore('api_cache', { keyPath: 'url' });
        store.createIndex('updated_at', 'updated_at');
      }
      // Store de operações pendentes (mutations offline)
      if (!db.objectStoreNames.contains('pending_ops')) {
        const ops = db.createObjectStore('pending_ops', {
          keyPath: 'id', autoIncrement: true
        });
        ops.createIndex('created_at', 'created_at');
        ops.createIndex('table_name', 'table_name');
      }
      // Store de dados locais por entidade
      if (!db.objectStoreNames.contains('sc_avaliacoes')) {
        const av = db.createObjectStore('sc_avaliacoes', { keyPath: 'id' });
        av.createIndex('user_id',    'user_id');
        av.createIndex('carta_id',   'carta_id');
        av.createIndex('updated_at', 'updated_at');
      }
      if (!db.objectStoreNames.contains('sc_projetos')) {
        db.createObjectStore('sc_projetos', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sc_cartas')) {
        const ct = db.createObjectStore('sc_cartas', { keyPath: 'id' });
        ct.createIndex('projeto_id', 'projeto_id');
      }
      if (!db.objectStoreNames.contains('sc_biblioteca')) {
        const bib = db.createObjectStore('sc_biblioteca', { keyPath: 'id' });
        bib.createIndex('nome_lower', 'nome_lower');
        bib.createIndex('tipo',       'tipo');
      }
      if (!db.objectStoreNames.contains('sc_itens_carta')) {
        const ic = db.createObjectStore('sc_itens_carta', { keyPath: 'id' });
        ic.createIndex('carta_id',     'carta_id');
        ic.createIndex('avaliacao_id', 'avaliacao_id');
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function saveToIDB(url, data) {
  try {
    const db    = await openIDB();
    const tx    = db.transaction('api_cache', 'readwrite');
    const store = tx.objectStore('api_cache');
    store.put({ url, data, updated_at: Date.now() });
    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror    = rej;
    });
  } catch(e) { console.warn('[SW] saveToIDB:', e); }
}

async function getFromIDB(url) {
  try {
    const db    = await openIDB();
    const tx    = db.transaction('api_cache', 'readonly');
    const store = tx.objectStore('api_cache');
    return new Promise((resolve, reject) => {
      const req    = store.get(url);
      req.onsuccess = e => resolve(e.target.result?.data || null);
      req.onerror   = () => resolve(null);
    });
  } catch(e) { return null; }
}

// ── PENDING OPERATIONS QUEUE ──────────────────────────────────────────────
async function enqueueOperation(request) {
  try {
    const body = await request.text().catch(() => '');
    const db   = await openIDB();
    const tx   = db.transaction('pending_ops', 'readwrite');
    tx.objectStore('pending_ops').add({
      url:        request.url,
      method:     request.method,
      headers:    Object.fromEntries(request.headers.entries()),
      body,
      table_name: extractTableName(request.url),
      created_at: Date.now(),
      retries:    0
    });
    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror    = rej;
    });
  } catch(e) { console.warn('[SW] enqueueOperation:', e); }
}

function extractTableName(url) {
  const match = url.match(/\/rest\/v1\/([^?]+)/);
  return match ? match[1] : 'unknown';
}

// ── BACKGROUND SYNC ───────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sc-sync-pending') {
    event.waitUntil(syncPendingOperations());
  }
});

async function syncPendingOperations() {
  const db  = await openIDB();
  const tx  = db.transaction('pending_ops', 'readonly');
  const ops = await new Promise((resolve, reject) => {
    const req = tx.objectStore('pending_ops').getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror   = () => resolve([]);
  });

  const results = { success: 0, failed: 0 };

  for (const op of ops) {
    try {
      const response = await fetch(op.url, {
        method:  op.method,
        headers: op.headers,
        body:    op.body || undefined,
      });

      if (response.ok) {
        // Remove da fila
        const delTx = db.transaction('pending_ops', 'readwrite');
        delTx.objectStore('pending_ops').delete(op.id);
        results.success++;
      } else {
        await incrementRetry(db, op);
        results.failed++;
      }
    } catch(e) {
      await incrementRetry(db, op);
      results.failed++;
    }
  }

  // Notifica o app sobre o resultado
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({
    type:    'SC_SYNC_COMPLETE',
    success: results.success,
    failed:  results.failed
  }));

  return results;
}

async function incrementRetry(db, op) {
  if (op.retries >= 5) {
    // Desiste após 5 tentativas
    const tx = db.transaction('pending_ops', 'readwrite');
    tx.objectStore('pending_ops').delete(op.id);
    return;
  }
  const tx = db.transaction('pending_ops', 'readwrite');
  tx.objectStore('pending_ops').put({ ...op, retries: op.retries + 1 });
}

// ── MENSAGENS DO APP ──────────────────────────────────────────────────────
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  switch(type) {
    case 'SC_FORCE_SYNC':
      syncPendingOperations().then(result => {
        event.source?.postMessage({ type: 'SC_SYNC_COMPLETE', ...result });
      });
      break;

    case 'SC_SAVE_LOCAL':
      // App salva dado localmente (modo offline)
      saveEntityLocal(payload.store, payload.data).then(() => {
        event.source?.postMessage({ type: 'SC_SAVE_LOCAL_OK', id: payload.data.id });
      });
      break;

    case 'SC_GET_PENDING_COUNT':
      getPendingCount().then(count => {
        event.source?.postMessage({ type: 'SC_PENDING_COUNT', count });
      });
      break;

    case 'SC_CLEAR_CACHE':
      caches.delete(CACHE_API).then(() => {
        event.source?.postMessage({ type: 'SC_CACHE_CLEARED' });
      });
      break;
  }
});

async function saveEntityLocal(storeName, data) {
  try {
    const db = await openIDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put({
      ...data,
      _offline: true,
      _saved_at: Date.now()
    });
    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror    = rej;
    });
  } catch(e) { console.warn('[SW] saveEntityLocal:', e); }
}

async function getPendingCount() {
  try {
    const db    = await openIDB();
    const tx    = db.transaction('pending_ops', 'readonly');
    const store = tx.objectStore('pending_ops');
    return new Promise((resolve) => {
      const req    = store.count();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = () => resolve(0);
    });
  } catch(e) { return 0; }
}

// ── PUSH NOTIFICATIONS (estrutura futura) ────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'SommCurator', {
      body:    data.body || '',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/badge-72.png',
      tag:     data.tag || 'sc-notification',
      data:    data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(event.notification.data || '/')
  );
});

console.log(`[SW] SommCurator Service Worker ${SW_VERSION} loaded`);
