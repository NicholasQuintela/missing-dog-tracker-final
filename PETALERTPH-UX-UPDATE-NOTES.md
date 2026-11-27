# Pet Alert PH UX update

## Included
- Moved Scan a Pet, Report a Pet, and Sighting into a persistent bottom action bar.
- Kept the profile/account and notification controls in the top header.
- Preserved the existing map component, map styling, and missing/sighting pin colors.
- Kept the draggable report sheet and positioned it above the bottom action bar on mobile.
- Kept the Terms, Privacy & Safety control as a shield button and moved it above the action bar.
- Updated the mini-guide to start on the visitor's first tap and explain the three bottom actions in order. Completion is remembered in that browser.
- Added an admin editor for the What's New popup in Admin Moderation.

## Required Supabase setup for What's New editing
Run `pet-alert-ph-whats-new-announcement.sql` in the Supabase SQL Editor before using the announcement editor. See `WHATS-NEW-ADMIN-SETUP.md`.

## Admin visibility
The Admin moderation button remains conditional on the existing `get_my_pet_alert_admin_role()` result. The moderation page also continues to verify the role server-side.
