"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, ImagePlus, Loader2, Trash2 } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { CaptchaWidget } from "@/components/captcha-widget"
import { LocationPicker, type AddressFields } from "@/components/location-picker"
import type { MissingDog, Sighting } from "@/lib/types"

type Props = {
  open: boolean
  onClose: () => void
  defaultCenter: [number, number]
  dogs: MissingDog[]
  defaultDogId?: string | null
  onCreated: (sighting: Sighting, conversationId: string | null) => void
}

const EMPTY_ADDRESS: AddressFields = { region: "", city: "", barangay: "", street: "" }
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const SAFE_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"])

function localDateTimeValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? ""
}

function isSupportedImage(file: File) {
  const extension = fileExtension(file.name)
  return SAFE_IMAGE_TYPES.has(file.type) || SAFE_IMAGE_EXTENSIONS.has(extension)
}

function readableFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SightingDialog({
  open,
  onClose,
  defaultCenter,
  dogs,
  defaultDogId,
  onCreated,
}: Props) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [dogId, setDogId] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [contact, setContact] = useState("")
  const [seenAt, setSeenAt] = useState(localDateTimeValue)
  const [point, setPoint] = useState<[number, number]>(defaultCenter)
  const [address, setAddress] = useState<AddressFields>(EMPTY_ADDRESS)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [mapInstanceKey, setMapInstanceKey] = useState(0)

  useEffect(() => {
    if (!open) return

    setDogId(defaultDogId || "")
    setTitle("")
    setDescription("")
    setContact("")
    setSeenAt(localDateTimeValue())
    setPoint(defaultCenter)
    setAddress(EMPTY_ADDRESS)
    setPhotoFile(null)
    setCaptchaToken(null)
    setError(null)
    setSubmitting(false)
    setMapInstanceKey((value) => value + 1)

    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [open, defaultDogId, defaultCenter])

  function clearPhoto() {
    setPhotoFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handlePhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = event.target.files?.[0]

    if (!file) {
      setPhotoFile(null)
      return
    }

    if (!isSupportedImage(file)) {
      clearPhoto()
      setError("Please choose a JPG, PNG, or WebP photo. HEIC/HEIF is not supported yet.")
      return
    }

    if (file.size > MAX_PHOTO_BYTES) {
      clearPhoto()
      setError("Please choose a photo smaller than 5 MB.")
      return
    }

    // Deliberately do not decode or preview the selected image here.
    // Some Android photo pickers return cloud-backed files that can crash the
    // modal while the browser tries to generate a preview. The file is uploaded
    // safely only after the user submits the completed form.
    setPhotoFile(file)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setError(null)
    setSubmitting(true)

    let uploadedPhotoPath: string | null = null

    try {
      if (!title.trim()) throw new Error("Please add a short sighting title.")
      if (!seenAt) throw new Error("Please select when the dog was seen.")
      if (!captchaToken) throw new Error("Please complete the CAPTCHA.")

      const captchaResponse = await fetch("/api/verify-captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: captchaToken }),
      })
      if (!captchaResponse.ok) throw new Error("CAPTCHA verification failed. Please try again.")

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error("Please log in before reporting a sighting.")

      let photoUrl: string | null = null

      if (photoFile) {
        if (!isSupportedImage(photoFile)) throw new Error("The selected photo format is not supported.")
        if (photoFile.size > MAX_PHOTO_BYTES) throw new Error("Please choose a photo smaller than 5 MB.")

        const extension = fileExtension(photoFile.name) || "jpg"
        uploadedPhotoPath = `sightings/${user.id}/${crypto.randomUUID()}.${extension}`

        const { error: uploadError } = await supabase.storage
          .from("dog-photos")
          .upload(uploadedPhotoPath, photoFile, {
            cacheControl: "3600",
            contentType: photoFile.type || undefined,
            upsert: false,
          })

        if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`)

        photoUrl = supabase.storage.from("dog-photos").getPublicUrl(uploadedPhotoPath).data.publicUrl
      }

      const locationWasEntered = Boolean(
        address.region.trim() || address.city.trim() || address.barangay.trim() || address.street.trim(),
      )

      const { data: createdSighting, error: insertError } = await supabase
        .from("sightings")
        .insert({
          reporter_id: user.id,
          dog_id: dogId || null,
          title: title.trim(),
          description: description.trim() || null,
          contact_info: contact.trim() || null,
          seen_at: new Date(seenAt).toISOString(),
          latitude: point[0],
          longitude: point[1],
          photo_url: photoUrl,
          photo_path: uploadedPhotoPath,
          region: address.region.trim() || null,
          city: address.city.trim() || null,
          barangay: address.barangay.trim() || null,
          street_or_landmark: address.street.trim() || null,
          location_source: locationWasEntered ? "address_or_adjusted_pin" : "manual_pin",
        })
        .select()
        .single()

      if (insertError) {
        if (uploadedPhotoPath) {
          await supabase.storage.from("dog-photos").remove([uploadedPhotoPath])
          uploadedPhotoPath = null
        }
        throw insertError
      }

      let conversationId: string | null = null
      if (dogId) {
        const { data, error: conversationError } = await supabase.rpc("get_my_case_conversation", {
          p_dog_id: dogId,
        })
        if (!conversationError) conversationId = (data as string | null) || null
      }

      onCreated(createdSighting as Sighting, conversationId)
      onClose()
    } catch (caughtError) {
      console.error("[Pet Alert PH] fresh sighting submit error:", caughtError)
      setError(caughtError instanceof Error ? caughtError.message : "Unable to submit the sighting. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title="Report a sighting"
      description="Add a green map pin where you saw a dog that may be missing."
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Related missing-dog report (optional)">
          <select className={inputClass} value={dogId} onChange={(event) => setDogId(event.target.value)}>
            <option value="">Not sure / general sighting</option>
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Sighting title">
          <input
            className={inputClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Brown dog seen near the market"
            maxLength={100}
            required
          />
        </Field>

        <Field label="Details">
          <textarea
            className={`${inputClass} h-auto min-h-24 py-2`}
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Direction of travel, collar, behavior, landmarks…"
            maxLength={1500}
          />
        </Field>

        <Field label="Date and time seen">
          <input
            className={inputClass}
            type="datetime-local"
            value={seenAt}
            onChange={(event) => setSeenAt(event.target.value)}
            required
          />
        </Field>

        <LocationPicker
          point={point}
          onPointChange={setPoint}
          address={address}
          onAddressChange={setAddress}
          kind="sighting"
          mapKey={`sighting-picker-${mapInstanceKey}`}
          title="Choose the sighting location"
          hint="Search by address, use your private current location, or tap the map to place the green pin."
        />

        <Field
          label="Photo (optional)"
          hint="JPG, PNG, or WebP only. The photo is uploaded only after you press Post sighting."
        >
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3">
            {photoFile ? (
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{photoFile.name}</p>
                  <p className="text-xs text-muted-foreground">Ready to upload · {readableFileSize(photoFile.size)}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={clearPhoto} aria-label="Remove selected photo">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-background">
                  <ImagePlus className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Choose a photo</p>
                  <p className="text-xs text-muted-foreground">Maximum file size: 5 MB</p>
                </div>
                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handlePhotoSelected}
                />
              </label>
            )}
          </div>
        </Field>

        <Field label="Contact info (optional)">
          <input
            className={inputClass}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="Phone, email, or social handle"
            maxLength={250}
          />
        </Field>

        <CaptchaWidget onToken={setCaptchaToken} />

        {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Post sighting"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
