"use client"

import { useState } from "react"
import { Loader2, UserRound } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

const USERNAME_RE = /^[a-zA-Z0-9._]{3,24}$/
const RESERVED = new Set(["admin","administrator","moderator","support","petalert","petalertph","root","staff"])

export function UsernameSetupDialog({ open, userId, initialUsername = "", onSaved }: { open: boolean; userId: string; initialUsername?: string; onSaved: (username: string) => void }) {
  const [username, setUsername] = useState(initialUsername)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    const value = username.trim().toLowerCase()
    if (!USERNAME_RE.test(value)) { setError("Use 3–24 letters, numbers, periods, or underscores only."); return }
    if (value.includes("@") || RESERVED.has(value)) { setError("Please choose a different username."); return }
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from("profiles").upsert({ id: userId, username: value, updated_at: new Date().toISOString() }, { onConflict: "id" })
    setBusy(false)
    if (error) { setError(error.code === "23505" ? "That username is already taken." : error.message); return }
    onSaved(value)
  }
  return <Modal open={open} onClose={() => {}} title="Choose your public username" description="Your username will appear in comments and community activity instead of your email address.">
    <form onSubmit={save} className="space-y-4">
      <div className="rounded-xl bg-primary/10 p-3 text-sm"><UserRound className="mr-2 inline size-4" />Your email remains private. Reports and chats still belong to your secure account ID.</div>
      <Field label="Username" htmlFor="username" hint="3–24 characters. Letters, numbers, periods and underscores only.">
        <input id="username" autoFocus autoCapitalize="none" autoCorrect="off" className={inputClass} value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. pethelper.ph" maxLength={24} />
      </Field>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button className="w-full" size="lg" type="submit" disabled={busy}>{busy ? <><Loader2 className="size-4 animate-spin" />Saving…</> : "Save username"}</Button>
    </form>
  </Modal>
}
