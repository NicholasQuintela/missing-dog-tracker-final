"use client"

import { useEffect, useState } from "react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

const categories = [
  ["fake_report", "Fake or misleading report"],
  ["spam", "Spam"],
  ["scam", "Scam or suspicious request"],
  ["harassment", "Harassment or threats"],
  ["inappropriate", "Inappropriate content"],
  ["other", "Other"],
] as const

type Props = {
  open: boolean
  onClose: () => void
  targetType: "missing_dog" | "sighting" | "message" | "comment" | "user"
  targetId: string
}

export function ReportAbuseDialog({ open, onClose, targetType, targetId }: Props) {
  const [category, setCategory] = useState("fake_report")
  const [details, setDetails] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSuccess(false)
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!targetId) return
    setBusy(true)
    setError(null)
    setSuccess(false)
    try {
      const supabase = createClient()
      const userResult = await supabase.auth.getUser()
      if (!userResult.data.user) throw new Error("Please log in to report abuse.")
      const result = await supabase.rpc("submit_pet_alert_abuse_report", {
        p_target_type: targetType,
        p_target_id: targetId,
        p_category: category,
        p_details: details.trim() || null,
      })
      if (result.error) throw result.error
      setSuccess(true)
      setDetails("")
      window.setTimeout(() => onClose(), 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to submit the report. Please try again later.")
    } finally {
      setBusy(false)
    }
  }

  return <Modal open={open} onClose={onClose} title="Report abuse" description="Your report goes to Pet Alert PH administrators for review.">
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Reason" htmlFor="abuse-category">
        <select id="abuse-category" value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
          {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      <Field label="Additional details" htmlFor="abuse-details" hint="Do not include passwords or other highly sensitive information.">
        <textarea id="abuse-details" value={details} onChange={e => setDetails(e.target.value)} maxLength={1000} className={inputClass + " h-auto min-h-28 py-2"} placeholder="Explain what happened…" />
      </Field>
      {success && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">Report submitted. Thank you for helping keep Pet Alert PH safe.</p>}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || success}>{busy ? "Sending…" : "Submit abuse report"}</Button>
    </form>
  </Modal>
}
