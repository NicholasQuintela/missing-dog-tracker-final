# Pet Alert PH — New Supabase Switch + Legacy Claim

This build adds the in-app **Welcome back / Claim my reports** flow and supports the new Supabase publishable-key environment variable.

## Before switching
- Keep the old Supabase project untouched as a rollback backup.
- New database schema, imported reports/sightings, Storage files, claim RPCs, CAPTCHA, and Super Admin should already be configured.

## Vercel environment variables
In Vercel → Project → Settings → Environment Variables:

1. Set `NEXT_PUBLIC_SUPABASE_URL` to the NEW project URL.
2. Add/set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the NEW project publishable key.
3. You may remove the old `NEXT_PUBLIC_SUPABASE_ANON_KEY` after the new publishable key is confirmed working. The app supports either, but prioritizes the publishable key.
4. Keep the existing Turnstile variables unchanged unless you intentionally rotated those keys.

Apply the Supabase variables to Production, Preview, and Development if you use all three environments.

## Deploy
Upload the whole project to GitHub and commit. Vercel should redeploy automatically.

## First test
1. Open the production site.
2. Create/log into the NEW Supabase account using an email that existed in `legacy_account_map` and had an imported report.
3. The Welcome back dialog should appear only if that email has unclaimed legacy reports/sightings.
4. Press **Claim my reports**.
5. The page reloads.
6. Open the old report and confirm Edit/Delete ownership controls now belong to the new account.
7. Confirm the row in `legacy_account_map` now has `claimed_by` and `claimed_at`.

## New users
Emails with no legacy records see no migration dialog.

## Maybe later
Closing the dialog makes no database changes. It can appear again on a later visit until the reports are claimed.
