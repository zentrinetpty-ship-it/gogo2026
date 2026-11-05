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

/* Bumped whenever the caching strategy changes. The activate handler deletes
   every cache that is not the current SHELL, so a new version is what actually
   evicts the old pinned copies from phones that already installed the PWA.
   gogo-v2: stop treating ?v=N as immutable. */
const VERSION = "gogo-v2";
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

  /* ── what is safe to serve cache-first ────────────────────────────────────
     ONLY content-hashed filenames: the bytes and the URL change together, so a
     stale hit is impossible by construction.

     ?v=N query strings are NOT in this group, and treating them as if they were
     cost this project most of a day. `?v=6` is the SAME URL as `?v=1` to the
     cache, so the first copy a phone ever fetched stayed pinned forever and
     every deploy after it was invisible on that device — the code was fixed and
     shipped repeatedly while the phone kept running the broken version. A
     version token is a cache-buster for a browser's HTTP cache, which revalidates;
     it is not a cache-buster for a Cache API entry, which does not.

     So: hashed filenames stay cache-first; everything else, including all ?v=
     assets, is network-first with the cache as an offline fallback. Slightly
     more requests, and no possibility of shipping into a void. */
  const isHashed = /\/_app\/[^/]+-[A-Za-z0-9_-]{6,}\.(js|css)$/.test(url.pathname)
    || /-[0-9a-f]{8,}\.(js|css)$/.test(url.pathname)
    || /\.(png|jpg|jpeg|webp|svg|woff2?|ttf)$/.test(url.pathname);

  if (isHashed) {
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
