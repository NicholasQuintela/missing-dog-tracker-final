"use client"

import { useState } from "react"
import Link from "next/link"
import { PawPrint, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = "/"
  }

  return <main className="flex min-h-dvh items-center justify-center bg-background p-6"><div className="w-full max-w-md rounded-3xl border border-border bg-card p-7 shadow-xl"><div className="mb-7 text-center"><div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><PawPrint /></div><h1 className="font-serif text-2xl font-extrabold">Welcome back</h1><p className="mt-1 text-sm text-muted-foreground">Log in to receive updates about your lost dogs.</p></div><form onSubmit={submit} className="space-y-4"><label className="block text-sm font-semibold">Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none focus:ring-3 focus:ring-ring/30" /></label><label className="block text-sm font-semibold">Password<input required type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none focus:ring-3 focus:ring-ring/30" /></label>{error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<Button className="w-full" size="lg" disabled={loading}>{loading ? <><Loader2 className="animate-spin"/> Logging in…</> : "Log in"}</Button></form><p className="mt-5 text-center text-sm text-muted-foreground">Don't have an account? <Link className="font-bold text-primary hover:underline" href="/auth/signup">Sign up</Link></p><p className="mt-3 text-center"><Link className="text-sm text-muted-foreground hover:underline" href="/">← Back to map</Link></p></div></main>
}
