"use client"

import { useCallback, useState } from "react"
import { ExternalLink, Loader2, Trash2 } from "lucide-react"
import { CaptchaWidget } from "@/components/captcha-widget"
import { IS_DESKTOP_BUILD } from "@/lib/desktop"
import { Field, inputClass, Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"

type Props = {
  open: boolean
  onClose: () => void
}

const SUPPORT_EMAIL = "quintelanicholas3@gmail.com"
const SUBJECT = "Pet Alert PH - Delete Account Request"

export function AccountDeletionRequestDialog({ open, onClose }: Props) {
  const [email, setEmail] = useState("")
  const [accepted, setAccepted] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const onCaptchaToken = useCallback((token: string | null) => setCaptchaToken(token), [])

  function resetAndClose() {
    if (busy) return
    setEmail("")
    setAccepted(false)
    setCaptchaToken(null)
    setMessage(null)
    onClose()
  }

  async function submit() {
    setMessage(null)
    const accountEmail = email.trim().toLowerCase()
    if (!accountEmail) {
      setMessage("Enter the email address used for your Pet Alert PH account.")
      return
    }
    if (!accepted) {
      setMessage("Please confirm that you understand account deletion is permanent.")
      return
    }
    if (!IS_DESKTOP_BUILD && !captchaToken) {
      setMessage("Please complete the CAPTCHA first.")
      return
    }

    setBusy(true)
    try {
      if (!IS_DESKTOP_BUILD) {
        const captchaResponse = await fetch("/api/verify-captcha", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: captchaToken }),
        })
        if (!captchaResponse.ok) throw new Error("CAPTCHA verification failed. Please try again.")
      }

      const body = [
        "Hello Pet Alert PH Support,",
        "",
        "I forgot my password and request permanent deletion of my old Pet Alert PH account.",
        "",
        `Account email: ${accountEmail}`,
        `Requested at: ${new Date().toLocaleString()}`,
        `Page: ${window.location.href}`,
        "",
        "I understand that deleting this account is permanent and that its reports, chats, comments, sightings, and other activity may not be transferable to a new account.",
        "",
        "Please reply to this same email address after the account has been deleted so I can create a new account.",
      ].join("\n")

      const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`
      window.location.href = mailto
      setMessage("Your email app should now open with the deletion request prepared. Send that email to Pet Alert PH Support.")
      setCaptchaToken(null)
    } catch (error) {
      console.error("[Pet Alert PH] deletion request error", error)
      setMessage(error instanceof Error ? error.message : "Unable to prepare the request. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return <Modal open={open} onClose={resetAndClose} title="Forgot password?" description="Password recovery emails are currently unavailable.">
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-bold">Create a new account after deletion</p>
        <p className="mt-1">Pet Alert PH support cannot view or recover your password. You may request deletion of the old account, then create a new account using the same email address after support confirms deletion.</p>
      </div>

      <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Before continuing</p>
        <p className="mt-1">You must still have access to the email address below because support will reply only to that address. Deletion is permanent, and old reports, chats, comments, sightings, and activity may not transfer to the new account.</p>
      </div>

      <Field label="Old account email" htmlFor="delete-account-email">
        <input id="delete-account-email" type="email" required className={inputClass} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />
      </Field>

      <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
        <input type="checkbox" className="mt-0.5" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
        <span>I understand that deleting my account is permanent and I may need to recreate my reports and other activity using a new account.</span>
      </label>

      {!IS_DESKTOP_BUILD && <CaptchaWidget onToken={onCaptchaToken} />}
      {message && <p className="rounded-xl border bg-muted p-3 text-sm" role="status">{message}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={resetAndClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? <><Loader2 className="size-4 animate-spin" />Preparing…</> : <><Trash2 className="size-4" />Prepare deletion email<ExternalLink className="size-3" /></>}</Button>
      </div>
    </div>
  </Modal>
}
