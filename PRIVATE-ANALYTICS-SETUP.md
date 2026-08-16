# Pet Alert PH Private Visitor Analytics v1

## What it measures
- One anonymous unique browser/device visit per Philippine calendar day.
- Date-range filtering in the existing Admin / Moderation area.
- No IP address, GPS location, email, account profile, or device fingerprint is stored.

## Setup order
1. In Supabase SQL Editor, run `pet-alert-ph-private-visitor-analytics.sql` once.
2. Upload the repository update to GitHub and let Vercel deploy.
3. Visit Pet Alert PH once in a normal or InPrivate browser.
4. Log in as an administrator, open Moderation, then select **Analytics**.
5. Choose From and To dates and click **Check visitors**.

## Egress comparison
Use: `Supabase Cached Egress for the date / unique visitors for the date`.
This is an average, not exact per-person accounting. Private browsing, cleared browser storage, or multiple devices can count separately.

## Traffic impact
The tracker makes at most one tiny analytics RPC write per browser/device per Philippine day under normal browser storage. It does not poll, use Realtime, read analytics back to public visitors, or download analytics records.
