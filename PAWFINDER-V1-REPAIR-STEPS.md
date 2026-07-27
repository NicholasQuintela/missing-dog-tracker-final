# PawFinder v1 repair steps

This version repairs the three connected workflows:

1. A signed-in user volunteers, the volunteer row stores their account ID, and a private chat is created.
2. A signed-in user posts a linked sighting, the sighting is saved, and a private chat with the owner is created.
3. A signed-in user marks a dog found, the finder account is saved, and a private chat with the owner is created.

## Important order

Run `pawfinder-v1-repair.sql` first, then upload the website files to GitHub.

## Test with two accounts

- Account A creates a new lost-dog report.
- Account B volunteers. Both accounts should receive a notification that opens the same chat.
- Account B posts a linked sighting. Both accounts should receive a notification that opens the same private case chat.
- On a separate new report, Account B marks the dog found. Both accounts should receive a notification that opens the private chat.

Old reports with `owner_id = NULL` cannot create owner chats. Create a new report while logged in for testing.
