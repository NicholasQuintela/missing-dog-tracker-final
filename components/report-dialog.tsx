"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { ImagePlus, Loader2, MapPin } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog } from "@/lib/types"

const DogMap = dynamic(() => import("@/components/dog-map"), { ssr: false })

type Props = {
  open: boolean
  onClose: () => void
  defaultCenter: [number, number]
  onReported: (dog: MissingDog) => void
}

export function ReportDialog({ open, onClose, defaultCenter, onReported }: Props) {
  const supabase = createClient()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [point, setPoint] = useState<[number, number]>(defaultCenter)

  const [name, setName] = useState("")
  const [breed, setBreed] = useState("")
  const [lastSeen, setLastSeen] = useState("")
  const [reward, setReward] = useState("")
  const [contact, setContact] = useState("")

  function reset() {
    setName("")
    setBreed("")
    setLastSeen("")
    setReward("")
    setContact("")
    setPhotoFile(null)
    setPhotoPreview(null)
    setError(null)
    setPoint(defaultCenter)
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim() || !contact.trim()) {
      setError("Please provide the dog's name and a contact method.")
      return
    }

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("Please log in before posting a missing-dog report.")
        return
      }
      let photo_url: string | null = null
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg"
        const path = `${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from("dog-photos")
          .upload(path, photoFile, { cacheControl: "3600", upsert: false })
        if (upErr) throw upErr
        const { data } = supabase.storage.from("dog-photos").getPublicUrl(path)
        photo_url = data.publicUrl
      }

      const { data, error: insertErr } = await supabase
        .from("missing_dogs")
        .insert({
          owner_id: user.id,
          name: name.trim(),
          breed_details: breed.trim() || null,
          photo_url,
          reward: reward ? Number(reward) : 0,
          contact_info: contact.trim(),
          latitude: point[0],
          longitude: point[1],
          last_seen: lastSeen.trim() || null,
        })
        .select()
        .single()

      if (insertErr) throw insertErr

      onReported(data as MissingDog)
      reset()
      onClose()
    } catch (err) {
      console.error("[v0] report submit error:", err)
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report a missing dog"
      description="Share the details so nearby volunteers can help bring them home."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <label
            htmlFor="photo"
            className="group relative flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview || "/placeholder.svg"} alt="Preview of the dog" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="size-7" />
            )}
            <input id="photo" type="file" accept="image/*" onChange={handlePhoto} className="sr-only" />
          </label>
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Add a photo</p>
            <p className="text-pretty">A clear picture dramatically increases the chance of a match.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Dog's name" htmlFor="name">
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Biscuit"
              className={inputClass}
            />
          </Field>
          <Field label="Reward (optional)" htmlFor="reward">
            <input
              id="reward"
              type="number"
              min="0"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="e.g. 200"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Breed & description" htmlFor="breed">
          <textarea
            id="breed"
            value={breed}
            onChange={(e) => setBreed(e.target.value)}
            placeholder="Breed, size, color, collar, temperament…"
            rows={2}
            className={inputClass + " h-auto py-2 resize-none"}
          />
        </Field>

        <Field label="When & where last seen" htmlFor="lastseen">
          <input
            id="lastseen"
            value={lastSeen}
            onChange={(e) => setLastSeen(e.target.value)}
            placeholder="e.g. Saturday evening near Elm Park"
            className={inputClass}
          />
        </Field>

        <Field
          label="Pin the last known location"
          hint="Tap on the map to drop the pin where your dog went missing."
        >
          <div className="h-52 overflow-hidden rounded-xl border border-border">
            <DogMap
              dogs={[]}
              selectedId={null}
              onSelect={() => {}}
              center={point}
              recenterTrigger={0}
              pickMode
              pickedPoint={point}
              onPick={(lat, lng) => setPoint([lat, lng])}
            />
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {point[0].toFixed(4)}, {point[1].toFixed(4)}
          </p>
        </Field>

        <Field label="Contact info" htmlFor="contact" hint="Phone, email, or social handle where volunteers can reach you.">
          <input
            id="contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="e.g. (555) 123-4567"
            className={inputClass}
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
                <Loader2 className="size-4 animate-spin" /> Posting…
              </>
            ) : (
              "Post missing dog"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
