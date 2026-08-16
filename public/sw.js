/* Pet Alert PH desktop/PWA cache worker
 * Focus: aggressively reuse public pet photos and immutable app assets.
 * Dynamic/private Supabase REST data is intentionally NOT cached.
 */
const VERSION = "pet-alert-ph-pc-v3-strict";
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

function legacySupabasePhotoPath(url) {
  if (!url.hostname.endsWith(".supabase.co")) return null;
  const marker = "/storage/v1/object/public/dog-photos/";
  const index = url.pathname.indexOf(marker);
  if (index === -1) return null;
  try {
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return url.pathname.slice(index + marker.length);
  }
}

function isVercelPhotoProxy(url) {
  return url.origin === self.location.origin && url.pathname === "/api/public/photo";
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

  // Strict defense-in-depth: a legacy/raw Supabase public pet-photo URL is
  // rewritten to the same-origin Vercel proxy. The browser never fetches the
  // Storage object directly, even if old client data still contains that URL.
  const legacyPath = legacySupabasePhotoPath(url);
  if (legacyPath) {
    const proxyUrl = new URL("/api/public/photo", self.location.origin);
    proxyUrl.searchParams.set("path", legacyPath);
    const proxyRequest = new Request(proxyUrl.toString(), {
      method: "GET",
      headers: request.headers,
      credentials: "same-origin",
      mode: "same-origin",
    });
    event.respondWith(cacheFirst(proxyRequest, MEDIA_CACHE, MEDIA_LIMIT));
    return;
  }

  // Normal public-photo path: local media cache first, then Vercel.
  if (isVercelPhotoProxy(url)) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE, MEDIA_LIMIT));
    return;
  }

  // Cache hashed Next.js assets/icons locally.
  if (isStaticAsset(request, url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});
