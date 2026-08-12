# Operation Vercel CDN v3

- Pet photo responses use a 30-day Vercel CDN cache (`2592000` seconds).
- Display paths use `/api/public/photo` whenever a `dog-photos` storage path can be derived, including legacy rows that only have `photo_url`.
- My Reports and found-claim proof displays no longer intentionally request Supabase Storage directly.
- Service worker recognizes `/api/public/photo` as media and checks its local media cache first.
- Request order for display photos: local service-worker cache -> Vercel photo endpoint/CDN -> Supabase Storage on a Vercel miss.
- Supabase Realtime/Auth/database writes remain direct and are not routed through the photo CDN.
- No SQL changes are required for v3.
