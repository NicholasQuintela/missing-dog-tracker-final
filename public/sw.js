/* Pet Alert PH desktop/PWA cache worker
 * Focus: aggressively reuse public pet photos and immutable app assets.
 * Dynamic/private Supabase REST data is intentionally NOT cached.
 */
const VERSION = "pet-alert-ph-pc-v1";
const STATIC_CACHE = `${VERSION}-static`;
const MEDIA_CACHE = `${VERSION}-media`;
const MEDIA_LIMIT = 500;

const PRECACHE = [
  "/icon.svg",
  "/icon-light-32x32.png",
  "/icon-dark-32x32.png",
  "/apple-icon.png",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("pet-alert-ph-pc-") &&
                ![STATIC_CACHE, MEDIA_CACHE].includes(key)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isPetPhoto(url) {
  return (
    url.hostname.endsWith(".supabase.co") &&
    url.pathname.includes("/storage/v1/object/public/dog-photos/")
  );
}

function isStaticAsset(request, url) {
  if (url.origin !== self.location.origin) return false;
  return ["script", "style", "font", "image"].includes(request.destination);
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const extra = keys.length - maxEntries;
  if (extra <= 0) return;
  await Promise.all(keys.slice(0, extra).map((key) => cache.delete(key)));
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    await cache.put(request, response.clone());
    if (maxEntries) void trimCache(cacheName, maxEntries);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Biggest egress saver: public report/sighting/found photos.
  if (isPetPhoto(url)) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE, MEDIA_LIMIT));
    return;
  }

  // Cache hashed Next.js assets/icons locally.
  if (isStaticAsset(request, url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});
