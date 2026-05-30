// PROVENDA Service Worker v4.45.0
// Se met à jour automatiquement + Push notifications

const CACHE_NAME = 'provenda-v4.45.0';

// Installation — vider l'ancien cache immédiatement
self.addEventListener('install', e => {
  self.skipWaiting(); // Prendre le contrôle immédiatement
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k))) // Supprimer TOUS les anciens caches
    ).then(() =>
      caches.open(CACHE_NAME).then(cache =>
        cache.addAll(['/index.html', '/css/style.css', '/manifest.json']).catch(()=>{})
      )
    )
  );
});

// Activation — prendre le contrôle de tous les clients
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // Contrôle immédiat
  );
});

// Fetch — réseau en priorité, cache en fallback
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase → toujours réseau
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response('{"error":"offline"}', {headers:{'Content-Type':'application/json'}})
    ));
    return;
  }

  // Ne pas intercepter la mini-app carte (a son propre SW sw-carte.js)
  if (url.pathname.startsWith('/carte.html') || url.pathname === '/sw-carte.js' || url.pathname === '/manifest-carte.json') {
    return;
  }

  // Tout le reste → réseau d'abord, cache en fallback
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && url.origin === self.location.origin) {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
  );
});

// ── PUSH NOTIFICATIONS ─────────────────────────────
// Réception d'une notif push depuis l'Edge Function send-push
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err) { data = { title:'PROVENDA', body: e.data?.text() || '' }; }
  const title = data.title || 'PROVENDA';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag: data.tag || 'provenda',
    data: { url: data.url || '/' },
    renotify: true,
    requireInteraction: false
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur la notif → focus l'app ou ouvre l'URL
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(clientList => {
      // Si une fenêtre PROVENDA est déjà ouverte, focus-la
      for (const c of clientList) {
        if (c.url.startsWith(self.location.origin)) {
          c.focus();
          if (targetUrl && targetUrl !== '/') {
            try { c.postMessage({ type:'push-navigate', url: targetUrl }); } catch(_){}
          }
          return;
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      return self.clients.openWindow(targetUrl);
    })
  );
});
