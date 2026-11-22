# Scan a Pet implementation notes

This website revision changes Scan a Pet to a single-photo workflow:
- The user uploads one photo and clicks Scan for Similar Pets.
- The uploaded photo is embedded locally in the browser using ONNX Runtime Web / WASM CPU.
- The public scan-candidates API returns the latest 30 active Missing Pet reports and latest 30 active Pet Sightings, with public photo fields only.
- Candidate report photos are fetched through the site's existing public photo proxy and compared locally; the user's uploaded photo is not sent to the server.
- The UI displays the top 10 visual similarity results with links to the relevant Missing Pet report or Sighting.

This is a prototype, not validated individual-pet identification. It does not guarantee the same pet is shown. Scores are relative similarity values, not probabilities. The search set is capped at 30 active missing reports and 30 active sightings per scan. Reports without photos or inaccessible photos are skipped.

No SQL migration or additional environment variables are required for this revision. It uses the existing public Supabase environment configuration and existing public photo proxy/cache architecture. The embeddings starter SQL remains a proposal and is not used by this browser-only prototype.

Preserve the current photo system:
- Supabase photo storage/backup
- Cloudflare R2 photo delivery priority
- Vercel public photo proxy
- existing CDN/browser/service-worker caching

Future production matching should use validated embeddings and a scalable indexed search for all active report/sighting photos, rather than downloading and comparing a limited batch of photos in each browser session.
