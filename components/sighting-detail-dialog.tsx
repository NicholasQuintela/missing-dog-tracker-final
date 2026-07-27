"use client"
import { MapPin, Share2, Trash2, Clock } from "lucide-react"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { Sighting } from "@/lib/types"

type Props = { open:boolean; onClose:()=>void; sighting:Sighting|null; currentUserId?:string|null; onDeleted:(id:string)=>void }
export function SightingDetailDialog({open,onClose,sighting,currentUserId,onDeleted}:Props){
  if(!sighting) return null
  async function share(){ const url=`${window.location.origin}/?sighting=${sighting.id}`; if(navigator.share) await navigator.share({title:sighting.title,text:sighting.description||"Pet Alert PH sighting",url}); else {await navigator.clipboard.writeText(url); alert("Sighting link copied.")} }
  async function remove(){ if(!confirm("Delete this sighting? This cannot be undone.")) return; const supabase=createClient(); const {error}=await supabase.from("sightings").delete().eq("id",sighting.id); if(error){alert(error.message);return} onDeleted(sighting.id);onClose() }
  return <Modal open={open} onClose={onClose} title={sighting.title} description="Community sighting · green map pin"><div className="flex flex-col gap-4">
    {sighting.photo_url && <img src={sighting.photo_url} alt={sighting.title} className="max-h-64 w-full rounded-2xl object-cover" />}
    {sighting.description && <p className="text-sm leading-relaxed">{sighting.description}</p>}
    <div className="rounded-xl bg-secondary/60 p-4 text-sm"><p className="flex gap-2"><Clock className="size-4" />{new Date(sighting.seen_at).toLocaleString()}</p><p className="mt-2 flex gap-2"><MapPin className="size-4" />{sighting.latitude.toFixed(4)}, {sighting.longitude.toFixed(4)}</p>{sighting.contact_info && <p className="mt-2">Contact: {sighting.contact_info}</p>}</div>
    <Button onClick={share}><Share2 className="size-4"/>Share sighting link</Button>
    {currentUserId===sighting.reporter_id && <Button variant="outline" onClick={remove} className="text-destructive"><Trash2 className="size-4"/>Delete sighting</Button>}
  </div></Modal>
}
