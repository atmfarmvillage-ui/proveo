// ══════════════════════════════════════════════════
// PROVENDA — Service Worker PWA
// Cache intelligent + offline fallback
// ══════════════════════════════════════════════════

const CACHE_NAME = 'provenda-v2.6.0';
const CACHE_STATIC = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/achats.js',
  '/js/admin.js',
  '/js/auth.js',
  '/js/bilanss.js',
  '/js/benefices.js',
  '/js/messages_pdv.js',
  '/js/caisse.js',
  '/js/chat.js',
  '/js/clients.js',
  '/js/config.js',
  '/js/dashboard.js',
  '/js/dettes.js',
  '/js/distribution.js',
  '/js/fournisseurs.js',
  '/js/inventaire_physique.js',
  '/js/matieres.js',
  '/js/paiements_mp.js',
  '/js/print.js',
  '/js/production.js',
  '/js/rapports.js',
  '/js/reversements.js',
  '/js/salaires.js',
  '/js/stock.js',
  '/js/stock_pf.js',
  '/js/ventes.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Crimson+Pro:wght@600;700&family=DM+Mono:wght@400;500&display=swap'
];

// ── INSTALLATION ──────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_STATIC.map(url => new Request(url, {cache: 'reload'})));
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATION ────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase → toujours réseau (données temps réel)
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', {
      headers: {'Content-Type': 'application/json'}
    })));
    return;
  }

  // Google Fonts → cache puis réseau
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return r;
      }))
    );
    return;
  }

  // Fichiers app → cache d'abord, réseau en fallback
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const network = fetch(e.request).then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return r;
        });
        return cached || network;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  e.respondWith(fetch(e.request));
});

// ── PUSH NOTIFICATIONS ────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'PROVENDA', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
