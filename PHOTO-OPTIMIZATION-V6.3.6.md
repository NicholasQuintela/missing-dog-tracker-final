# Pet Alert PH — Photo Optimization Fix v6.3.6

## Fix

The shared client-side image optimizer now makes more compression attempts before rejecting a photo.

- Keeps the existing 1 MB original-file limit.
- Converts supported browser-readable images to WebP.
- Starts at a maximum 1280 px longest edge.
- Tries multiple WebP quality levels, from 0.82 down to 0.35.
- If the image is still above 200 KB, progressively resizes from the original image down to a 480 px longest edge.
- Uses the first result that meets the hard 200 KB upload limit, while preferring the 120 KB target when possible.
- Verifies the browser actually produced WebP rather than mislabeling another image format.
- Gives a more useful error message if the photo still cannot meet the limit.

## Affected forms

All three forms use the same shared optimizer, so this fix applies to:

- Missing-pet reports
- Pet sightings
- Found-pet proof photos

## Deployment

No database migration or environment-variable change is required for this client-side optimization fix.

1. Replace the current repository contents with this release.
2. Commit and push to the existing GitHub repository.
3. Wait for Vercel deployment to finish.
4. Test a missing-pet report, a sighting, and a found-pet proof photo.
5. Confirm new uploads are WebP and no larger than 200 KB.

Existing stored photos are not modified.
