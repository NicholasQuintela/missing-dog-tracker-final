# Pet Alert PH — Fresh Abuse Report Setup

This version no longer calls the Supabase RPC from the browser. It sends the request to `/api/report-abuse`, verifies the signed-in user on the server, and securely inserts the moderation record.

Required Vercel environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never prefix it with NEXT_PUBLIC)

Get the service-role key from Supabase Project Settings → API Keys. Never expose it in browser code or screenshots.
