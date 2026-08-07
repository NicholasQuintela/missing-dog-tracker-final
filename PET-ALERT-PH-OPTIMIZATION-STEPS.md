# Pet Alert PH – Website Optimization Update

This release is intentionally focused on bandwidth and storage efficiency without changing the user-facing workflows.

## Included optimizations

1. Photos are resized in the browser before upload (maximum ~1280px).
2. Uploads are converted to WebP and compressed toward ~500 KB.
3. Extremely large source photos are rejected before upload (15 MB source limit).
4. Supabase Storage cache lifetime for new immutable photos is increased to one year.
5. Report/list images use native lazy loading and asynchronous decoding.
6. Initial public Supabase queries request only the columns the app actually needs instead of `select(*)`.
7. Existing live location remains local to the device and is not written continuously to Supabase.

## Deployment

No SQL migration is required for this optimization release.

1. Back up the current GitHub repository.
2. Upload the full contents of this folder to the same repository.
3. Commit with: `Optimize Pet Alert PH bandwidth and image uploads`
4. Wait for Vercel to deploy successfully.
5. Test a missing-pet report, a sighting, and a found claim with photos.
6. In Supabase Storage, verify new files end in `.webp` and are much smaller than the originals.

## Notes

- Existing photos are not recompressed; only new uploads are optimized.
- Browser HTTP caching will reuse unchanged public image URLs where supported.
- A later database migration can add dedicated thumbnails if usage grows enough to justify the extra storage objects and schema fields.
