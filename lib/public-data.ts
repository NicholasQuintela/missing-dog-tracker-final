import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { unstable_cache } from "next/cache"
import type { MissingDog, Sighting } from "@/lib/types"

export const DOG_COLUMNS = "id,owner_id,name,breed_details,photo_url,photo_path,reward,reward_currency,contact_info,latitude,longitude,region,city,barangay,street_or_landmark,location_source,last_seen,status,created_at,found_by,found_by_user_id,found_photo_url,found_photo_path,found_note,found_at"
export const MAP_COLUMNS = "id,name,latitude,longitude,status,created_at"
export const SIGHTING_COLUMNS = "id,reporter_id,dog_id,title,description,photo_url,photo_path,latitude,longitude,region,city,barangay,street_or_landmark,location_source,seen_at,contact_info,status,created_at"

function publicSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !publicKey) throw new Error("Supabase public environment variables are not configured.")

  return createSupabaseClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

// Public homepage data is shared by every visitor. Cache it at Vercel so repeated
// page loads do not repeatedly download the same rows from Supabase.
export const getInitialPublicData = unstable_cache(
  async () => {
    const supabase = publicSupabase()
    const [{ data: dogs }, { data: mapDogs, count: totalActiveDogs }, { data: volunteers }, { data: sightings }] = await Promise.all([
      supabase.from("missing_dogs").select(DOG_COLUMNS).eq("status", "active").order("created_at", { ascending: false }).limit(10),
      supabase.from("missing_dogs").select(MAP_COLUMNS, { count: "exact" }).eq("status", "active").order("created_at", { ascending: false }),
      supabase.rpc("get_volunteer_counts"),
      supabase.from("sightings").select(SIGHTING_COLUMNS).eq("status", "active").order("created_at", { ascending: false }),
    ])

    const counts: Record<string, number> = {}
    for (const v of (volunteers as { dog_id: string; volunteer_count: number }[]) || []) {
      counts[v.dog_id] = Number(v.volunteer_count || 0)
    }

    return {
      dogs: (dogs as MissingDog[]) || [],
      mapDogs: (mapDogs as Array<Pick<MissingDog, "id" | "name" | "latitude" | "longitude" | "status" | "created_at">>) || [],
      counts,
      sightings: (sightings as Sighting[]) || [],
      totalActiveDogs: totalActiveDogs || 0,
    }
  },
  ["petalert-public-home-v1"],
  { tags: ["petalert-public", "petalert-reports", "petalert-sightings", "petalert-volunteers"], revalidate: 300 },
)

export const getPublicReportBatch = unstable_cache(
  async (offset: number, limit: number) => {
    const supabase = publicSupabase()
    const { data, error } = await supabase
      .from("missing_dogs")
      .select(DOG_COLUMNS)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw error
    return (data as MissingDog[]) || []
  },
  ["petalert-public-report-batch-v1"],
  { tags: ["petalert-public", "petalert-reports"], revalidate: 300 },
)

export const getPublicReportById = unstable_cache(
  async (id: string) => {
    const supabase = publicSupabase()
    const { data, error } = await supabase
      .from("missing_dogs")
      .select(DOG_COLUMNS)
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle()
    if (error) throw error
    return (data as MissingDog | null) || null
  },
  ["petalert-public-report-by-id-v1"],
  { tags: ["petalert-public", "petalert-reports"], revalidate: 300 },
)
