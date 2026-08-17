# Pet Alert PH v6.4 — Runtime Cache

Changes:
- Enables Next.js 16 `cacheComponents`.
- Replaces legacy `unstable_cache()` photo fallback with function-scoped `"use cache"`.
- Uses `cacheLife("max")` for immutable UUID/versioned photo objects.
- Keeps canonical path keying, browser/PWA caching, 1-year Vercel CDN headers, Supabase origin diagnostics, and route diagnostics.
- Bumps cache tag/diagnostic architecture label to v6.4.

Delivery path:
Browser/PWA → Vercel CDN → Next.js 16 Runtime Cache → Supabase Storage.

No SQL changes are required for this update. Existing v6.3 diagnostic RPCs/tables remain in use.
