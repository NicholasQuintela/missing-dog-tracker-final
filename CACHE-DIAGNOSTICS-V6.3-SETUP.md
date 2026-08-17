# Pet Alert PH Cache Diagnostics v6.3

## What this adds

This version keeps the existing photo delivery flow but adds observability for the two server-side layers we are investigating.

For a photo request:

1. Browser / Service Worker cache may serve it locally.
2. Vercel CDN may serve it without running the photo route.
3. If the photo route executes, v6.3 records that as a **CDN fall-through / route run**.
4. The route then checks the existing Next.js `unstable_cache` result:
   - **Data HIT / rescued** = CDN fell through, but Next.js Data Cache returned an older cached photo and Supabase Storage was not downloaded again.
   - **Data MISS / origin** = the cached photo was freshly populated and the existing origin-fetch logger records the exact Supabase transfer.

The dashboard also records the Vercel Function region and deployment ID for route executions. This lets us see whether cold events correlate with a region or a new deployment.

## Required SQL

Run `pet-alert-ph-cache-diagnostics-v6.3.sql` once in Supabase SQL Editor.

The SQL creates a small diagnostics table plus two RPC functions. It does not modify report, sighting, account, or existing egress tables.

## Important limitation

A true Vercel CDN HIT never executes the application route, so the server cannot write a database row for that HIT. No row is therefore a good sign when a fresh browser request still displays the photo. The new table specifically studies the requests that fall through the CDN.

Data-cache state is inferred from the cached object's stored origin timestamp. A cached object older than 10 seconds is classified as a Data Cache rescue. A just-created object is classified as a Data Cache miss/fill; the existing origin-fetch log remains the authoritative proof that Supabase Storage was actually downloaded.
