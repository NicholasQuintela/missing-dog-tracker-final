"use client"

import { useEffect, useState } from "react"
import { Gift, MapPin, Phone, Users, Clock, PawPrint, CheckCircle2, Share2, Trash2, Eye } from "lucide-react"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog, Volunteer } from "@/lib/types"

type Props = {
  open: boolean
  onClose: () => void
  dog: MissingDog | null
  onVolunteer: () => void
  onFound: () => void
  onSighting: () => void
  currentUserId?: string | null
  onDeleted: (id: string) => void
}

function foundWhen(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function DogDetailDialog({ open, onClose, dog, onVolunteer, onFound, onSighting, currentUserId, onDeleted }: Props) {
  const supabase = createClient()
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])

  useEffect(() => {
    if (!open || !dog) return
    let active = true

    async function load() {
      const { data } = await supabase
        .from("volunteers")
        .select("*")
        .eq("dog_id", dog!.id)
        .order("created_at", { ascending: false })
      if (active && data) setVolunteers(data as Volunteer[])
    }
    load()

    const channel = supabase
      .channel(`volunteers-${dog.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "volunteers", filter: `dog_id=eq.${dog.id}` },
        (payload) => {
          setVolunteers((prev) => [payload.new as Volunteer, ...prev])
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [open, dog, supabase])

  if (!dog) return null

  const isFound = dog.status === "found"

  async function shareReport() {
    const url = `${window.location.origin}/?report=${dog.id}`
    if (navigator.share) await navigator.share({ title: `${dog.name} — PawFinder`, text: `Help find ${dog.name}`, url })
    else { await navigator.clipboard.writeText(url); alert("Report link copied.") }
  }

  async function deleteReport() {
    if (!confirm(`Delete ${dog.name}'s report? This also removes linked sightings, volunteers, chats, and notifications.`)) return
    const { error } = await supabase.from("missing_dogs").delete().eq("id", dog.id)
    if (error) { alert(error.message); return }
    onDeleted(dog.id); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={dog.name}>
      <div className="flex flex-col gap-5">
        <div className="overflow-hidden rounded-2xl bg-muted">
          {dog.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dog.photo_url || "/placeholder.svg"} alt={`Photo of ${dog.name}`} className="max-h-64 w-full object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <MapPin className="size-8" />
            </div>
          )}
        </div>

        {isFound && (
          <div className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4">
            <div className="flex items-center gap-2 text-accent">
              <CheckCircle2 className="size-5 shrink-0" />
              <p className="font-serif text-base font-extrabold">
                {`${dog.name} was found${dog.found_by ? ` by ${dog.found_by}` : ""}!`}
              </p>
            </div>
            {dog.found_note && <p className="text-sm leading-relaxed text-foreground text-pretty">{dog.found_note}</p>}
            {dog.found_photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dog.found_photo_url || "/placeholder.svg"}
                alt={`${dog.name} after being found`}
                className="max-h-56 w-full rounded-xl object-cover"
              />
            )}
            {dog.found_at && (
              <p className="text-xs text-muted-foreground">Reported safe on {foundWhen(dog.found_at)}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {isFound && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
              <CheckCircle2 className="size-4" />
              Found &amp; safe
            </span>
          )}
          {dog.reward > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              <Gift className="size-4" />${dog.reward} reward
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
            <Users className="size-4" />
            {volunteers.length} volunteering
          </span>
        </div>

        {dog.breed_details && <p className="text-sm leading-relaxed text-foreground text-pretty">{dog.breed_details}</p>}

        <div className="flex flex-col gap-2 rounded-2xl bg-secondary/60 p-4 text-sm">
          {dog.last_seen && (
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="text-foreground">{dog.last_seen}</span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="text-foreground">
              {dog.latitude.toFixed(4)}, {dog.longitude.toFixed(4)}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium text-foreground">{dog.contact_info}</span>
          </div>
        </div>

        <Button size="lg" variant="outline" onClick={shareReport}><Share2 className="size-4" />Share this report</Button>

        {!isFound && (
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={onVolunteer}>
              <Users className="size-4" />
              {`I'll help find ${dog.name}`}
            </Button>
            <Button size="lg" variant="outline" onClick={onSighting}>
              <Eye className="size-4" />
              {`Report a sighting of ${dog.name}`}
            </Button>
            <Button size="lg" variant="outline" onClick={onFound}>
              <PawPrint className="size-4" />
              {`I found ${dog.name}`}
            </Button>
          </div>
        )}

        {currentUserId === dog.owner_id && (
          <Button variant="outline" onClick={deleteReport} className="text-destructive"><Trash2 className="size-4" />Delete report</Button>
        )}

        {volunteers.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-foreground">Search party</h3>
            <ul className="flex flex-col gap-2">
              {volunteers.map((v) => (
                <li key={v.id} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
                  <p className="font-semibold text-foreground">{v.volunteer_name}</p>
                  {v.message && <p className="text-muted-foreground text-pretty">{v.message}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
