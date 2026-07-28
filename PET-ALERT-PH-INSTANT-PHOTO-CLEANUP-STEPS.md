# Pet Alert PH — Instant Photo Cleanup

This release removes the original missing-report photo when the owner confirms a found claim, removes report/sighting photos when their records are deleted, and queues a fallback cleanup for moderator actions or temporary Storage failures.

Run `pet-alert-ph-instant-photo-cleanup.sql`, deploy `supabase/functions/cleanup-photos/index.ts`, then invoke the function once to remove known legacy photos already queued by older releases.
