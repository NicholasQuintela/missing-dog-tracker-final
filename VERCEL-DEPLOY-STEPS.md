# Pet Alert PH repair deployment

## 1. Replace the GitHub repository files

On GitHub, open the repository root, choose **Add file → Upload files**, then upload every file and folder inside this extracted project. Upload the contents, not the ZIP itself.

Use commit message: `Repair Pet Alert PH authentication and notifications`

## 2. Verify Vercel environment variables

In Vercel → Project → Settings → Environment Variables, confirm these exact names exist for Production, Preview, and Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Copy both values from the same Supabase project under Supabase → Project Settings → API. Do not use the service-role key.

A 401 response from `/rest/v1/...` usually means the anon key is missing, incorrect, or belongs to a different Supabase project. After changing variables, redeploy.

## 3. Supabase authentication settings

In Supabase → Authentication → URL Configuration:

- Site URL: your production Vercel URL
- Redirect URL: `https://YOUR-DOMAIN.vercel.app/auth/callback`

In Authentication → Providers, enable Email.

## 4. Apply database repair SQL

Run `supabase-auth-notifications.sql` once in Supabase SQL Editor. It is written to be safe to run again.

## 5. Test

1. Open the website.
2. Click **Log in** in the header.
3. Switch to **Sign up** and create an account.
4. If email confirmation is on, click the confirmation link.
5. Log in and post a report.
6. Use a second account/browser to volunteer or mark the dog found.
7. Check the owner's notification bell.
