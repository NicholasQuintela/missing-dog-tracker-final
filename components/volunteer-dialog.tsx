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
  username?: string
  onVolunteered: (conversationId: string | null) => void
}

export function VolunteerDialog({ open, onClose, dog, userId, userEmail, username, onVolunteered }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(username || "")
  const [message, setMessage] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dog) return
    const publicName = username || name.trim()
    if (!publicName) { setError("Please choose a username first."); return }

    setSubmitting(true)
    setError(null)
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error("Please log in again before volunteering.")
      if (dog.owner_id === user.id) throw new Error("You cannot volunteer on your own report.")

      const { error: insertErr } = await supabase.from("volunteers").insert({
        dog_id: dog.id,
        user_id: user.id,
        volunteer_name: publicName,
        volunteer_contact: null,
        message: message.trim() || null,
      })
      if (insertErr) throw insertErr

      const { data: conversationId } = await supabase.rpc("get_my_case_conversation", { p_dog_id: dog.id })
      setName("")
      setMessage("")
      onVolunteered((conversationId as string | null) || null)
      onClose()
    } catch (err: any) {
      console.error("[Pet Alert PH] volunteer submit error:", err)
      const msg = err?.message || "Something went wrong. Please try again."
      setError(err?.code === "23505" ? "You are already volunteering for this report." : msg)
    } finally {
      setSubmitting(false)
    }
  }

  return <Modal open={open} onClose={onClose} title={dog ? `Help find ${dog.name}` : "Volunteer to help"} description="Your verified account will be linked to this search and a private chat will be created.">
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="Public username" htmlFor="v-name"><input id="v-name" value={username || name} onChange={e => setName(e.target.value)} readOnly={Boolean(username)} placeholder="Choose a username in your account" className={inputClass + " opacity-80"} /></Field>
      <p className="text-xs text-muted-foreground">Your email is not shared with other users. Only your username identifies you publicly.</p>
      <Field label="Message (optional)" htmlFor="v-message"><textarea id="v-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={500} placeholder="I regularly walk near this area and can help search." rows={3} className={inputClass + " h-auto resize-none py-2"} /></Field>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex gap-3"><Button type="button" variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={submitting}>Cancel</Button><Button type="submit" size="lg" className="flex-1" disabled={submitting || !userId}>{submitting ? <><Loader2 className="size-4 animate-spin" /> Joining…</> : "I'll help search"}</Button></div>
    </form>
  </Modal>
}
