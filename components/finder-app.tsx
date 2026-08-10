"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { PawPrint, Plus, Search, LocateFixed, User, Eye, ShieldCheck, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DogCard } from "@/components/dog-card"
import { ReportDialog } from "@/components/report-dialog"
import { VolunteerDialog } from "@/components/volunteer-dialog"
import { FoundDialog } from "@/components/found-dialog"
import { DogDetailDialog } from "@/components/dog-detail-dialog"
import { SightingDialog } from "@/components/sighting-dialog"
import { SightingDetailDialog } from "@/components/sighting-detail-dialog"
import { AuthDialog } from "@/components/auth-dialog"
import { NotificationBell } from "@/components/notifications"
import { AccountDialog } from "@/components/account-dialog"
import { TermsSafetyButton } from "@/components/terms-safety-button"
import { OnboardingTour } from "@/components/onboarding-tour"
import { WhatsNewOverlay } from "@/components/whats-new-overlay"
import { MobileReportSheet } from "@/components/mobile-report-sheet"
import { UsernameSetupDialog } from "@/components/username-setup-dialog"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog, Volunteer, Sighting } from "@/lib/types"
import type { DogMapMarker } from "@/components/dog-map"

const DogMap = dynamic(() => import("@/components/dog-map"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> })
const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842]
const PAGE_SIZE = 10
const CACHE_KEY = "petalertph:web:loaded-reports:v1"
const DOG_COLUMNS = "id,owner_id,name,breed_details,photo_url,photo_path,reward,reward_currency,contact_info,latitude,longitude,region,city,barangay,street_or_landmark,location_source,last_seen,status,created_at,found_by,found_by_user_id,found_photo_url,found_photo_path,found_note,found_at"

type MapDog = Pick<MissingDog, "id" | "name" | "latitude" | "longitude" | "status" | "created_at">
type Props = {
  initialDogs: MissingDog[]
  initialMapDogs: MapDog[]
  initialCounts: Record<string, number>
  initialSightings: Sighting[]
  totalActiveDogs: number
}

function mergeDogs(primary: MissingDog[], secondary: MissingDog[]) {
  const byId = new Map<string, MissingDog>()
  for (const dog of [...primary, ...secondary]) if (dog?.id && dog.status === "active" && !byId.has(dog.id)) byId.set(dog.id, dog)
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

function readCachedDogs(validIds: Set<string>) {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return [] as MissingDog[]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [] as MissingDog[]
    return parsed.filter((dog): dog is MissingDog => Boolean(dog?.id && validIds.has(dog.id) && dog.status === "active"))
  } catch {
    return [] as MissingDog[]
  }
}

function writeCachedDogs(dogs: MissingDog[]) {
  try {
    // Keep a generous bounded cache. Photos themselves remain browser-cached by URL.
    localStorage.setItem(CACHE_KEY, JSON.stringify(dogs.slice(0, 200)))
  } catch {
    // Storage can be unavailable/private; the feed still works without this optimization.
  }
}

