# Egress Investigation Analytics v2

1. Run `pet-alert-ph-egress-investigation-analytics-v2.sql` in Supabase SQL Editor.
2. Confirm Vercel already has `SUPABASE_SERVICE_ROLE_KEY` (the existing abuse-report server route already uses this variable).
3. Upload/deploy the website files.
4. Admin > Moderation > Analytics > choose a date > Check analytics.
5. For a single day, manually enter Supabase Cached Egress MB to calculate MB/visitor and the amount not explained by Vercel photo-origin bytes.

This does NOT log CDN hits to Supabase. A CDN hit never executes the photo route, which is exactly what we want. It records only actual Vercel -> Supabase photo origin fetches and exact bytes. The diagnostic write is tiny and uses PostgREST, not Supabase Storage Cached Egress.
