"use client"

import { useEffect, useState } from "react"
import { ImagePlus, Loader2 } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { CaptchaWidget } from "@/components/captcha-widget"
import { LocationPicker, type AddressFields } from "@/components/location-picker"
import type { MissingDog, Sighting } from "@/lib/types"


type Props = { open: boolean; onClose: () => void; defaultCenter: [number, number]; dogs: MissingDog[]; defaultDogId?: string | null; onCreated: (s: Sighting, conversationId: string | null) => void }

export function SightingDialog({ open, onClose, defaultCenter, dogs, defaultDogId, onCreated }: Props) {
  const supabase = createClient()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [dogId, setDogId] = useState(defaultDogId || "")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [contact, setContact] = useState("")
  const [seenAt, setSeenAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [point, setPoint] = useState<[number, number]>(defaultCenter)
  const [address, setAddress] = useState<AddressFields>({ region: "", city: "", barangay: "", street: "" })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [mapInstanceKey, setMapInstanceKey] = useState(0)

  useEffect(() => {
    if (open) {
      setDogId(defaultDogId || "")
      setPoint(defaultCenter)
      setError(null)
      setAddress({ region: "", city: "", barangay: "", street: "" })
      setMapInstanceKey((value) => value + 1)
    }
  }, [open, defaultDogId, defaultCenter])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSubmitting(true)
    try {
      if (!captchaToken) throw new Error("Please complete the CAPTCHA.")
      const captchaResponse = await fetch("/api/verify-captcha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: captchaToken }) })
      if (!captchaResponse.ok) throw new Error("CAPTCHA verification failed. Please try again.")
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Please log in before reporting a sighting.")
      if (!title.trim()) throw new Error("Please add a short sighting title.")
      let photo_url: string | null = null, photo_path: string | null = null
      if (photoFile) {
        if (photoFile.size > 2 * 1024 * 1024) throw new Error("Please choose an image smaller than 2 MB.")
        const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"])
        if (!allowedTypes.has(photoFile.type)) throw new Error("Please upload a JPG, PNG, or WebP image. HEIC/HEIF photos are not supported yet.")
        const ext = photoFile.type === "image/png" ? "png" : photoFile.type === "image/webp" ? "webp" : "jpg"
        photo_path = `sightings/${user.id}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from("dog-photos").upload(photo_path, photoFile, { upsert: false })
        if (error) throw error
        photo_url = supabase.storage.from("dog-photos").getPublicUrl(photo_path).data.publicUrl
      }
      const { data, error } = await supabase.from("sightings").insert({ reporter_id: user.id, dog_id: dogId || null, title: title.trim(), description: description.trim() || null, contact_info: contact.trim() || null, seen_at: new Date(seenAt).toISOString(), latitude: point[0], longitude: point[1], photo_url, photo_path, region: address.region.trim() || null, city: address.city.trim() || null, barangay: address.barangay.trim() || null, street_or_landmark: address.street.trim() || null, location_source: address.region.trim() || address.city.trim() || address.barangay.trim() || address.street.trim() ? "address_or_adjusted_pin" : "manual_pin" }).select().single()
      if (error) throw error
      const { data: conversationId } = dogId ? await supabase.rpc("get_my_case_conversation", { p_dog_id: dogId }) : { data: null }; onCreated(data as Sighting, (conversationId as string | null) || null); onClose(); setTitle(""); setDescription(""); setContact(""); setPhotoFile(null); setPhotoPreview(null)
    } catch (err) { console.error("[Pet Alert PH] sighting submit error:", err); setError(err instanceof Error ? err.message : "Something went wrong.") } finally { setSubmitting(false) }
  }

  return <Modal open={open} onClose={onClose} title="Report a sighting" description="Add a green map pin where you saw a dog that may be missing.">
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Related missing-dog report (optional)"><select className={inputClass} value={dogId} onChange={e => setDogId(e.target.value)}><option value="">Not sure / general sighting</option>{dogs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Sighting title"><input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="Brown dog seen near the market" required /></Field>
      <Field label="Details"><textarea className={inputClass + " h-auto py-2"} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Direction of travel, collar, behavior, landmarks…" /></Field>
      <Field label="Date and time seen"><input className={inputClass} type="datetime-local" value={seenAt} onChange={e => setSeenAt(e.target.value)} required /></Field>
      <LocationPicker point={point} onPointChange={setPoint} address={address} onAddressChange={setAddress} kind="sighting" mapKey={`sighting-picker-${mapInstanceKey}`} title="Choose the sighting location" hint="Search by address, use your private current location, or tap the map to place the green pin." />
      <Field label="Photo (optional)"><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3">{photoPreview ? <img src={photoPreview} alt="Sighting preview" className="size-16 rounded-lg object-cover" /> : <ImagePlus className="size-6" />}<span className="text-sm">Choose an image up to 2 MB</span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
        const f = e.target.files?.[0]
        if (!f) return
        const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"])
        if (!allowedTypes.has(f.type)) {
          setPhotoFile(null)
          setPhotoPreview(null)
          setError("Please choose a JPG, PNG, or WebP image. On iPhone, change Camera > Formats to Most Compatible if your photo is HEIC.")
          e.currentTarget.value = ""
          return
        }
        setError(null)
        setPhotoFile(f)
        setPhotoPreview(URL.createObjectURL(f))
      }} /></label></Field>
      <Field label="Contact info (optional)"><input className={inputClass} value={contact} onChange={e => setContact(e.target.value)} placeholder="Phone, email, or social handle" /></Field>
      <CaptchaWidget onToken={setCaptchaToken} />
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="flex gap-3"><Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button type="submit" className="flex-1" disabled={submitting}>{submitting ? <><Loader2 className="size-4 animate-spin" />Saving…</> : "Post sighting"}</Button></div>
    </form>
  </Modal>
}
