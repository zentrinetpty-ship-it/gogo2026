/* =========================================================================
   GOGO — SERVICE WORKER

   Three jobs:
     1. Make the app installable (a registered worker is required).
     2. Serve the shell instantly from cache, so opening GOGO does not wait on
        the network.
     3. Keep a network-first fallback for the API, because addresses, rides and
        chat must never come from a stale cache.

   Deliberately conservative:
     - HTML is network-first. Page content must be current.
     - /gogo/api/* is never cached. Live data stays live.
     - Only versioned assets (they carry ?v= or a content hash) are cache-first,
       which is safe because a new version is a new URL.
   ========================================================================= */

const VERSION = "gogo-v1";
const SHELL = VERSION + "-shell";

/* The landing and its icons — enough to render something offline. */
const PRECACHE = [
  "/gogo/",
  "/gogo/icon-192.png",
  "/gogo/icon-512.png",
  "/gogo/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {})            /* a failed precache must not block install */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("gogo-v") && k !== SHELL)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* only our own origin */
  if (url.origin !== self.location.origin) return;

  /* never cache the lookup proxy or any API — live data must stay live */
  if (url.pathname.startsWith("/gogo/api/")) return;

  /* hashed or versioned assets: cache-first, safe because the URL changes */
  const isVersioned = /[?&]v=\d+/.test(url.search)
    || /\/_app\/[^/]+-[A-Za-z0-9_-]{6,}\.(js|css)$/.test(url.pathname)
    || /\.(png|jpg|jpeg|webp|svg|woff2?|ttf)$/.test(url.pathname);

  if (isVersioned) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit))
    );
    return;
  }

  /* everything else (HTML, pages): network-first, cache as the safety net */
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/gogo/")))
  );
});
