import { FinderApp } from "@/components/finder-app"
import { createClient } from "@/lib/supabase/server"
import type { MissingDog, Sighting } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = await createClient()

  const { data: dogs } = await supabase
    .from("missing_dogs")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })

  const { data: volunteers } = await supabase.rpc("get_volunteer_counts")
  const { data: sightings } = await supabase.from("sightings").select("*").eq("status", "active").order("created_at", { ascending: false })

  const counts: Record<string, number> = {}
  for (const v of (volunteers as { dog_id: string; volunteer_count: number }[]) || []) {
    counts[v.dog_id] = Number(v.volunteer_count || 0)
  }

  return <FinderApp initialDogs={(dogs as MissingDog[]) || []} initialCounts={counts} initialSightings={(sightings as Sighting[]) || []} />
}
