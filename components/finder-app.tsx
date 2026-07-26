"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { PawPrint, Plus, Search, LocateFixed } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DogCard } from "@/components/dog-card"
import { ReportDialog } from "@/components/report-dialog"
import { VolunteerDialog } from "@/components/volunteer-dialog"
import { FoundDialog } from "@/components/found-dialog"
import { DogDetailDialog } from "@/components/dog-detail-dialog"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog, Volunteer } from "@/lib/types"

const DogMap = dynamic(() => import("@/components/dog-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
})

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006]

type Props = {
  initialDogs: MissingDog[]
  initialCounts: Record<string, number>
}

export function FinderApp({ initialDogs, initialCounts }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [dogs, setDogs] = useState<MissingDog[]>(initialDogs)
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number]>(
    initialDogs.length ? [initialDogs[0].latitude, initialDogs[0].longitude] : DEFAULT_CENTER,
  )
  const [recenterTrigger, setRecenterTrigger] = useState(0)

  const [reportOpen, setReportOpen] = useState(false)
  const [detailDog, setDetailDog] = useState<MissingDog | null>(null)
  const [volunteerDog, setVolunteerDog] = useState<MissingDog | null>(null)
  const [foundDog, setFoundDog] = useState<MissingDog | null>(null)

  // Realtime: new dogs and new volunteers keep every client in sync.
  useEffect(() => {
    const channel = supabase
      .channel("finder-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "missing_dogs" }, (payload) => {
        const dog = payload.new as MissingDog
        setDogs((prev) => (prev.some((d) => d.id === dog.id) ? prev : [dog, ...prev]))
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "missing_dogs" }, (payload) => {
        const dog = payload.new as MissingDog
        setDogs((prev) => prev.map((d) => (d.id === dog.id ? dog : d)))
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "volunteers" }, (payload) => {
        const v = payload.new as Volunteer
        setCounts((prev) => ({ ...prev, [v.dog_id]: (prev[v.dog_id] || 0) + 1 }))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return dogs
    return dogs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.breed_details || "").toLowerCase().includes(q) ||
        (d.last_seen || "").toLowerCase().includes(q),
    )
  }, [dogs, query])

  const selectDog = useCallback((dog: MissingDog) => {
    setSelectedId(dog.id)
    setCenter([dog.latitude, dog.longitude])
    setRecenterTrigger((t) => t + 1)
    setDetailDog(dog)
  }, [])

  const focusDog = useCallback((dog: MissingDog) => {
    setSelectedId(dog.id)
    setCenter([dog.latitude, dog.longitude])
    setRecenterTrigger((t) => t + 1)
  }, [])

  function locateMe() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      setCenter([pos.coords.latitude, pos.coords.longitude])
      setRecenterTrigger((t) => t + 1)
    })
  }

  const totalHelpers = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="z-20 flex items-center justify-between gap-4 border-b border-border bg-card/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <PawPrint className="size-5" />
          </div>
          <div className="leading-tight">
            <h1 className="font-serif text-lg font-extrabold text-foreground">PawFinder</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">Bringing lost dogs home, together</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right text-xs text-muted-foreground sm:block">
            <span className="font-bold text-foreground">{dogs.length}</span> searching ·{" "}
            <span className="font-bold text-foreground">{totalHelpers}</span> helping
          </div>
          <Button size="lg" onClick={() => setReportOpen(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Report missing dog</span>
            <span className="sm:hidden">Report</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-t border-border bg-background md:h-full md:w-96 md:border-t-0 md:border-r">
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, breed, area…"
                className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30"
              />
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
                <PawPrint className="size-8" />
                <p className="text-sm text-pretty">
                  {dogs.length === 0
                    ? "No missing dogs reported yet. Be the first to spread the word."
                    : "No dogs match your search."}
                </p>
              </div>
            ) : (
              filtered.map((dog) => (
                <DogCard
                  key={dog.id}
                  dog={dog}
                  volunteerCount={counts[dog.id] || 0}
                  selected={dog.id === selectedId}
                  onClick={() => selectDog(dog)}
                />
              ))
            )}
          </div>
        </aside>

        <main className="relative min-h-0 flex-1">
          <DogMap
            dogs={filtered}
            selectedId={selectedId}
            onSelect={focusDog}
            center={center}
            recenterTrigger={recenterTrigger}
          />
          <Button
            variant="outline"
            size="icon-lg"
            onClick={locateMe}
            aria-label="Center map on my location"
            className="absolute bottom-6 right-4 z-[500] rounded-full bg-card shadow-lg"
          >
            <LocateFixed className="size-5" />
          </Button>
        </main>
      </div>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        defaultCenter={center}
        onReported={(dog) => {
          setDogs((prev) => (prev.some((d) => d.id === dog.id) ? prev : [dog, ...prev]))
          focusDog(dog)
        }}
      />

      <DogDetailDialog
        open={!!detailDog}
        onClose={() => setDetailDog(null)}
        dog={detailDog}
        onVolunteer={() => {
          setVolunteerDog(detailDog)
          setDetailDog(null)
        }}
        onFound={() => {
          setFoundDog(detailDog)
          setDetailDog(null)
        }}
      />

      <FoundDialog
        open={!!foundDog}
        onClose={() => setFoundDog(null)}
        dog={foundDog}
        onFound={(updated) => {
          setDogs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
        }}
      />

      <VolunteerDialog
        open={!!volunteerDog}
        onClose={() => setVolunteerDog(null)}
        dog={volunteerDog}
        onVolunteered={() => {
          if (volunteerDog) setCounts((prev) => ({ ...prev, [volunteerDog.id]: (prev[volunteerDog.id] || 0) + 1 }))
        }}
      />
    </div>
  )
}
