# Pet Alert PH additional upgrade

## 1. Run SQL
In Supabase SQL Editor, run `pawfinder-sightings-sharing-legal-storage-upgrade.sql` once.

## 2. Upload the full project to GitHub
Upload all contents of this folder and commit with: `Add sightings sharing delete controls and legal pages`.
Wait for Vercel to reach Ready.

## 3. Test
- Log in as Account A and create a report.
- Open it and use Share. Open the copied URL in another browser.
- Log in as Account B, report a sighting, select Account A's dog, and pin a location. The map pin must be green.
- Account A should receive a sighting notification.
- The report owner can delete their report. The sighting creator can delete their sighting.

## 4. Replace legal placeholders
Edit `app/terms/page.tsx` and `app/privacy/page.tsx`. Replace `support@yourdomain.example` and `privacy@yourdomain.example` with a real monitored email and add the operator's identity/contact details before public launch.
A locally licensed lawyer should review the final Terms and Privacy Notice. Terms cannot guarantee zero liability.

## 5. Optional actual photo deletion
The SQL queues deleted and 180-day-old photos. Actual object deletion is handled by `supabase/functions/cleanup-photos/index.ts` using the Supabase Storage API.
Deploy it with Supabase CLI:

```bash
supabase functions deploy cleanup-photos
supabase secrets set CLEANUP_SECRET="use-a-long-random-secret"
```

Call the function weekly with an Authorization header: `Bearer YOUR_SECRET`. Supabase Cron can invoke it through `pg_net`, or another scheduler can send the request. Until this function is deployed, rows are queued but actual files are not removed from the Storage bucket.

## Storage controls
- Report, found-proof, and sighting images are limited in the UI to 2 MB.
- Chat stays text-only.
- Read notifications can be cleaned after 90 days using the earlier cleanup function.
- Images are queued after deletion, and active sighting/found-case photos can be queued after 180 days.
