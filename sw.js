// Point Tracker service worker (v2.2.2) — lets the home-screen app open offline.
// NETWORK FIRST for everything it handles: online you always get the live
// files (so a new deploy shows up immediately); the cached copy is used only
// when the network fails. Supabase (your data) is never touched by this file —
// those requests go straight to the network, and the app's own offline
// handling (local copy + sync later) takes care of them.
const CACHE = 'point-tracker-v1';
const SHELL = ['./', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png'];
const CDN = /^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isPage = req.mode === 'navigate';
  const sameOrigin = url.origin === self.location.origin;
  if (!isPage && !sameOrigin && !CDN.test(url.hostname)) return; // e.g. Supabase: not ours to cache
  if (!isPage && sameOrigin && url.search) return; // e.g. the app's "is there a new version?" check — never cache
  const key = isPage ? new Request(self.registration.scope) : req; // every page load caches as the app's start page
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(key).then((hit) => hit || Response.error()))
  );
});
