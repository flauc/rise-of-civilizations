const CACHE_NAME = "rise-of-civ-v3-art";

// Core shell files that should be available immediately after install.
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/maskable-icon-192.png",
  "/privacy.html",
  "/terms.html",
  "/delete-account.html",
];

/** Immutable PNG sprites — cache-first on repeat visits. */
const ART_PREFIXES = [
  "/hex-terrain/",
  "/units/",
  "/roads/",
  "/improvements/",
  "/resources/",
  "/natural-wonders/",
  "/wonders/",
  "/buildings/",
  "/features/",
  "/ui/",
  "/icons/",
  "/leaders/",
  "/village-rewards/",
  "/barbarian-rewards/",
];

function isGameArt(pathname) {
  return ART_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests for same-origin resources.
  if (request.method !== "GET" || !new URL(request.url).origin.includes(self.location.origin)) {
    return;
  }

  const url = new URL(request.url);

  // Standalone legal pages (no JS required) — network first, do not SPA-fallback.
  if (
    url.pathname === "/privacy.html" ||
    url.pathname === "/terms.html" ||
    url.pathname === "/delete-account.html"
  ) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Game art: cache-first so repeat sessions skip re-downloading hundreds of PNGs.
  if (isGameArt(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        });
      }),
    );
    return;
  }

  // Stale-while-revalidate: serve from cache immediately, refresh in background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => undefined);

      return cached || fetchPromise;
    }),
  );
});
