# Pet Alert PH — Moderation & Bug Fix Update

This release adds/fixes:

- Reliable abuse-report submission through a secured Supabase RPC
- Abuse reporting for missing-pet reports, sightings, and individual chat messages
- Admin-only Moderation button that opens `/admin/moderation` in a new tab
- Moderation center with Remove Content and Ignore Report actions
- Admin dashboard statistics, including sightings
- Floating Terms & Safety reminder
- Hourly cleanup of solved/found notifications older than 24 hours
- Support contact: Nicholas Quintela — quintelanicholas3@gmail.com

## Install order

1. Back up the currently working GitHub project.
2. Run `pet-alert-ph-moderation-fixes.sql` in Supabase SQL Editor.
3. Confirm that the SQL returns success.
4. Upload everything from this extracted project to the GitHub repository.
5. Commit with: `Add moderation center and abuse report fixes`
6. Wait for Vercel to deploy and hard-refresh the website.

## Admin access

The SQL assigns `super_admin` to the existing Supabase account with email:

`quintelanicholas3@gmail.com`

After login, that account sees a **Moderation** button in the header. The button opens the moderation center in a new tab. Regular users do not see it and cannot access its RPC functions.

## Moderation behavior

- **Remove content** permanently deletes a missing-pet report or sighting. Related records follow existing database cascade rules. For a reported message, its body is replaced with a moderator-removal notice.
- **Ignore report** keeps the original content online and marks the complaint dismissed.
- Optional moderation notes are stored with the decision.

## Notification cleanup

The migration attempts to enable Supabase Cron and schedule an hourly cleanup. If the SQL output contains a notice that Cron scheduling was skipped, create a Supabase Cron job manually:

Schedule: `17 * * * *`

SQL:

```sql
select public.cleanup_solved_pet_alert_notifications();
```
