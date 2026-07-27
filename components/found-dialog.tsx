"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { ImagePlus, Loader2, PartyPopper } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog } from "@/lib/types"

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
  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) { const file=e.target.files?.[0]; if(!file)return; setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dog) return
    setError(null)
    if (!name.trim()) { setError("Please tell us who found the dog."); return }
    if (!photoFile) { setError("Please upload a photo of the dog you found as proof."); return }

    setSubmitting(true)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error("Please log in again before reporting a found dog.")
      if (dog.owner_id === user.id) throw new Error("The report owner cannot use the finder action on their own report.")
      if (photoFile.size > 2 * 1024 * 1024) throw new Error("Please choose an image smaller than 2 MB.")

      const ext = photoFile.name.split(".").pop() || "jpg"
      const path = `found/${user.id}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from("dog-photos").upload(path, photoFile, { cacheControl: "3600", upsert: false })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from("dog-photos").getPublicUrl(path)

      const { data, error: updErr } = await supabase.from("missing_dogs").update({
        status: "found",
        found_by: name.trim(),
        found_by_user_id: user.id,
        found_note: note.trim() || null,
        found_photo_url: pub.publicUrl,
        found_photo_path: path,
        found_at: new Date().toISOString(),
      }).eq("id", dog.id).select().single()
      if (updErr) throw updErr

      const { data: conversationId } = await supabase.rpc("get_my_case_conversation", { p_dog_id: dog.id })
      onFound(data as MissingDog, (conversationId as string | null) || null)
      reset()
      onClose()
    } catch (err) {
      console.error("[Pet Alert PH] found submit error:", err)
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally { setSubmitting(false) }
  }

  return <Modal open={open} onClose={onClose} title={dog ? `${dog.name} has been found!` : "Mark as found"} description="This creates a private chat between the finder and the report owner.">
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex items-center gap-4"><label htmlFor="found-photo" className="group relative flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted text-muted-foreground transition-colors hover:border-ring hover:text-foreground">{photoPreview ? <img src={photoPreview} alt="Photo of the found dog" className="h-full w-full object-cover" /> : <ImagePlus className="size-7" />}<input id="found-photo" type="file" accept="image/*" onChange={handlePhoto} className="sr-only" /></label><div className="text-sm text-muted-foreground"><p className="font-semibold text-foreground">Proof photo (required)</p><p>A recent picture helps the owner verify the report.</p></div></div>
      <Field label="Your name" htmlFor="f-name"><input id="f-name" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Jordan" className={inputClass}/></Field>
      <Field label="Where & how you found them (optional)" htmlFor="f-note"><textarea id="f-note" value={note} onChange={e=>setNote(e.target.value)} placeholder="Found near the market; currently safe with me." rows={3} className={inputClass+" h-auto py-2 resize-none"}/></Field>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex gap-3"><Button type="button" variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={submitting}>Cancel</Button><Button type="submit" size="lg" className="flex-1" disabled={submitting}>{submitting?<><Loader2 className="size-4 animate-spin"/> Confirming…</>:<><PartyPopper className="size-4"/> Confirm found</>}</Button></div>
    </form>
  </Modal>
}
