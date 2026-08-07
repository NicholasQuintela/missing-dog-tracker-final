import { FinderApp } from "@/components/finder-app"
import { createClient } from "@/lib/supabase/server"
import type { MissingDog, Sighting } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = await createClient()

  const { data: dogs } = await supabase
    .from("missing_dogs")
    .select("id,owner_id,name,breed_details,photo_url,photo_path,reward,reward_currency,contact_info,latitude,longitude,region,city,barangay,street_or_landmark,location_source,last_seen,status,created_at,found_by,found_by_user_id,found_photo_url,found_photo_path,found_note,found_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })

  const { data: volunteers } = await supabase.rpc("get_volunteer_counts")
  const { data: sightings } = await supabase.from("sightings").select("id,reporter_id,dog_id,title,description,photo_url,photo_path,latitude,longitude,region,city,barangay,street_or_landmark,location_source,seen_at,contact_info,status,created_at").eq("status", "active").order("created_at", { ascending: false })

  const counts: Record<string, number> = {}
  for (const v of (volunteers as { dog_id: string; volunteer_count: number }[]) || []) {
    counts[v.dog_id] = Number(v.volunteer_count || 0)
  }

  return <FinderApp initialDogs={(dogs as MissingDog[]) || []} initialCounts={counts} initialSightings={(sightings as Sighting[]) || []} />
}
