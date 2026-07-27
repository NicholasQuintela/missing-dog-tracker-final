"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Bell, Check, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import type { Notification } from "@/lib/types"

export function NotificationBell() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      setUserId(data.user?.id ?? null)
      setLoading(false)
    })
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
      if (!session) setItems([])
    })
    return () => { mounted = false; auth.subscription.unsubscribe() }
  }, [supabase])

  useEffect(() => {
    if (!userId) return
    let active = true
    supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (active) setItems((data as Notification[]) || []) })

    const channel = supabase.channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, payload => {
        setItems(prev => [payload.new as Notification, ...prev].slice(0, 20))
      })
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [supabase, userId])

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id)
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
  }

  if (loading || !userId) return null
  const unread = items.filter(n => !n.read_at).length

  return (
    <div className="relative">
      <Button variant="ghost" size="icon-lg" aria-label="Notifications" onClick={() => setOpen(v => !v)} className="relative">
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread > 9 ? "9+" : unread}</span>}
      </Button>
      {open && (
        <div className="absolute right-0 top-12 z-[1000] w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div><p className="font-bold">Notifications</p><p className="text-xs text-muted-foreground">Updates about your lost dogs</p></div>
            {unread > 0 && <span className="text-xs font-semibold text-primary">{unread} unread</span>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</p> : items.map(n => (
              <button key={n.id} onClick={() => markRead(n.id)} className={`w-full border-b border-border p-4 text-left transition-colors hover:bg-muted/60 ${!n.read_at ? "bg-primary/5" : ""}`}>
                <div className="flex gap-3"><div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary"><Bell className="size-4" /></div><div className="min-w-0 flex-1"><p className="font-semibold text-sm">{n.title}</p><p className="mt-1 text-sm text-muted-foreground">{n.message}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p></div>{!n.read_at && <Check className="size-4 text-primary" />}</div>
              </button>
            ))}
          </div>
          <div className="border-t border-border p-3"><Button asChild variant="outline" className="w-full" onClick={() => setOpen(false)}><Link href="/account">View my reports</Link></Button></div>
        </div>
      )}
    </div>
  )
}
