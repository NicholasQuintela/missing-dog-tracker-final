"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { ImagePlus, Loader2, MapPin } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog, Sighting } from "@/lib/types"

const DogMap = dynamic(() => import("@/components/dog-map"), { ssr: false })

type Props = { open: boolean; onClose: () => void; defaultCenter: [number, number]; dogs: MissingDog[]; defaultDogId?: string | null; onCreated: (s: Sighting, conversationId: string | null) => void }

export function SightingDialog({ open, onClose, defaultCenter, dogs, defaultDogId, onCreated }: Props) {
  const supabase = createClient()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dogId, setDogId] = useState(defaultDogId || "")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [contact, setContact] = useState("")
  const [seenAt, setSeenAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [point, setPoint] = useState<[number, number]>(defaultCenter)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [mapInstanceKey, setMapInstanceKey] = useState(0)

  useEffect(() => {
    if (open) {
      setDogId(defaultDogId || "")
      setPoint(defaultCenter)
      setError(null)
      setMapInstanceKey((value) => value + 1)
    }
  }, [open, defaultDogId, defaultCenter])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Please log in before reporting a sighting.")
      if (!title.trim()) throw new Error("Please add a short sighting title.")
      let photo_url: string | null = null, photo_path: string | null = null
      if (photoFile) {
        if (photoFile.size > 2 * 1024 * 1024) throw new Error("Please choose an image smaller than 2 MB.")
        const ext = photoFile.name.split(".").pop() || "jpg"
        photo_path = `sightings/${user.id}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from("dog-photos").upload(photo_path, photoFile, { upsert: false })
        if (error) throw error
        photo_url = supabase.storage.from("dog-photos").getPublicUrl(photo_path).data.publicUrl
      }
      const { data, error } = await supabase.from("sightings").insert({ reporter_id: user.id, dog_id: dogId || null, title: title.trim(), description: description.trim() || null, contact_info: contact.trim() || null, seen_at: new Date(seenAt).toISOString(), latitude: point[0], longitude: point[1], photo_url, photo_path }).select().single()
      if (error) throw error
      const { data: conversationId } = dogId ? await supabase.rpc("get_my_case_conversation", { p_dog_id: dogId }) : { data: null }; onCreated(data as Sighting, (conversationId as string | null) || null); onClose(); setTitle(""); setDescription(""); setContact(""); setPhotoFile(null); setPhotoPreview(null)
    } catch (err) { console.error("[PawFinder] sighting submit error:", err); setError(err instanceof Error ? err.message : "Something went wrong.") } finally { setSubmitting(false) }
  }

  return <Modal open={open} onClose={onClose} title="Report a sighting" description="Add a green map pin where you saw a dog that may be missing.">
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Related missing-dog report (optional)"><select className={inputClass} value={dogId} onChange={e => setDogId(e.target.value)}><option value="">Not sure / general sighting</option>{dogs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Sighting title"><input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="Brown dog seen near the market" required /></Field>
      <Field label="Details"><textarea className={inputClass + " h-auto py-2"} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Direction of travel, collar, behavior, landmarks…" /></Field>
      <Field label="Date and time seen"><input className={inputClass} type="datetime-local" value={seenAt} onChange={e => setSeenAt(e.target.value)} required /></Field>
      <Field label="Pin the sighting location" hint="Tap the map to place the green pin."><div className="h-52 overflow-hidden rounded-xl border"><DogMap key={`sighting-picker-${mapInstanceKey}`} dogs={[]} sightings={[]} selectedId={null} onSelect={() => {}} center={point} recenterTrigger={0} pickMode pickKind="sighting" pickedPoint={point} onPick={(lat,lng) => setPoint([lat,lng])} /></div><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />{point[0].toFixed(4)}, {point[1].toFixed(4)}</p></Field>
      <Field label="Photo (optional)"><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3">{photoPreview ? <img src={photoPreview} alt="Sighting preview" className="size-16 rounded-lg object-cover" /> : <ImagePlus className="size-6" />}<span className="text-sm">Choose an image up to 2 MB</span><input className="sr-only" type="file" accept="image/*" onChange={e => { const f=e.target.files?.[0]; if(f){setPhotoFile(f);setPhotoPreview(URL.createObjectURL(f))} }} /></label></Field>
      <Field label="Contact info (optional)"><input className={inputClass} value={contact} onChange={e => setContact(e.target.value)} placeholder="Phone, email, or social handle" /></Field>
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="flex gap-3"><Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button type="submit" className="flex-1" disabled={submitting}>{submitting ? <><Loader2 className="size-4 animate-spin" />Saving…</> : "Post sighting"}</Button></div>
    </form>
  </Modal>
}
