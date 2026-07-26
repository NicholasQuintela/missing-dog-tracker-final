"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog } from "@/lib/types"

type Props = {
  open: boolean
  onClose: () => void
  dog: MissingDog | null
  onVolunteered: () => void
}

export function VolunteerDialog({ open, onClose, dog, onVolunteered }: Props) {
  const supabase = createClient()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [contact, setContact] = useState("")
  const [message, setMessage] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dog) return
    setError(null)

    if (!name.trim()) {
      setError("Please tell us your name.")
      return
    }

    setSubmitting(true)
    try {
      const { error: insertErr } = await supabase.from("volunteers").insert({
        dog_id: dog.id,
        volunteer_name: name.trim(),
        volunteer_contact: contact.trim() || null,
        message: message.trim() || null,
      })
      if (insertErr) throw insertErr

      setName("")
      setContact("")
      setMessage("")
      onVolunteered()
      onClose()
    } catch (err) {
      console.error("[v0] volunteer submit error:", err)
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={dog ? `Help find ${dog.name}` : "Volunteer to help"}
      description="Join the search party. The owner will see that you're on the lookout."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Your name" htmlFor="v-name">
          <input
            id="v-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jordan"
            className={inputClass}
          />
        </Field>

        <Field label="Your contact (optional)" htmlFor="v-contact" hint="So the owner can coordinate with you.">
          <input
            id="v-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Phone or email"
            className={inputClass}
          />
        </Field>

        <Field label="Message (optional)" htmlFor="v-message">
          <textarea
            id="v-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. I walk this park every morning and will keep an eye out."
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
                <Loader2 className="size-4 animate-spin" /> Joining…
              </>
            ) : (
              "I'll help search"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
