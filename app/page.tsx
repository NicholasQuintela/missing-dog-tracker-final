import { FinderApp } from "@/components/finder-app"
import { getInitialPublicData } from "@/lib/public-data"

// Safety fallback: on-demand database webhooks normally invalidate this cache.
// If a webhook is temporarily unavailable, a real visitor can refresh it after 5 minutes.
// There is no background polling.
export const revalidate = 300

export default async function Page() {
  const data = await getInitialPublicData()

  return (
    <FinderApp
      initialDogs={data.dogs}
      initialMapDogs={data.mapDogs}
      initialCounts={data.counts}
      initialSightings={data.sightings}
      totalActiveDogs={data.totalActiveDogs}
    />
  )
}
