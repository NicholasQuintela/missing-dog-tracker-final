# Pet Alert PH — Photo Optimization v6.2

Future public pet-photo uploads now use one shared optimization policy:

- Strict original file limit: 1 MB
- Client-side WebP conversion before Supabase upload
- Maximum starting dimension: 1280 px on the longest edge
- Preferred output target: about 120 KB
- Hard optimized-output cap: 200 KB
- Detailed images are progressively resized, down to a 720 px longest-edge floor if needed
- Missing reports, sightings, and found-pet proof photos share the same 1 MB input limit
- Existing stored photos are not modified

The existing canonical Vercel photo caching architecture remains unchanged. The PETALERT_ORIGIN_EXECUTED diagnostic log is preserved in photo-delivery-server.ts.
