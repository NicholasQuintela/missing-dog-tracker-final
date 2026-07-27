"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { LogIn, LogOut, UserRound } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function AuthButton() {
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setEmail(data.user?.email ?? null)
        setLoading(false)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = "/"
  }

  if (loading) return <div className="h-10 w-24 animate-pulse rounded-xl bg-muted" />

  if (!email) {
    return (
      <Button asChild variant="outline" size="lg">
        <Link href="/auth/login"><LogIn className="size-4" /> Log in</Link>
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="icon-lg" aria-label="My account">
        <Link href="/account"><UserRound className="size-5" /></Link>
      </Button>
      <Button variant="outline" size="lg" onClick={signOut} title={`Signed in as ${email}`}>
        <LogOut className="size-4" /> <span className="hidden sm:inline">Log out</span>
      </Button>
    </div>
  )
}
