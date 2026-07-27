import { FinderApp } from "@/components/finder-app"
import { createClient } from "@/lib/supabase/server"
import type { MissingDog, Volunteer, Sighting } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = await createClient()

  const { data: dogs } = await supabase
    .from("missing_dogs")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })

  const { data: volunteers } = await supabase.from("volunteers").select("dog_id")
  const { data: sightings } = await supabase.from("sightings").select("*").eq("status", "active").order("created_at", { ascending: false })

  const counts: Record<string, number> = {}
  for (const v of (volunteers as Pick<Volunteer, "dog_id">[]) || []) {
    counts[v.dog_id] = (counts[v.dog_id] || 0) + 1
  }

  return <FinderApp initialDogs={(dogs as MissingDog[]) || []} initialCounts={counts} initialSightings={(sightings as Sighting[]) || []} />
}
