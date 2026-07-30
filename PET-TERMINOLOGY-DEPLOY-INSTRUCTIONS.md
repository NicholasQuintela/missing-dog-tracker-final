# Deploy the Pet terminology update

## Option A: Upload through GitHub website

1. Extract this ZIP on your computer.
2. Open your Pet Alert PH repository on GitHub.
3. Click **Add file** then **Upload files**.
4. Upload the extracted project files and folders. Keep the same folder structure.
5. When GitHub asks about files with the same names, allow the updated files to replace them.
6. Use this commit message: `Update dog wording to pet across the app`
7. Click **Commit changes**.
8. Open Vercel and select the Pet Alert PH project.
9. Vercel should automatically create a new deployment from the GitHub commit.
10. Wait until the deployment status says **Ready**, then open the production website and test it.

## Option B: Replace the repository using Git

From the extracted project folder:

```bash
git add .
git commit -m "Update dog wording to pet across the app"
git push origin main
```

Vercel should deploy automatically after the push.

## What to test after deployment

- Desktop header button says **Report missing pet**.
- Missing-report dialog says **Report a missing pet**.
- Form label says **Pet's name**.
- Submit button says **Post missing pet**.
- Sighting instructions refer to a **pet**, not a dog.
- Found-pet flow refers to a **pet**, not a dog.
- Login, account, chat, metadata, and header tagline use pet wording.
- Existing reports, photos, map pins, authentication, notifications, sharing, and deletion still work.

## Database note

No database table, storage bucket, field, API, or internal code identifier was renamed. Names such as `missing_dogs`, `dog_id`, and `dog-photos` remain unchanged so the existing Supabase setup will continue working.

Some included SQL setup files also received pet-friendly notification fallback text. You do not need to rerun all SQL files just to deploy the visible interface wording update.
