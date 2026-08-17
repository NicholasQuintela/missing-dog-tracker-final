# Pet Alert PH — Clean Cache Architecture v6

## Goal
Keep the exact same user-facing photo behavior while making the cache path simple and predictable.

## Delivery path

Browser / PWA cache
→ Vercel CDN
→ Next.js Data Cache
→ Supabase Storage only on a genuine final miss

## Rules

1. Raw Supabase public photo URLs are never intentionally exposed to the browser.
2. `/api/public/photo?path=...` is the canonical public photo URL.
3. Browser cache keeps immutable photo URLs for 30 days.
4. Vercel CDN keeps each photo response for up to one year.
5. The second server-side cache has no periodic revalidation. It is keyed by the immutable storage path.
6. A new upload receives a new UUID path, so new content naturally produces a new cache entry without polling Supabase.
7. Existing origin-fetch analytics remain inside the true Supabase fetch function, so cache hits do not inflate origin metrics.
8. Errors are never cached.

## Why this is cleaner than v5

- Caching/origin/diagnostic logic is centralized in `lib/photo-delivery-server.ts`.
- The route is only responsible for validation, delivery and response cache headers.
- No 30-day server revalidation timer that can cause a scheduled origin check.
- Browser, CDN and Data Cache each have one clear responsibility.
- Existing Service Worker strict-routing defense remains in place.

## Important limitation
Vercel caches are still infrastructure caches and can be evicted. A genuine eviction or a new cache namespace/deployment behavior can require a fresh Supabase fetch. The design removes deliberate periodic polling; it cannot promise that a CDN/cache provider will retain an object forever.


## v6.1 Canonical Cache Identity hardening

A possible source of repeated origin traffic is one logical photo being addressed
through multiple equivalent URL encodings. v6.1 eliminates that ambiguity.

The storage object path is canonicalized before all cache decisions. The cached
server function now accepts **only the canonical storage path** as its variable
argument; the encoded Supabase URL is generated inside the origin function.
Therefore these representations collapse to one Data Cache identity:

- `reports/a/photo.webp`
- `reports%2Fa%2Fphoto.webp`
- a legacy double-encoded equivalent

The client photo helper emits one canonical proxy URL, and the service worker
also rewrites/looks up photos using that same canonical URL before touching its
media cache.

This means a different CDN URL representation may still cause a CDN-level miss,
but it should fall through to the **same canonical Data Cache entry** instead of
causing another Supabase download.
