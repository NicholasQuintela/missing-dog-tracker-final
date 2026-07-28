# Pet Alert PH — Live Location Fix

This update improves location behavior on the main map and inside missing-pet and sighting forms.

## Improvements

- Locate Me now shows loading and clear permission/GPS errors.
- The map invalidates its size before moving, which fixes maps inside dialogs that did not visually move.
- The map zooms to street level after finding the user.
- A private blue dot and accuracy circle are shown.
- Live location follows movement and includes Center on me, Stop live location, and Use this location for report controls.
- The blue position remains in the browser only and is not saved unless the user explicitly chooses it for a report.

No Supabase SQL or new environment variables are required.
