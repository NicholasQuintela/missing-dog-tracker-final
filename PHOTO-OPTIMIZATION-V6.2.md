# Pet Alert PH — Photo Optimization Policy

Current policy as of v6.3.6:

- Strict original file limit: 1 MB
- Client-side WebP conversion before upload
- Maximum starting dimension: 1280 px on the longest edge
- Preferred output target: about 120 KB
- Hard optimized-output cap: 200 KB
- Multiple WebP quality levels are attempted, down to 0.35
- If needed, dimensions are progressively reduced to a 480 px longest-edge floor
- Missing reports, sightings, and found-pet proof photos share the same optimizer
- Existing stored photos are not modified

The optimizer resamples from the original image at each size step to avoid compounding compression blur. It also checks that the browser really generated WebP output.

The existing canonical Vercel photo caching architecture is unchanged.
