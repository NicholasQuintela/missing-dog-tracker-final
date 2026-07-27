"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { PawPrint, Plus, Search, LocateFixed, User, Eye } from "lucide-react"
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
import { createClient } from "@/lib/supabase/client"
import type { MissingDog, Volunteer, Sighting } from "@/lib/types"

const DogMap = dynamic(() => import("@/components/dog-map"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> })
const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842]
type Props = { initialDogs: MissingDog[]; initialCounts: Record<string, number>; initialSightings: Sighting[] }

export function FinderApp({ initialDogs, initialCounts, initialSightings }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [dogs, setDogs] = useState(initialDogs)
  const [sightings, setSightings] = useState(initialSightings)
  const [counts, setCounts] = useState(initialCounts)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number]>(initialDogs.length ? [initialDogs[0].latitude, initialDogs[0].longitude] : DEFAULT_CENTER)
  const [recenterTrigger, setRecenterTrigger] = useState(0)
  const [user, setUser] = useState<{ id:string; email?:string } | null>(null)
  const [authOpen,setAuthOpen]=useState(false), [accountOpen,setAccountOpen]=useState(false), [reportOpen,setReportOpen]=useState(false), [sightingOpen,setSightingOpen]=useState(false)
  const [detailDog,setDetailDog]=useState<MissingDog|null>(null), [detailSighting,setDetailSighting]=useState<Sighting|null>(null), [volunteerDog,setVolunteerDog]=useState<MissingDog|null>(null), [foundDog,setFoundDog]=useState<MissingDog|null>(null)
  const [sightingDogId,setSightingDogId]=useState<string|null>(null)

  useEffect(()=>{ supabase.auth.getUser().then(({data})=>setUser(data.user?{id:data.user.id,email:data.user.email}:null)); const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setUser(s?.user?{id:s.user.id,email:s.user.email}:null)); return()=>l.subscription.unsubscribe() },[supabase])
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search); const rid=params.get("report"), sid=params.get("sighting")
    if(rid){const d=initialDogs.find(x=>x.id===rid); if(d)setDetailDog(d)}
    if(sid){const s=initialSightings.find(x=>x.id===sid); if(s)setDetailSighting(s)}
  },[initialDogs,initialSightings])
  useEffect(()=>{const ch=supabase.channel("finder-realtime")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"missing_dogs"},p=>setDogs(v=>[p.new as MissingDog,...v.filter(d=>d.id!==(p.new as MissingDog).id)]))
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"missing_dogs"},p=>setDogs(v=>v.map(d=>d.id===(p.new as MissingDog).id?p.new as MissingDog:d)))
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"missing_dogs"},p=>setDogs(v=>v.filter(d=>d.id!==(p.old as MissingDog).id)))
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"sightings"},p=>setSightings(v=>[p.new as Sighting,...v.filter(s=>s.id!==(p.new as Sighting).id)]))
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"sightings"},p=>setSightings(v=>v.filter(s=>s.id!==(p.old as Sighting).id)))
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"volunteers"},p=>{const x=p.new as Volunteer;setCounts(v=>({...v,[x.dog_id]:(v[x.dog_id]||0)+1}))}).subscribe(); return()=>{supabase.removeChannel(ch)}},[supabase])

  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return q?dogs.filter(d=>d.name.toLowerCase().includes(q)||(d.breed_details||"").toLowerCase().includes(q)||(d.last_seen||"").toLowerCase().includes(q)):dogs},[dogs,query])
  const focus=(lat:number,lng:number)=>{setCenter([lat,lng]);setRecenterTrigger(t=>t+1)}
  const selectDog=useCallback((dog:MissingDog)=>{setSelectedId(dog.id);focus(dog.latitude,dog.longitude);setDetailDog(dog)},[])
  function locateMe(){navigator.geolocation?.getCurrentPosition(p=>focus(p.coords.latitude,p.coords.longitude))}
  const totalHelpers=Object.values(counts).reduce((a,b)=>a+b,0)
  function requireLogin(action:()=>void){if(!user)setAuthOpen(true);else action()}

  return <div className="flex h-dvh flex-col overflow-hidden">
    <header className="relative z-40 flex items-center justify-between gap-3 border-b bg-card/90 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2.5"><div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><PawPrint className="size-5"/></div><div><h1 className="font-serif text-lg font-extrabold">Pet Alert PH</h1><p className="hidden text-xs text-muted-foreground sm:block">Bringing lost dogs home, together</p></div></div>
      <div className="flex items-center gap-2"><span className="hidden text-xs text-muted-foreground lg:block">{dogs.length} reports · {sightings.length} sightings · {totalHelpers} helping</span>
        {user&&<NotificationBell userId={user.id}/>} {user?<Button variant="outline" size="icon" className="rounded-full" onClick={()=>setAccountOpen(true)}><User className="size-4"/></Button>:<Button variant="outline" onClick={()=>setAuthOpen(true)}>Log in</Button>}
        <Button type="button" variant="outline" onClick={() => requireLogin(() => { setSightingDogId(null); setSightingOpen(true) })}><Eye className="size-4"/><span className="hidden sm:inline">Report sighting</span></Button>
        <Button type="button" onClick={()=>requireLogin(()=>setReportOpen(true))}><Plus className="size-4"/><span className="hidden sm:inline">Report missing dog</span><span className="sm:hidden">Report</span></Button>
      </div>
    </header>
    <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row"><aside className="flex w-full shrink-0 flex-col border-t bg-background md:h-full md:w-96 md:border-r md:border-t-0"><div className="border-b p-4"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, breed, area…" className="h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none"/></div><div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground"><span><span className="inline-block size-2 rounded-full bg-orange-600"/> Missing reports</span><span><span className="inline-block size-2 rounded-full bg-green-600"/> Sightings</span></div></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{filtered.map(d=><DogCard key={d.id} dog={d} volunteerCount={counts[d.id]||0} selected={d.id===selectedId} onClick={()=>selectDog(d)}/>)}</div></aside>
      <main className="relative z-0 min-h-0 flex-1"><DogMap dogs={filtered} sightings={sightings} selectedId={selectedId} onSelect={d=>{setSelectedId(d.id);focus(d.latitude,d.longitude)}} onSelectSighting={s=>{focus(s.latitude,s.longitude);setDetailSighting(s)}} center={center} recenterTrigger={recenterTrigger}/><Button variant="outline" size="icon-lg" onClick={locateMe} className="absolute bottom-6 right-4 z-20 rounded-full bg-card shadow-lg"><LocateFixed className="size-5"/></Button></main>
    </div>
    <ReportDialog open={reportOpen} onClose={()=>setReportOpen(false)} defaultCenter={center} onReported={d=>{setDogs(v=>[d,...v]);focus(d.latitude,d.longitude)}}/>
    <SightingDialog open={sightingOpen} onClose={()=>setSightingOpen(false)} defaultCenter={center} dogs={dogs} defaultDogId={sightingDogId} onCreated={(s,chatId)=>{setSightings(v=>[s,...v]);focus(s.latitude,s.longitude);if(chatId) window.location.href=`/notifications?chat=${chatId}`}}/>
    <DogDetailDialog open={!!detailDog} onClose={()=>setDetailDog(null)} dog={detailDog} currentUserId={user?.id} onDeleted={id=>setDogs(v=>v.filter(d=>d.id!==id))} onUpdated={u=>{setDogs(v=>v.map(d=>d.id===u.id?u:d));setDetailDog(u)}} onVolunteer={()=>requireLogin(()=>{setVolunteerDog(detailDog);setDetailDog(null)})} onFound={()=>requireLogin(()=>{setFoundDog(detailDog);setDetailDog(null)})} onSighting={()=>requireLogin(()=>{setSightingDogId(detailDog?.id||null);setSightingOpen(true);setDetailDog(null)})}/>
    <SightingDetailDialog open={!!detailSighting} onClose={()=>setDetailSighting(null)} sighting={detailSighting} currentUserId={user?.id} onDeleted={id=>setSightings(v=>v.filter(s=>s.id!==id))}/>
    <FoundDialog open={!!foundDog} onClose={()=>setFoundDog(null)} dog={foundDog} onFound={(u,chatId)=>{setDogs(v=>v.map(d=>d.id===u.id?u:d));if(chatId) window.location.href=`/notifications?chat=${chatId}`}}/>
    <AuthDialog open={authOpen} onClose={()=>setAuthOpen(false)}/>{user&&<AccountDialog open={accountOpen} onClose={()=>setAccountOpen(false)} userEmail={user.email||""} userId={user.id} onSignOut={()=>setUser(null)}/>}<VolunteerDialog open={!!volunteerDog} onClose={()=>setVolunteerDog(null)} dog={volunteerDog} userId={user?.id||null} userEmail={user?.email} onVolunteered={(chatId)=>{ if(volunteerDog) setCounts(v=>({...v,[volunteerDog.id]:(v[volunteerDog.id]||0)+1})); if(chatId) window.location.href=`/notifications?chat=${chatId}` }}/>
  </div>
}
