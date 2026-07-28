"use client"

import { useEffect, useState } from "react"
import { MapPin, Share2, Trash2, Clock, Flag, ImageOff, Loader2 } from "lucide-react"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { Sighting } from "@/lib/types"
import { ReportAbuseDialog } from "@/components/report-abuse-dialog"

type Props = {
  open: boolean
  onClose: () => void
  sighting: Sighting | null
  currentUserId?: string | null
  onDeleted: (id: string) => void
}

export function SightingDetailDialog({ open, onClose, sighting, currentUserId, onDeleted }: Props) {
  const [abuseOpen, setAbuseOpen] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
    setImageLoading(Boolean(sighting?.photo_url))
  }, [sighting?.id, sighting?.photo_url])

  if (!sighting) return null

  async function share() {
    const url = `${window.location.origin}/?sighting=${sighting.id}`
    if (navigator.share) await navigator.share({ title: sighting.title, text: sighting.description || "Pet Alert PH sighting", url })
    else {
      await navigator.clipboard.writeText(url)
      alert("Sighting link copied.")
    }
  }

  async function remove() {
    if (!confirm("Delete this sighting? This cannot be undone.")) return
    const supabase = createClient()
    const { error } = await supabase.from("sightings").delete().eq("id", sighting.id)
    if (error) {
      alert(error.message)
      return
    }
    onDeleted(sighting.id)
    onClose()
  }

  const place = [sighting.street_or_landmark, sighting.barangay, sighting.city, sighting.region].filter(Boolean).join(", ")

  return (
    <Modal open={open} onClose={onClose} title={sighting.title || "Sighting report"} description="Community sighting · green map pin">
      <div className="flex flex-col gap-4 text-foreground">
        {/* Keep the report text before the image so details always remain visible on phones. */}
        {sighting.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{sighting.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No additional sighting details were provided.</p>
        )}

        {sighting.photo_url && !imageFailed && (
          <div className="relative min-h-40 overflow-hidden rounded-2xl border bg-muted">
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
                <span className="ml-2 text-sm">Loading photo…</span>
              </div>
            )}
            <img
              src={sighting.photo_url}
              alt={sighting.title || "Sighting photo"}
              className="max-h-72 w-full bg-muted object-contain"
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false)
                setImageFailed(true)
              }}
            />
          </div>
        )}

        {sighting.photo_url && imageFailed && (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
            <ImageOff className="size-5 shrink-0" />
            <span>The uploaded photo cannot be displayed. The report details are still available below.</span>
          </div>
        )}

        <div className="rounded-xl bg-secondary/60 p-4 text-sm text-foreground">
          <p className="flex items-start gap-2"><Clock className="mt-0.5 size-4 shrink-0" /><span>{new Date(sighting.seen_at).toLocaleString()}</span></p>
          <p className="mt-2 flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" /><span>{place || `${Number(sighting.latitude).toFixed(4)}, ${Number(sighting.longitude).toFixed(4)}`}</span></p>
          {sighting.contact_info && <p className="mt-2 break-words">Contact: {sighting.contact_info}</p>}
        </div>

        <Button onClick={share}><Share2 className="size-4" />Share sighting link</Button>
        {currentUserId && currentUserId !== sighting.reporter_id && (
          <Button variant="ghost" onClick={() => setAbuseOpen(true)} className="text-destructive"><Flag className="size-4" />Report abuse</Button>
        )}
        {currentUserId === sighting.reporter_id && (
          <Button variant="outline" onClick={remove} className="text-destructive"><Trash2 className="size-4" />Delete sighting</Button>
        )}
        <ReportAbuseDialog open={abuseOpen} onClose={() => setAbuseOpen(false)} targetType="sighting" targetId={sighting.id} />
      </div>
    </Modal>
  )
}
