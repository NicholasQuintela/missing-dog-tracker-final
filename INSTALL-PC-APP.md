# Pet Alert PH PC App

This build turns the existing website into an installable Progressive Web App (PWA) for Windows.

## Deploy first
1. Upload this project to the existing GitHub repository.
2. Let Vercel deploy it.
3. Open https://petalertph.vercel.app in Microsoft Edge or Google Chrome.

## Install on Windows
### Microsoft Edge
1. Open Pet Alert PH.
2. Click the three-dot menu.
3. Choose **Apps > Install Pet Alert PH**.
4. Allow a desktop shortcut if desired.

### Google Chrome
1. Open Pet Alert PH.
2. Click the install icon in the address bar, or Menu > Cast, save, and share > Install page as app.
3. Click Install.

## What is cached
- Public missing-pet photos in `dog-photos`
- Sighting photos
- Found-proof photos
- App scripts, styles, fonts, and icons

Public pet photos are cache-first: once this PC has downloaded an image, later views normally reuse the local copy instead of downloading it again from Supabase. The cache keeps up to 500 pet-photo entries and automatically removes the oldest entries after that.

Messages, notifications, comments, report status, ownership, and other dynamic/private Supabase REST data are deliberately not cached so the app stays current and private. Map tiles are also not forced into offline caching.

The app still needs internet for live reports, login, messaging, maps, and new content. This reduces repeated image egress; it does not make Supabase egress zero.
