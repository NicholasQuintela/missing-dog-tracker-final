"use client"

import { useState } from "react"
import { ImagePlus, Loader2 } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { CaptchaWidget } from "@/components/captcha-widget"
import { LocationPicker, type AddressFields } from "@/components/location-picker"
import type { MissingDog } from "@/lib/types"
import { REWARD_CURRENCIES } from "@/lib/currency"


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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [point, setPoint] = useState<[number, number]>(defaultCenter)
  const [address, setAddress] = useState<AddressFields>({ region: "", city: "", barangay: "", street: "" })

  const [name, setName] = useState("")
  const [breed, setBreed] = useState("")
  const [lastSeen, setLastSeen] = useState("")
  const [reward, setReward] = useState("")
  const [rewardCurrency, setRewardCurrency] = useState("PHP")
  const [contact, setContact] = useState("")
  const [confirmed, setConfirmed] = useState(false)

  function reset() {
    setName("")
    setBreed("")
    setLastSeen("")
    setReward("")
    setRewardCurrency("PHP")
    setContact("")
    setConfirmed(false)
    setPhotoFile(null)
    setPhotoPreview(null)
    setError(null)
    setPoint(defaultCenter)
    setAddress({ region: "", city: "", barangay: "", street: "" })
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
      if (!captchaToken) throw new Error("Please complete the CAPTCHA.")
      const captchaResponse = await fetch("/api/verify-captcha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: captchaToken }) })
      if (!captchaResponse.ok) throw new Error("CAPTCHA verification failed. Please try again.")
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("Please log in before posting a missing-dog report.")
        return
      }
      if (!confirmed) throw new Error("Please confirm that the report is accurate and lawful.")
      let photo_url: string | null = null
      let photo_path: string | null = null
      if (photoFile) {
        if (photoFile.size > 2 * 1024 * 1024) throw new Error("Please choose an image smaller than 2 MB.")
        const ext = photoFile.name.split(".").pop() || "jpg"
        const path = `reports/${user.id}/${crypto.randomUUID()}.${ext}`
        photo_path = path
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
          photo_path,
          reward: reward ? Number(reward) : 0,
          reward_currency: rewardCurrency,
          contact_info: contact.trim(),
          latitude: point[0],
          longitude: point[1],
          last_seen: lastSeen.trim() || null,
          region: address.region.trim() || null,
          city: address.city.trim() || null,
          barangay: address.barangay.trim() || null,
          street_or_landmark: address.street.trim() || null,
          location_source: address.region.trim() || address.city.trim() || address.barangay.trim() || address.street.trim() ? "address_or_adjusted_pin" : "manual_pin",
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
            <div className="flex gap-2">
              <input id="reward" type="number" min="0" step="0.01" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="e.g. 200" className={inputClass + " min-w-0 flex-1"} />
              <select aria-label="Reward currency" value={rewardCurrency} onChange={e => setRewardCurrency(e.target.value)} className="h-11 w-28 rounded-xl border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                {REWARD_CURRENCIES.map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}
              </select>
            </div>
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

        <LocationPicker
          point={point}
          onPointChange={setPoint}
          address={address}
          onAddressChange={setAddress}
          kind="dog"
          mapKey={`missing-location-${open ? "open" : "closed"}`}
          title="Choose the last known location"
          hint="Search by region, city, barangay, street or landmark; use your private current location; or tap the map."
        />

        <Field label="Contact info" htmlFor="contact" hint="Phone, email, or social handle where volunteers can reach you.">
          <input
            id="contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="e.g. (555) 123-4567"
            className={inputClass}
          />
        </Field>

        <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /><span>I confirm this information is accurate, I have the right to upload the photo, and I will not use Pet Alert PH for harassment, fraud, or emergencies. I agree to the <a href="/terms" target="_blank" className="font-semibold text-primary underline">Terms</a>.</span></label>

        <CaptchaWidget onToken={setCaptchaToken} />

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
