# Pet Alert PH Safety Update

This update adds abuse reporting, 100-per-month limits for missing reports and sightings, owner-only editing, volunteer privacy, super-admin assignment, your support contact, Cloudflare Turnstile CAPTCHA, and owner confirmation of found claims.

## Required environment variables

Create a Cloudflare Turnstile widget for your Vercel domain, then add these in Vercel Project Settings → Environment Variables:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

Enable CAPTCHA in Supabase Authentication → Bot and Abuse Protection using the same Turnstile secret.

## SQL

Run `pet-alert-ph-safety-update.sql` once in Supabase SQL Editor before uploading the code.

The SQL automatically makes the Supabase account with email `quintelanicholas3@gmail.com` a `super_admin`. If that email account does not exist yet, create and confirm it, then rerun only the admin INSERT shown in the deployment instructions.
