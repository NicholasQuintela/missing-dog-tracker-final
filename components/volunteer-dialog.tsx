"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog } from "@/lib/types"

type Props = {
  open: boolean
  onClose: () => void
  dog: MissingDog | null
  userId: string | null
  userEmail?: string
  onVolunteered: (conversationId: string | null) => void
}

export function VolunteerDialog({ open, onClose, dog, userId, userEmail, onVolunteered }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dog) return
    if (!name.trim()) { setError("Please tell the owner your name."); return }

    setSubmitting(true)
    setError(null)
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error("Please log in again before volunteering.")
      if (dog.owner_id === user.id) throw new Error("You cannot volunteer on your own report.")

      const { error: insertErr } = await supabase.from("volunteers").insert({
        dog_id: dog.id,
        user_id: user.id,
        volunteer_name: name.trim(),
        volunteer_contact: user.email || userEmail || null,
        message: message.trim() || null,
      })
      if (insertErr) throw insertErr

      const { data: conversationId } = await supabase.rpc("get_my_case_conversation", { p_dog_id: dog.id })
      setName("")
      setMessage("")
      onVolunteered((conversationId as string | null) || null)
      onClose()
    } catch (err: any) {
      console.error("[PawFinder] volunteer submit error:", err)
      const msg = err?.message || "Something went wrong. Please try again."
      setError(err?.code === "23505" ? "You are already volunteering for this report." : msg)
    } finally {
      setSubmitting(false)
    }
  }

  return <Modal open={open} onClose={onClose} title={dog ? `Help find ${dog.name}` : "Volunteer to help"} description="Your verified account will be linked to this search and a private chat will be created.">
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="Display name" htmlFor="v-name"><input id="v-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Juan" className={inputClass} /></Field>
      <Field label="Account" hint="Only you and the report owner can access the private chat."><input value={userEmail || "Verified PawFinder account"} readOnly className={inputClass + " opacity-70"} /></Field>
      <Field label="Message (optional)" htmlFor="v-message"><textarea id="v-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={500} placeholder="I regularly walk near this area and can help search." rows={3} className={inputClass + " h-auto resize-none py-2"} /></Field>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex gap-3"><Button type="button" variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={submitting}>Cancel</Button><Button type="submit" size="lg" className="flex-1" disabled={submitting || !userId}>{submitting ? <><Loader2 className="size-4 animate-spin" /> Joining…</> : "I'll help search"}</Button></div>
    </form>
  </Modal>
}
