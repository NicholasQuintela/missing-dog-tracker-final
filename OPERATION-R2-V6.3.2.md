# Pet Alert PH — Operation R2 v6.3.2

This build is based on the working v6.3 Cache Diagnostics architecture.

## Important compatibility fix
- `cacheComponents` is NOT enabled.
- Existing route segment config such as `runtime = "nodejs"` and `dynamic = "force-dynamic"` remains compatible.
- The existing `unstable_cache` fallback is preserved.

## Photo origin order
1. Browser / Service Worker cache
2. Vercel CDN
3. Existing Next.js `unstable_cache`
4. Private Cloudflare R2 `dog-photos`
5. Supabase Storage fallback only if R2 is unavailable or the object is missing

## Required Vercel environment variables
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET=dog-photos`

Do not commit secrets to GitHub.
Do not delete the Supabase copies yet.
