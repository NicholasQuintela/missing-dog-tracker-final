import { FinderApp } from "@/components/finder-app"
import { createClient } from "@/lib/supabase/server"
import type { MissingDog, Sighting } from "@/lib/types"

export const dynamic = "force-dynamic"

const DOG_COLUMNS = "id,owner_id,name,breed_details,photo_url,photo_path,reward,reward_currency,contact_info,latitude,longitude,region,city,barangay,street_or_landmark,location_source,last_seen,status,created_at,found_by,found_by_user_id,found_photo_url,found_photo_path,found_note,found_at"
const MAP_COLUMNS = "id,name,latitude,longitude,status,created_at"

export default async function Page() {
  const supabase = await createClient()

  // Only the first 10 full reports are needed for the feed on first paint.
  const [{ data: dogs }, { data: mapDogs, count: totalActiveDogs }, { data: volunteers }, { data: sightings }] = await Promise.all([
    supabase
      .from("missing_dogs")
      .select(DOG_COLUMNS)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("missing_dogs")
      .select(MAP_COLUMNS, { count: "exact" })
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase.rpc("get_volunteer_counts"),
    supabase
      .from("sightings")
      .select("id,reporter_id,dog_id,title,description,photo_url,photo_path,latitude,longitude,region,city,barangay,street_or_landmark,location_source,seen_at,contact_info,status,created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ])

  const counts: Record<string, number> = {}
  for (const v of (volunteers as { dog_id: string; volunteer_count: number }[]) || []) {
    counts[v.dog_id] = Number(v.volunteer_count || 0)
  }

  return (
    <FinderApp
      initialDogs={(dogs as MissingDog[]) || []}
      initialMapDogs={(mapDogs as Array<Pick<MissingDog, "id" | "name" | "latitude" | "longitude" | "status" | "created_at">>) || []}
      initialCounts={counts}
      initialSightings={(sightings as Sighting[]) || []}
      totalActiveDogs={totalActiveDogs || 0}
    />
  )
}
