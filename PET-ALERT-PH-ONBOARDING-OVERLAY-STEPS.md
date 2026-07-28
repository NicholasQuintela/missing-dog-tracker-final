# Pet Alert PH — Guided Overlay Update

This update adds a two-step guided overlay that appears every time the app is opened:

1. It points to **Report missing dog** and explains how to report a missing pet.
2. After the user taps anywhere, it points to **Report sighting** and explains how to submit a sighting.
3. A second tap dismisses the guide.

The guide intentionally appears again on every new visit or page reload, as requested. It does not use local storage and requires no Supabase migration.

## Deployment

1. Back up the current GitHub repository.
2. Extract the update ZIP.
3. Upload everything inside the extracted folder to the repository root.
4. Commit with: `Add guided report and sighting overlay`
5. Wait for Vercel to deploy.
6. Open the stable production URL and hard-refresh with Ctrl+Shift+R.

## Test

- The first overlay must point to **Report missing dog**.
- Tap anywhere.
- The second overlay must point to **Report sighting**.
- Tap anywhere again to dismiss it.
- Reload the website. The two-step guide should appear again.
- Test on both desktop and phone because the target buttons use responsive labels.
