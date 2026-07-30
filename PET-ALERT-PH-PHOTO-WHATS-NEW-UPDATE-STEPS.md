# Pet Alert PH — Photo Viewing + What's New Update

## Included in this update

1. Homepage report cards remain unchanged. Cropped card thumbnails are still used.
2. Missing-pet and sighting photos in Report Details now keep their original aspect ratio and show the whole image.
3. Tapping a Report Details photo opens a larger full-screen viewer.
4. A What's New overlay appears whenever the website is refreshed.
5. Tap anywhere to dismiss the What's New overlay.
6. No Supabase SQL or environment-variable changes are required.

## Deploy through GitHub

1. Download and extract the ZIP.
2. Open your GitHub repository.
3. Click **Add file** → **Upload files**.
4. Upload all files and folders from the extracted ZIP. Keep the same folder structure and replace matching files.
5. Commit with: `Add full photo viewer and What's New overlay`
6. Open Vercel → your project → **Deployments**.
7. Wait until the latest deployment says **Ready**.
8. Open the live website and refresh it.

## Test after deployment

- Refresh the homepage and confirm the What's New overlay appears.
- Tap anywhere and confirm it disappears.
- Open a missing-pet report and confirm its full photo is visible without cropping.
- Tap the photo and confirm the full-screen viewer opens.
- Tap outside the image or the X button to close it.
- Repeat the same test on a sighting report with a photo.
