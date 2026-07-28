# Pet Alert PH — Fresh Sighting Report Flow

This release replaces the previous sighting form's photo-selection mechanism.

## Key behavior

- Selecting a mobile photo no longer creates an immediate browser image preview.
- The form stays mounted and shows the selected file name and size.
- JPG, JPEG, PNG, and WebP are accepted up to 5 MB.
- The photo uploads only after the user presses **Post sighting**.
- If the photo upload or database insert fails, the form stays open and preserves the user's text.
- If database creation fails after photo upload, the newly uploaded photo is removed automatically.

No SQL migration is required.
