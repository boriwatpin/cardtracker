// Point Tracker service worker (v2.3.1) — lets the home-screen app open offline.
// NETWORK FIRST for everything it handles: online you always get the live
// files (so a new deploy shows up immediately); the cached copy is used only
// when the network fails. Supabase (your data) is never touched by this file —
// those requests go straight to the network, and the app's own offline
// handling (local copy + sync later) takes care of them.
const CACHE = 'point-tracker-v2.3.1'; // v2.3.1: renamed so the old cache is cleared on activate
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
  // v2.3.1 (L7): page loads skip the browser's HTTP cache (GitHub Pages lets it
  // keep index.html for 10 min), so "Update now" really loads the new version.
  // If that response was redirected (not allowed as a page response), fall
  // back to the plain request.
  const go = isPage
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => (res.redirected ? fetch(req) : res))
        .catch(() => fetch(req))
    : fetch(req);
  e.respondWith(
    go
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

// ---- v2.3: reminder notifications (sent by the send-reminders function) ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Point Tracker', {
    body: d.body || 'You have benefits to review.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'point-tracker-reminder',
    data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    // v2.3.1 (L8): just bring the open app forward — navigating it reloaded the
    // page and threw away anything typed into an open form.
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
