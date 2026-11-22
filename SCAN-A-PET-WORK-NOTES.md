# Scan a Pet implementation notes for this repository revision

This revision deliberately adds only an **experimental local embedding comparison page** and a **proposed SQL starter**. It is not production Scan a Pet and is not wired into the report/sighting forms or homepage navigation.

Reason: the candidate model has not been validated with Pet Alert PH photos; model input cropping/detection, phone memory/performance, similarity thresholds, database migration and claim/notification workflow still require testing. No database changes have been applied remotely.

Keep the current photo system untouched:
- Supabase photo storage/backup
- Cloudflare R2 photo delivery priority
- Vercel public photo proxy
- existing CDN/browser/service-worker caching

When moving beyond the lab, the production embedding process should use a single pinned model/version and deterministic preprocessing across web and APK. Report and sighting embedding generation should happen locally and should not block ordinary report submissions if the model cannot load; missing embeddings should be retried/backfilled deliberately.
