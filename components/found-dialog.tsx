"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { ImagePlus, Loader2, PartyPopper } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog } from "@/lib/types"
import { MAX_IMAGE_INPUT_BYTES, optimizeImageForUpload } from "@/lib/image-optimization"

type Props = {
  open: boolean
  onClose: () => void
  dog: MissingDog | null
  onFound: (dog: MissingDog, conversationId: string | null) => void
}

export function FoundDialog({ open, onClose, dog, onFound }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  function reset() { setName(""); setNote(""); setPhotoFile(null); setPhotoPreview(null); setError(null) }
  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      e.target.value = ""
      setPhotoFile(null)
      setPhotoPreview(null)
      setError("Photo must be 1 MB or smaller.")
      return
    }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dog) return
    setError(null)
    if (!name.trim()) { setError("Please tell us who found the pet."); return }
    if (!photoFile) { setError("Please upload a photo of the pet you found as proof."); return }

    setSubmitting(true)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error("Please log in again before reporting a found pet.")
      if (dog.owner_id === user.id) throw new Error("The report owner cannot use the finder action on their own report.")
      const optimized = await optimizeImageForUpload(photoFile)
      const path = `found/${user.id}/${crypto.randomUUID()}.webp`
      const { error: upErr } = await supabase.storage.from("dog-photos").upload(path, optimized.file, { cacheControl: "31536000", contentType: "image/webp", upsert: false })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from("dog-photos").getPublicUrl(path)

      const { data, error: claimError } = await supabase.from("found_claims").insert({
        dog_id: dog.id,
        finder_id: user.id,
        finder_name: name.trim(),
        note: note.trim() || null,
        photo_url: pub.publicUrl,
        photo_path: path,
      }).select().single()
      if (claimError) throw claimError

      alert("Your found claim was sent to the owner for confirmation.")
      onFound(dog, null)
      reset()
      onClose()
    } catch (err) {
      console.error("[Pet Alert PH] found submit error:", err)
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally { setSubmitting(false) }
  }

  return <Modal open={open} onClose={onClose} title={dog ? `Possible match for ${dog.name}` : "Report a possible match"} description="The owner will review your proof and confirm whether this is their pet.">
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex items-center gap-4"><label htmlFor="found-photo" className="group relative flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted text-muted-foreground transition-colors hover:border-ring hover:text-foreground">{photoPreview ? <img src={photoPreview} alt="Photo of the found pet" className="h-full w-full object-cover" /> : <ImagePlus className="size-7" />}<input id="found-photo" type="file" accept="image/*" onChange={handlePhoto} className="sr-only" /></label><div className="text-sm text-muted-foreground"><p className="font-semibold text-foreground">Proof photo (required)</p><p>A recent picture helps the owner verify the report.</p></div></div>
      <Field label="Your name" htmlFor="f-name"><input id="f-name" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Jordan" className={inputClass}/></Field>
      <Field label="Where & how you found them (optional)" htmlFor="f-note"><textarea id="f-note" value={note} onChange={e=>setNote(e.target.value)} placeholder="Found near the market; currently safe with me." rows={3} className={inputClass+" h-auto py-2 resize-none"}/></Field>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex gap-3"><Button type="button" variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={submitting}>Cancel</Button><Button type="submit" size="lg" className="flex-1" disabled={submitting}>{submitting?<><Loader2 className="size-4 animate-spin"/> Confirming…</>:<><PartyPopper className="size-4"/> Send claim to owner</>}</Button></div>
    </form>
  </Modal>
}
