"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { CaptchaWidget } from "@/components/captcha-widget"

export function DesktopLoginClient() {
  const supabase = createClient()
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [username, setUsername] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [alreadySignedIn, setAlreadySignedIn] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) {
        setAlreadySignedIn(true)
        setMessage("Signed in. Returning you to the Pet Alert PH desktop app…")
      }
    })
    return () => { active = false }
  }, [supabase])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setBusy(true)

    try {
      if (!captchaToken) throw new Error("Please complete the CAPTCHA.")

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          options: { captchaToken },
        })
        if (signInError) throw signInError
        setAlreadySignedIn(true)
        setMessage("Login successful. Returning you to the Pet Alert PH desktop app…")
      } else {
        if (password !== confirmPassword) throw new Error("Passwords do not match.")
        if (username.trim().length < 3) throw new Error("Choose a username with at least 3 characters.")

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            captchaToken,
            data: { username: username.trim().toLowerCase() },
          },
        })
        if (signUpError) throw signUpError
        if (!data.session) {
          setMessage("Account created. Return to Log in and use your new account.")
          setMode("login")
          setCaptchaToken(null)
          return
        }
        setAlreadySignedIn(true)
        setMessage("Account created and signed in. Returning you to the desktop app…")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to authenticate.")
      setCaptchaToken(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary text-2xl text-primary-foreground">🐾</div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pet Alert PH</h1>
          <p className="mt-1 text-sm text-muted-foreground">Secure desktop authentication</p>
        </div>

        {alreadySignedIn ? (
          <div className="rounded-2xl border bg-muted p-5 text-center">
            <p className="font-bold">You’re signed in.</p>
            <p className="mt-2 text-sm text-muted-foreground">This window will close automatically and return you to the desktop app.</p>
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 rounded-xl bg-muted p-1">
              <button type="button" onClick={() => { setMode("login"); setError(null); setMessage(null); setCaptchaToken(null) }} className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === "login" ? "bg-card shadow" : "text-muted-foreground"}`}>Log in</button>
              <button type="button" onClick={() => { setMode("signup"); setError(null); setMessage(null); setCaptchaToken(null) }} className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === "signup" ? "bg-card shadow" : "text-muted-foreground"}`}>Create account</button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm font-bold">Email
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring" placeholder="you@example.com" />
              </label>

              {mode === "signup" && (
                <label className="block text-sm font-bold">Public username
                  <input required minLength={3} maxLength={24} pattern="[A-Za-z0-9._]+" value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring" placeholder="pethelper.ph" />
                </label>
              )}

              <label className="block text-sm font-bold">Password
                <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring" placeholder="At least 6 characters" />
              </label>

              {mode === "signup" && (
                <label className="block text-sm font-bold">Confirm password
                  <input type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring" placeholder="Re-enter password" />
                </label>
              )}

              <div className="min-h-16 overflow-hidden rounded-xl border bg-background p-2">
                <CaptchaWidget onToken={setCaptchaToken} />
              </div>

              {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              {message && <p className="rounded-xl bg-muted px-3 py-2 text-sm">{message}</p>}

              <button type="submit" disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 font-extrabold text-primary-foreground disabled:opacity-50">
                {busy ? "Please wait…" : mode === "login" ? "Log in to desktop app" : "Create account"}
              </button>
            </form>
          </>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground">This lightweight page loads no map, report feed, pet photos, comments, or messages.</p>
      </div>
    </main>
  )
}
