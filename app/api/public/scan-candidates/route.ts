import { createClient } from "@supabase/supabase-js"

const CANDIDATE_LIMIT = 30
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "public, max-age=30",
  "Vercel-CDN-Cache-Control": "public, max-age=30",
}

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error("Supabase public environment variables are not configured.")

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    const [reportsResult, sightingsResult] = await Promise.all([
      supabase.from("missing_dogs")
        .select("id,name,breed_details,photo_url,photo_path,region,city,barangay,created_at,status")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(CANDIDATE_LIMIT),
      supabase.from("sightings")
        .select("id,title,description,photo_url,photo_path,region,city,barangay,seen_at,created_at,status")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(CANDIDATE_LIMIT),
    ])

    if (reportsResult.error) throw reportsResult.error
    if (sightingsResult.error) throw sightingsResult.error

    return Response.json({
      missingReports: reportsResult.data || [],
      sightings: sightingsResult.data || [],
      limits: { missingReports: CANDIDATE_LIMIT, sightings: CANDIDATE_LIMIT },
    }, { headers: CACHE_HEADERS })
  } catch (error) {
    console.error("Scan candidate fetch failed", error)
    return Response.json({ error: "Unable to load public pet reports for scanning." }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
}
