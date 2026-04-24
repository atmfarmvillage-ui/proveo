// PROVENDA Service Worker v3.3.0
// Se met à jour automatiquement

const CACHE_NAME = 'provenda-v3.3.0';

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