export function FinderApp({ initialDogs, initialMapDogs, initialCounts, initialSightings, totalActiveDogs }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [dogs, setDogs] = useState(initialDogs)
  const [mapDogs, setMapDogs] = useState<MapDog[]>(initialMapDogs)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sightings, setSightings] = useState(initialSightings)
  const [counts, setCounts] = useState(initialCounts)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number]>(initialDogs.length ? [initialDogs[0].latitude, initialDogs[0].longitude] : DEFAULT_CENTER)
  const [recenterTrigger, setRecenterTrigger] = useState(0)
  const [mapUserPoint, setMapUserPoint] = useState<[number, number] | null>(null)
  const [mapUserAccuracy, setMapUserAccuracy] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [adminRole, setAdminRole] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [needsUsername, setNeedsUsername] = useState(false)
  const [authOpen, setAuthOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false), [reportOpen, setReportOpen] = useState(false), [sightingOpen, setSightingOpen] = useState(false)
  const [detailDog, setDetailDog] = useState<MissingDog | null>(null), [detailSighting, setDetailSighting] = useState<Sighting | null>(null), [volunteerDog, setVolunteerDog] = useState<MissingDog | null>(null), [foundDog, setFoundDog] = useState<MissingDog | null>(null)
  const [sightingDogId, setSightingDogId] = useState<string | null>(null)

  // Restore previously opened batches after the server-rendered first 10 are visible.
  useEffect(() => {
    const validIds = new Set(initialMapDogs.map((dog) => dog.id))
    const cached = readCachedDogs(validIds)
    if (cached.length) setDogs((current) => mergeDogs(current, cached))
  }, [initialMapDogs])

  useEffect(() => { writeCachedDogs(dogs) }, [dogs])

  useEffect(() => {
    async function applyUser(nextUser: { id: string; email?: string } | null) {
      setUser(nextUser)
      if (!nextUser) { setAdminRole(null); setUsername(null); setNeedsUsername(false); return }
      const profileResult = await supabase.from("profiles").select("username").eq("id", nextUser.id).maybeSingle()
      const foundUsername = typeof profileResult.data?.username === "string" ? profileResult.data.username : null
      setUsername(foundUsername)
      setNeedsUsername(!foundUsername)
      const roleResult = await supabase.rpc("get_my_pet_alert_admin_role")
      setAdminRole(typeof roleResult.data === "string" ? roleResult.data : null)
    }
    supabase.auth.getUser().then(({ data }) => void applyUser(data.user ? { id: data.user.id, email: data.user.email } : null))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => void applyUser(session?.user ? { id: session.user.id, email: session.user.email } : null))
    return () => listener.subscription.unsubscribe()
  }, [supabase])

  const loadDogById = useCallback(async (id: string) => {
    const existing = dogs.find((dog) => dog.id === id)
    if (existing) return existing
    const { data } = await supabase.from("missing_dogs").select(DOG_COLUMNS).eq("id", id).eq("status", "active").maybeSingle()
    if (!data) return null
    const dog = data as MissingDog
    setDogs((current) => mergeDogs(current, [dog]))
    return dog
  }, [dogs, supabase])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(window.location.search)
    const reportId = params.get("report")
    const sightingId = params.get("sighting")
    if (reportId) void loadDogById(reportId).then((dog) => { if (!cancelled && dog) setDetailDog(dog) })
    if (sightingId) { const sighting = initialSightings.find((item) => item.id === sightingId); if (sighting) setDetailSighting(sighting) }
    return () => { cancelled = true }
  }, [initialSightings, loadDogById])

  useEffect(() => {
    const channel = supabase.channel("finder-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "missing_dogs" }, (payload) => {
        const dog = payload.new as MissingDog
        if (dog.status !== "active") return
        setDogs((current) => mergeDogs([dog], current))
        setMapDogs((current) => [{ id: dog.id, name: dog.name, latitude: dog.latitude, longitude: dog.longitude, status: dog.status, created_at: dog.created_at }, ...current.filter((item) => item.id !== dog.id)])
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "missing_dogs" }, (payload) => {
        const dog = payload.new as MissingDog
        if (dog.status !== "active") {
          setDogs((current) => current.filter((item) => item.id !== dog.id))
          setMapDogs((current) => current.filter((item) => item.id !== dog.id))
          return
        }
        setDogs((current) => current.map((item) => item.id === dog.id ? dog : item))
        setMapDogs((current) => current.map((item) => item.id === dog.id ? { id: dog.id, name: dog.name, latitude: dog.latitude, longitude: dog.longitude, status: dog.status, created_at: dog.created_at } : item))
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "missing_dogs" }, (payload) => {
        const id = (payload.old as MissingDog).id
        setDogs((current) => current.filter((dog) => dog.id !== id))
        setMapDogs((current) => current.filter((dog) => dog.id !== id))
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sightings" }, (payload) => setSightings((current) => [payload.new as Sighting, ...current.filter((item) => item.id !== (payload.new as Sighting).id)]))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "sightings" }, (payload) => setSightings((current) => current.filter((item) => item.id !== (payload.old as Sighting).id)))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "volunteers" }, (payload) => { const volunteer = payload.new as Volunteer; setCounts((current) => ({ ...current, [volunteer.dog_id]: (current[volunteer.dog_id] || 0) + 1 })) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? dogs.filter((dog) => dog.name.toLowerCase().includes(q) || (dog.breed_details || "").toLowerCase().includes(q) || (dog.last_seen || "").toLowerCase().includes(q)) : dogs
  }, [dogs, query])
  const visibleDogs = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])
  const mapVisibleDogs: DogMapMarker[] = useMemo(() => query.trim() ? visibleDogs : mapDogs, [mapDogs, query, visibleDogs])
  const canRevealCached = visibleCount < filtered.length
  const canLoadMore = !query.trim() && dogs.length < totalActiveDogs
  const canShowMore = canRevealCached || canLoadMore

  async function showMoreReports() {
    const target = visibleCount + PAGE_SIZE
    if (target <= dogs.length || query.trim()) { setVisibleCount(target); return }
    setLoadingMore(true)
    try {
      // Fetch only the next unseen batch. Existing batches remain in local storage.
      const { data } = await supabase
        .from("missing_dogs")
        .select(DOG_COLUMNS)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .range(dogs.length, dogs.length + PAGE_SIZE - 1)
      if (data?.length) setDogs((current) => mergeDogs(current, data as MissingDog[]))
      setVisibleCount(target)
    } finally {
      setLoadingMore(false)
    }
  }

  const focus = (lat: number, lng: number) => { setCenter([lat, lng]); setRecenterTrigger((trigger) => trigger + 1) }
  const selectDog = useCallback((dog: MissingDog) => { setSelectedId(dog.id); focus(dog.latitude, dog.longitude); setDetailDog(dog) }, [])
  const focusDogOnly = useCallback((dog: MissingDog) => { setSelectedId(dog.id); focus(dog.latitude, dog.longitude) }, [])
  async function selectMapDog(marker: DogMapMarker) {
    const dog = await loadDogById(marker.id)
    if (!dog) return
    focusDogOnly(dog)
    setDetailDog(dog)
  }

  function locateMe() {
    if (!navigator.geolocation) { setLocationMessage("Location is not supported by this browser."); return }
    setLocating(true); setLocationMessage("Getting your location…")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: [number, number] = [position.coords.latitude, position.coords.longitude]
        setMapUserPoint(next); setMapUserAccuracy(position.coords.accuracy); focus(next[0], next[1])
        setLocationMessage(`You are here (accuracy about ${Math.round(position.coords.accuracy)} m).`); setLocating(false)
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED ? "Location permission is blocked. Allow it in your browser settings." : error.code === error.POSITION_UNAVAILABLE ? "Your location is unavailable. Turn on GPS or Location Services." : "Location request timed out. Try again near a window."
        setLocationMessage(message); setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    )
  }

  const totalHelpers = Object.values(counts).reduce((a, b) => a + b, 0)
  function requireLogin(action: () => void) { if (!user) setAuthOpen(true); else action() }

  const showMoreButton = canShowMore ? (
    <Button type="button" variant="outline" className="w-full" onClick={() => void showMoreReports()} disabled={loadingMore}>
      {loadingMore ? <><Loader2 className="size-4 animate-spin" />Loading…</> : "Show more"}
    </Button>
  ) : null

  return <div className="flex h-dvh flex-col overflow-hidden">
    <header className="relative z-40 flex items-center justify-between gap-3 border-b bg-card/90 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2.5"><div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><PawPrint className="size-5" /></div><div><h1 className="font-serif text-lg font-extrabold">Pet Alert PH</h1><p className="hidden text-xs text-muted-foreground sm:block">Bringing lost pets home, together</p></div></div>
      <div className="flex items-center gap-2"><span className="hidden text-xs text-muted-foreground lg:block">{totalActiveDogs} reports · {sightings.length} sightings · {totalHelpers} helping</span>
        {adminRole && <Button variant="outline" onClick={() => window.open("/admin/moderation", "_blank", "noopener,noreferrer")}><ShieldCheck className="size-4" /><span className="hidden md:inline">Moderation</span></Button>} {user && <NotificationBell userId={user.id} />} {user ? <Button variant="outline" size="icon" className="rounded-full" onClick={() => setAccountOpen(true)}><User className="size-4" /></Button> : <Button variant="outline" onClick={() => setAuthOpen(true)}>Log in</Button>}
        <Button data-tour="report-sighting" type="button" variant="outline" onClick={() => requireLogin(() => { setSightingDogId(null); setSightingOpen(true) })}><Eye className="size-4" /><span className="hidden sm:inline">Report sighting</span></Button>
        <Button data-tour="report-missing" type="button" onClick={() => requireLogin(() => setReportOpen(true))} className="shrink min-w-0 px-3 sm:px-4"><Plus className="size-4 shrink-0" /><span className="hidden sm:inline truncate">Report missing pet</span><span className="sm:hidden truncate">Report</span></Button>
      </div>
    </header>
    <div className="relative min-h-0 flex-1 overflow-hidden md:flex">
      <aside className="hidden h-full w-96 shrink-0 flex-col border-r bg-background md:flex"><div className="border-b p-4"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, breed, area…" className="h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none" /></div><div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground"><span><span className="inline-block size-2 rounded-full bg-orange-600" /> Missing reports</span><span><span className="inline-block size-2 rounded-full bg-green-600" /> Sightings</span></div></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{visibleDogs.map((dog) => <DogCard key={dog.id} dog={dog} volunteerCount={counts[dog.id] || 0} selected={dog.id === selectedId} onClick={() => selectDog(dog)} />)}{showMoreButton}</div></aside>
      <main className="absolute inset-0 z-0 md:relative md:flex-1"><DogMap dogs={mapVisibleDogs} sightings={sightings} selectedId={selectedId} onSelect={(dog) => void selectMapDog(dog)} onSelectSighting={(sighting) => { focus(sighting.latitude, sighting.longitude); setDetailSighting(sighting) }} center={center} recenterTrigger={recenterTrigger} recenterZoom={mapUserPoint ? 17 : 13} privateUserPoint={mapUserPoint} privateUserAccuracy={mapUserAccuracy} /><Button type="button" variant="outline" size="icon-lg" onClick={locateMe} disabled={locating} title="Show my private location" aria-label="Show my private location" className="absolute right-4 top-4 z-20 rounded-full bg-card shadow-lg md:bottom-6 md:top-auto">{locating ? <Loader2 className="size-5 animate-spin" /> : <LocateFixed className="size-5" />}</Button>{locationMessage && <div className="absolute right-4 top-20 z-20 max-w-[calc(100vw-2rem)] rounded-lg border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur md:bottom-20 md:top-auto md:max-w-xs" role="status">{locationMessage}</div>}</main>
      <MobileReportSheet><div className="flex h-full min-h-0 flex-col"><div className="shrink-0 border-b px-4 pb-3"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, breed, area…" className="h-11 w-full rounded-2xl border bg-card pl-10 pr-3 text-sm outline-none" /></div><div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground"><span><span className="inline-block size-2 rounded-full bg-orange-600" /> Missing reports</span><span><span className="inline-block size-2 rounded-full bg-green-600" /> Sightings</span></div></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 pb-24">{visibleDogs.map((dog) => <DogCard key={dog.id} dog={dog} volunteerCount={counts[dog.id] || 0} selected={dog.id === selectedId} onClick={() => { focusDogOnly(dog); setDetailDog(dog) }} />)}{showMoreButton}{filtered.length === 0 && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No reports match your search.</div>}</div></div></MobileReportSheet>
    </div>
    <OnboardingTour />
    <WhatsNewOverlay />
    <TermsSafetyButton />
    <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} defaultCenter={center} onReported={(dog) => { setDogs((current) => mergeDogs([dog], current)); setMapDogs((current) => [{ id: dog.id, name: dog.name, latitude: dog.latitude, longitude: dog.longitude, status: dog.status, created_at: dog.created_at }, ...current.filter((item) => item.id !== dog.id)]); focus(dog.latitude, dog.longitude) }} />
    <SightingDialog open={sightingOpen} onClose={() => setSightingOpen(false)} defaultCenter={center} dogs={mapDogs} defaultDogId={sightingDogId} onCreated={(sighting, chatId) => { setSightings((current) => [sighting, ...current]); focus(sighting.latitude, sighting.longitude); if (chatId) window.location.href = `/notifications?chat=${chatId}` }} />
    <DogDetailDialog open={!!detailDog} onClose={() => setDetailDog(null)} dog={detailDog} currentUserId={user?.id} onDeleted={(id) => { setDogs((current) => current.filter((dog) => dog.id !== id)); setMapDogs((current) => current.filter((dog) => dog.id !== id)) }} onUpdated={(updated) => { setDogs((current) => current.map((dog) => dog.id === updated.id ? updated : dog)); setMapDogs((current) => current.map((dog) => dog.id === updated.id ? { id: updated.id, name: updated.name, latitude: updated.latitude, longitude: updated.longitude, status: updated.status, created_at: updated.created_at } : dog)); setDetailDog(updated) }} onVolunteer={() => requireLogin(() => { setVolunteerDog(detailDog); setDetailDog(null) })} onFound={() => requireLogin(() => { setFoundDog(detailDog); setDetailDog(null) })} onSighting={() => requireLogin(() => { setSightingDogId(detailDog?.id || null); setSightingOpen(true); setDetailDog(null) })} />
    <SightingDetailDialog open={!!detailSighting} onClose={() => setDetailSighting(null)} sighting={detailSighting} currentUserId={user?.id} onDeleted={(id) => setSightings((current) => current.filter((sighting) => sighting.id !== id))} />
    <FoundDialog open={!!foundDog} onClose={() => setFoundDog(null)} dog={foundDog} onFound={(updated) => { setDogs((current) => current.map((dog) => dog.id === updated.id ? updated : dog)) }} />
    {user && <UsernameSetupDialog open={needsUsername} userId={user.id} onSaved={(value) => { setUsername(value); setNeedsUsername(false) }} />}
    <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />{user && <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} userEmail={user.email || ""} username={username || ""} userId={user.id} onSignOut={() => setUser(null)} />}<VolunteerDialog open={!!volunteerDog} onClose={() => setVolunteerDog(null)} dog={volunteerDog} userId={user?.id || null} userEmail={user?.email} username={username || undefined} onVolunteered={(chatId) => { if (volunteerDog) setCounts((current) => ({ ...current, [volunteerDog.id]: (current[volunteerDog.id] || 0) + 1 })); if (chatId) window.location.href = `/notifications?chat=${chatId}` }} />
  </div>
}
