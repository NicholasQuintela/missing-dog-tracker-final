"use client"

import { useState } from "react"
import { Loader2, LogIn, UserPlus } from "lucide-react"
import { Modal, Field, inputClass } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { CaptchaWidget } from "@/components/captcha-widget"
import { AccountDeletionRequestDialog } from "@/components/account-deletion-request-dialog"

type Props = { open: boolean; onClose: () => void }

export function AuthDialog({ open, onClose }: Props) {
  const supabase = createClient()
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [forgotOpen, setForgotOpen] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setMessage(null); setSubmitting(true)
    try {
      if (mode === "login") {
        if (!captchaToken) throw new Error("Please complete the CAPTCHA.")
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken } })
        if (error) throw error
        onClose()
      } else {
        if (!accepted) throw new Error("Please accept the Terms and Privacy Notice.")
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { captchaToken: captchaToken || undefined },
        })
        if (error) throw error
        if (data.session) onClose()
        else setMessage("Account created. Email confirmation is still enabled in Supabase. Turn off Confirm Email in Authentication → Providers → Email so new users can log in immediately without confirmation emails.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally { setSubmitting(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === "login" ? "Welcome back" : "Create your Pet Alert PH account"} description={mode === "login" ? "Log in to receive updates about dogs you report." : "Your account lets Pet Alert PH notify you about your lost dog."}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="auth-email"><input id="auth-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" /></Field>
        <Field label="Password" htmlFor="auth-password"><input id="auth-password" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="At least 6 characters" /></Field>
        <CaptchaWidget onToken={setCaptchaToken} />
        {mode === "signup" && <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={accepted} onChange={e=>setAccepted(e.target.checked)} /><span>I agree to the <a href="/terms" target="_blank" className="font-semibold text-primary underline">Terms of Use</a> and acknowledge the <a href="/privacy" target="_blank" className="font-semibold text-primary underline">Privacy Notice</a>.</span></label>}
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {message && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-foreground">{message}</p>}
        <Button type="submit" size="lg" disabled={submitting}>{submitting ? <><Loader2 className="size-4 animate-spin" /> Please wait…</> : mode === "login" ? <><LogIn className="size-4" /> Log in</> : <><UserPlus className="size-4" /> Create account</>}</Button>
        {mode === "login" && <button type="button" className="text-sm font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setForgotOpen(true)}>
          Forgot password?
        </button>}
        <button type="button" className="text-sm font-semibold text-primary underline-offset-4 hover:underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setMessage(null) }}>
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>
      </form>
      <AccountDeletionRequestDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </Modal>
  )
}
