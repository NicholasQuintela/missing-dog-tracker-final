"use client"

import type React from "react"
import { useState } from "react"
import { ImagePlus, Loader2, PartyPopper } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog } from "@/lib/types"

type Props = {
  open: boolean
  onClose: () => void
  dog: MissingDog | null
  onFound: (dog: MissingDog) => void
}

export function FoundDialog({ open, onClose, dog, onFound }: Props) {
  const supabase = createClient()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  function reset() {
    setName("")
    setNote("")
    setPhotoFile(null)
    setPhotoPreview(null)
    setError(null)
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dog) return
    setError(null)

    if (!name.trim()) {
      setError("Please tell us who found the dog.")
      return
    }
    if (!photoFile) {
      setError("Please upload a photo of the dog you found as proof.")
      return
    }

    setSubmitting(true)
    try {
      const ext = photoFile.name.split(".").pop() || "jpg"
      const path = `found/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from("dog-photos")
        .upload(path, photoFile, { cacheControl: "3600", upsert: false })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from("dog-photos").getPublicUrl(path)

      const { data, error: updErr } = await supabase
        .from("missing_dogs")
        .update({
          status: "found",
          found_by: name.trim(),
          found_note: note.trim() || null,
          found_photo_url: pub.publicUrl,
          found_at: new Date().toISOString(),
        })
        .eq("id", dog.id)
        .select()
        .single()

      if (updErr) throw updErr

      onFound(data as MissingDog)
      reset()
      onClose()
    } catch (err) {
      console.error("[v0] found submit error:", err)
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={dog ? `${dog.name} has been found!` : "Mark as found"}
      description="Confirm the reunion and upload a photo so the owner and search party know they're safe."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <label
            htmlFor="found-photo"
            className="group relative flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview || "/placeholder.svg"} alt="Photo of the found dog" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="size-7" />
            )}
            <input id="found-photo" type="file" accept="image/*" onChange={handlePhoto} className="sr-only" />
          </label>
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Proof photo (required)</p>
            <p className="text-pretty">A recent picture reassures the owner their dog is safe and sound.</p>
          </div>
        </div>

        <Field label="Your name" htmlFor="f-name">
          <input
            id="f-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jordan"
            className={inputClass}
          />
        </Field>

        <Field label="Where & how you found them (optional)" htmlFor="f-note">
          <textarea
            id="f-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Found safe near the river path, currently at my place waiting for the owner."
            rows={3}
            className={inputClass + " h-auto py-2 resize-none"}
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="button" variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Confirming…
              </>
            ) : (
              <>
                <PartyPopper className="size-4" /> Confirm found
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
