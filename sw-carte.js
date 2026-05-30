// Service Worker mini-app Carte SADARI v1.5.0
const CACHE = 'sadari-carte-v6';
const ASSETS = [
  '/carte.html',
  '/manifest-carte.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{}))
  );
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE && k.startsWith('sadari-carte-')).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  // Supabase → toujours réseau, jamais en cache
  if(url.hostname.includes('supabase.co')){
    e.respondWith(fetch(e.request).catch(()=>new Response('{"error":"offline"}',{headers:{'Content-Type':'application/json'}})));
    return;
  }
  // Tiles OSM → cache-first (légères, identiques)
  if(url.hostname.includes('tile.openstreetmap.org')){
    e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{
      if(r.ok){ const cl=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cl)); }
      return r;
    }).catch(()=>new Response('',{status:404}))));
    return;
  }
  // Reste → réseau d'abord, cache en fallback
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r.ok && (url.origin===self.location.origin || url.hostname.includes('jsdelivr') || url.hostname.includes('unpkg'))){
        const cl=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cl));
      }
      return r;
    }).catch(()=>caches.match(e.request).then(c=>c||caches.match('/carte.html')))
  );
});
