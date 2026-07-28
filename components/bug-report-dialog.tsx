"use client"

import { useCallback, useMemo, useState } from "react"
import { Bug, Loader2 } from "lucide-react"
import { CaptchaWidget } from "@/components/captcha-widget"
import { Field, inputClass, Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

type BugReportDialogProps = {
  open: boolean
  onClose: () => void
}

function detectDevice() {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return "Android"
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone / iPad"
  if (/Windows/i.test(ua)) return "Windows"
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS"
  if (/Linux/i.test(ua)) return "Linux"
  return "Unknown device"
}

function detectBrowser() {
  const ua = navigator.userAgent
  if (/Edg/i.test(ua)) return "Microsoft Edge"
  if (/OPR|Opera/i.test(ua)) return "Opera"
  if (/Chrome/i.test(ua)) return "Google Chrome"
  if (/Safari/i.test(ua)) return "Safari"
  if (/Firefox/i.test(ua)) return "Firefox"
  return "Unknown browser"
}

export function BugReportDialog({ open, onClose }: BugReportDialogProps) {
  const supabase = useMemo(() => createClient(), [])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [steps, setSteps] = useState("")
  const [email, setEmail] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const onCaptchaToken = useCallback((token: string | null) => setCaptchaToken(token), [])

  function resetAndClose() {
    if (busy) return
    setTitle("")
    setDescription("")
    setSteps("")
    setEmail("")
    setCaptchaToken(null)
    setMessage(null)
    onClose()
  }

  async function submit() {
    setMessage(null)
    if (title.trim().length < 4 || description.trim().length < 10) {
      setMessage("Please add a clear title and describe what happened.")
      return
    }
    if (!captchaToken) {
      setMessage("Please complete the CAPTCHA first.")
      return
    }

    setBusy(true)
    try {
      const captchaResponse = await fetch("/api/verify-captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: captchaToken }),
      })
      if (!captchaResponse.ok) throw new Error("CAPTCHA verification failed. Please try again.")

      const userResult = await supabase.auth.getUser()
      const user = userResult.data.user
      const result = await supabase.from("bug_reports").insert({
        user_id: user?.id ?? null,
        email: email.trim() || user?.email || null,
        title: title.trim(),
        description: description.trim(),
        steps_to_reproduce: steps.trim() || null,
        device: detectDevice(),
        browser: detectBrowser(),
        user_agent: navigator.userAgent,
        screen_size: `${window.innerWidth}x${window.innerHeight}`,
        page_url: window.location.href,
        app_version: "v1.3 Stable",
      })
      if (result.error) throw result.error

      setMessage("Thank you! Your bug report has been received and is now visible in the moderator panel.")
      setTitle("")
      setDescription("")
      setSteps("")
      setCaptchaToken(null)
    } catch (error) {
      console.error("[Pet Alert PH] bug report submit error", error)
      setMessage(error instanceof Error ? error.message : "Unable to submit the bug report. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return <Modal open={open} onClose={resetAndClose} title="Report a bug" description="Tell us what went wrong so we can improve Pet Alert PH.">
    <div className="space-y-4">
      <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-bold text-foreground"><Bug className="size-4"/>Helpful details are added automatically</p>
        <p className="mt-1">Your device, browser, screen size, current page, and app version will be included. Your password and private messages are never included.</p>
      </div>
      <Field label="Short title" htmlFor="bug-title">
        <input id="bug-title" className={inputClass} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="Example: Sighting button does not open" />
      </Field>
      <Field label="What happened?" htmlFor="bug-description">
        <textarea id="bug-description" className={`${inputClass} min-h-28 resize-y py-3`} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe what you saw and what you expected to happen." />
      </Field>
      <Field label="Steps to reproduce (optional)" htmlFor="bug-steps" hint="List the buttons or pages you used before the problem appeared.">
        <textarea id="bug-steps" className={`${inputClass} min-h-24 resize-y py-3`} maxLength={1500} value={steps} onChange={event => setSteps(event.target.value)} placeholder={'1. Open a report\n2. Tap ...\n3. The screen ...'} />
      </Field>
      <Field label="Contact email (optional)" htmlFor="bug-email" hint="Used only if the team needs more information about this bug.">
        <input id="bug-email" type="email" className={inputClass} maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
      </Field>
      <CaptchaWidget onToken={onCaptchaToken}/>
      {message && <p className="rounded-xl border bg-muted p-3 text-sm" role="status">{message}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={resetAndClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? <><Loader2 className="size-4 animate-spin"/>Sending…</> : <><Bug className="size-4"/>Submit bug report</>}</Button>
      </div>
    </div>
  </Modal>
}
