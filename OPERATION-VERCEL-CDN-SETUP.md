# Operation Vercel CDN — Website v1

This patch keeps Supabase as the source of truth while moving repeated **public reads** behind Vercel caching.
Authentication, writes, account data, moderation, chats, notifications and Supabase Realtime remain direct and are not CDN-cached.

## What is cached

- Homepage public report data (first 10 reports, complete lightweight map index, sightings, volunteer counts) through Next/Vercel cache.
- "Show more" and public report-by-ID responses through `/api/public/reports`.
- Public pet/sighting photos that have a `photo_path` through `/api/public/photo`.

## Freshness model

- No cron job and no polling.
- Database changes trigger a tiny Supabase Database Webhook to `/api/cache/invalidate`.
- The webhook invalidates the public Next/Vercel data cache and homepage.
- Supabase Realtime remains connected in active browsers so new/updated reports still appear promptly.
- A 5-minute request-driven fallback exists if a webhook ever fails. It only runs when somebody actually visits; it does not poll in the background.

## 1. Add one Vercel environment variable

In Vercel -> Project -> Settings -> Environment Variables, add:

`PETALERT_CACHE_WEBHOOK_SECRET`

Use a long random value (at least 32 random characters). Do not put it in GitHub and do not use your Supabase secret/service-role key.
Apply it to Production (and Preview only if you want to test webhooks against previews), then redeploy.

## 2. Create Supabase Database Webhooks

Supabase Dashboard -> Database -> Webhooks.

Create three webhooks. Use the production website URL, for example:

`https://YOUR-PET-ALERT-DOMAIN/api/cache/invalidate`

Method: `POST`

Header:

`x-petalert-cache-secret: THE_SAME_RANDOM_VALUE_FROM_VERCEL`

Keep `Content-Type: application/json`.

Create these webhooks:

1. Table `missing_dogs` — events INSERT, UPDATE, DELETE
2. Table `sightings` — events INSERT, UPDATE, DELETE
3. Table `volunteers` — events INSERT, UPDATE, DELETE

Supabase Database Webhooks are asynchronous, so they do not wait on Vercel before completing the database change.

## 3. Test after deployment

Open DevTools -> Network and reload the website twice.

For `/api/public/reports?...`, inspect response headers. On Vercel you should eventually see `x-vercel-cache: HIT` on repeated requests from the same cache region.

Create a test report (or update an existing safe test record), then verify the webhook shows a successful 200 response and the website receives the change through Realtime.

## Rollback — Operation Abort Vercel CDN

Keep the original pre-CDN repository ZIP untouched.
If this experiment causes higher Vercel usage, stale data, or reliability problems, redeploy the original repository. No Supabase schema migration is required to roll back. Delete/disable the three Database Webhooks after rollback.

## Important security rule

Only public report/read data is cached. Never move authenticated account data, notifications, chats, admin/moderation responses, or Auth endpoints into these public CDN routes.
