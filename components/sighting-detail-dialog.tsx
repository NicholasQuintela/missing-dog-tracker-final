"use client"
import { MapPin, Share2, Trash2, Clock, Flag } from "lucide-react"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { Sighting } from "@/lib/types"
import {useState} from "react"
import { FullscreenPhotoViewer } from "@/components/fullscreen-photo-viewer"
import {ReportAbuseDialog} from "@/components/report-abuse-dialog"
import { removeStoredPhoto } from "@/lib/storage-photo"
import { publicPhotoSrc } from "@/lib/public-photo"

type Props = { open:boolean; onClose:()=>void; sighting:Sighting|null; currentUserId?:string|null; onDeleted:(id:string)=>void }
export function SightingDetailDialog({open,onClose,sighting,currentUserId,onDeleted}:Props){ const [abuseOpen,setAbuseOpen]=useState(false); const [photoOpen,setPhotoOpen]=useState(false)
  if(!sighting) return null
  async function share(){ const url=`${window.location.origin}/?sighting=${sighting.id}`; if(navigator.share) await navigator.share({title:sighting.title,text:sighting.description||"Pet Alert PH sighting",url}); else {await navigator.clipboard.writeText(url); alert("Sighting link copied.")} }
  async function remove(){
    if(!confirm("Delete this sighting? Its uploaded photo will also be permanently deleted.")) return
    const supabase=createClient()
    try {
      await removeStoredPhoto(supabase,sighting.photo_path,sighting.photo_url)
      const {error}=await supabase.from("sightings").delete().eq("id",sighting.id)
      if(error) throw error
    } catch(error) {
      alert(error instanceof Error ? error.message : "Unable to delete this sighting.")
      return
    }
    onDeleted(sighting.id);onClose()
  }
  return <Modal open={open} onClose={onClose} title={sighting.title} description="Community sighting · green map pin"><div className="flex flex-col gap-4">
    {sighting.photo_url && <button type="button" className="block w-full cursor-zoom-in overflow-hidden rounded-2xl bg-muted" onClick={()=>setPhotoOpen(true)} aria-label={`View full photo for ${sighting.title}`}><img loading="lazy" decoding="async" src={publicPhotoSrc(sighting.photo_url,sighting.photo_path)} alt={sighting.title} className="h-auto w-full object-contain" /></button>}
    {sighting.description && <p className="text-sm leading-relaxed">{sighting.description}</p>}
    <div className="rounded-xl bg-secondary/60 p-4 text-sm"><p className="flex gap-2"><Clock className="size-4" />{new Date(sighting.seen_at).toLocaleString()}</p><p className="mt-2 flex gap-2"><MapPin className="size-4" />{sighting.latitude.toFixed(4)}, {sighting.longitude.toFixed(4)}</p>{sighting.contact_info && <p className="mt-2">Contact: {sighting.contact_info}</p>}</div>
    <Button onClick={share}><Share2 className="size-4"/>Share sighting link</Button>
    {currentUserId && currentUserId!==sighting.reporter_id && <Button variant="ghost" onClick={()=>setAbuseOpen(true)} className="text-destructive"><Flag className="size-4"/>Report abuse</Button>}
    {currentUserId===sighting.reporter_id && <Button variant="outline" onClick={remove} className="text-destructive"><Trash2 className="size-4"/>Delete sighting</Button>}
    {sighting.photo_url && <FullscreenPhotoViewer open={photoOpen} src={publicPhotoSrc(sighting.photo_url,sighting.photo_path)} alt={sighting.title} onClose={()=>setPhotoOpen(false)}/>}
    <ReportAbuseDialog open={abuseOpen} onClose={()=>setAbuseOpen(false)} targetType="sighting" targetId={sighting.id}/>
  </div></Modal>
}
