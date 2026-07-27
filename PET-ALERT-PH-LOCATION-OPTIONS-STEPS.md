# Pet Alert PH — Address Search and Private Live Location

This update adds three ways to choose a location in both missing-pet and sighting forms:

1. Search by region, city/municipality, barangay, and street/landmark.
2. Use the device's current location or a private live blue marker.
3. Keep tapping the map to place or adjust the report pin.

The private blue marker stays in the browser. It is not saved until the user explicitly presses **Use blue location for report**.

## Setup

1. Run `pet-alert-ph-location-options.sql` in Supabase SQL Editor.
2. Upload the project files to GitHub.
3. Wait for Vercel to deploy.
4. Test on the stable production domain over HTTPS.

No new API key is required. Address lookup uses a server route and OpenStreetMap/Nominatim only when the user presses **Find address**.
