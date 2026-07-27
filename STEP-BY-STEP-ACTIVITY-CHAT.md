# Pet Alert PH Activity + Chat Deployment

## 1. Run the new SQL
In Supabase, open **SQL Editor → New query**. Copy everything from `pawfinder-activity-chat-upgrade.sql`, paste it, and click **Run**.

This adds secure account-based volunteers, private conversations, text-only messages, complete activity notifications, realtime updates, and cleanup support. It does not delete lost-dog reports.

## 2. Upload the updated project to GitHub
Open the extracted project folder. In the GitHub repository root, choose **Add file → Upload files**. Drag everything inside this folder to GitHub. Use the commit message:

`Add secure volunteers activity center and private chat`

Commit directly to `main`.

## 3. Wait for Vercel
Open **Vercel → Project → Deployments**. Wait until the newest deployment says **Ready**. If it fails, open Build Logs and copy the first red error.

## 4. Test with two accounts
1. Account A logs in and creates a brand-new dog report.
2. Account B logs in, opens that report, and volunteers.
3. Account A sees a bell badge. The bell is now fixed above the map.
4. Account A taps the notification, then opens the private chat.
5. Send messages in both directions and confirm realtime delivery.

Older reports with an empty `owner_id` cannot receive owner notifications. Use a newly created report for testing.

## 5. Optional automatic cleanup
In Supabase Cron, schedule this SQL weekly:

`select public.cleanup_pawfinder_activity();`

The app is text-only for chat, so it does not consume Storage bucket space. Read notifications older than 90 days and old chat messages from found cases are cleaned by the function.
