"use client"

import { useEffect, useMemo, useState } from "react"
import { Bell, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { Notification } from "@/lib/types"

export function NotificationBell({ userId }: { userId: string | null }) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!userId) { setItems([]); return }
    let active = true
    async function load() {
      const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30)
      if (active && data) setItems(data as Notification[])
    }
    load()
    const channel = supabase.channel(`notifications-${userId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, payload => setItems(prev => [payload.new as Notification, ...prev].slice(0, 30))).subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [supabase, userId])

  const unread = items.filter(n => !n.read_at).length
  async function markAll() {
    if (!userId || unread === 0) return
    const now = new Date().toISOString()
    const { error } = await supabase.from("notifications").update({ read_at: now }).eq("user_id", userId).is("read_at", null)
    if (!error) setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
  }

  if (!userId) return null
  return <div className="relative">
    <Button variant="outline" size="icon" aria-label="Notifications" onClick={() => setOpen(v => !v)} className="relative rounded-full">
      <Bell className="size-4" />
      {unread > 0 && <span className="absolute -right-1 -top-1 flex min-w-5 h-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread > 9 ? "9+" : unread}</span>}
    </Button>
    {open && <div className="absolute right-0 top-12 z-[1000] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="font-bold">Notifications</p><p className="text-xs text-muted-foreground">Updates about your reports</p></div><button onClick={markAll} className="flex items-center gap-1 text-xs font-semibold text-primary"><CheckCheck className="size-3" /> Mark read</button></div>
      <div className="max-h-80 overflow-y-auto">
        {items.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</p> : items.map(n => <div key={n.id} className={`border-b border-border px-4 py-3 ${!n.read_at ? "bg-primary/5" : ""}`}><p className="text-sm font-semibold">{n.title}</p><p className="mt-1 text-sm text-muted-foreground">{n.message}</p><p className="mt-1 text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p></div>)}
      </div>
    </div>}
  </div>
}
