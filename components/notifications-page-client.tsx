"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Bell, CheckCheck, MessageCircle, PawPrint, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatDialog } from "@/components/chat-dialog"
import { FoundClaimReview } from "@/components/found-claim-review"
import { createClient } from "@/lib/supabase/client"
import type { Notification } from "@/lib/types"

const tabs = ["all", "messages", "volunteers", "reports", "updates"] as const

type Tab = typeof tabs[number]

function category(type: string): Tab {
  if (type === "message" || type === "comment") return "messages"
  if (type === "volunteer") return "volunteers"
  if (type === "found" || type === "report") return "reports"
  return "updates"
}

function Icon({ type }: { type: string }) {
  if (type === "message" || type === "comment") return <MessageCircle className="size-5" />
  if (type === "volunteer") return <Users className="size-5" />
  if (type === "found" || type === "report") return <PawPrint className="size-5" />
  return <Bell className="size-5" />
}

export function NotificationsPageClient() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<Notification[]>([])
  const [tab, setTab] = useState<Tab>("all")
  const [chatId, setChatId] = useState<string | null>(null)
  const [claimId, setClaimId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setChatId(params.get("chat"))
    setClaimId(params.get("claim"))
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id || null
      setUserId(id)
      if (!id) { setLoading(false); return }
      supabase.from("notifications").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(200).then(({ data }) => {
        setItems((data as Notification[]) || [])
        setLoading(false)
      })
    })
  }, [supabase])

  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel(`notification-page-${userId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, payload => setItems(prev => [payload.new as Notification, ...prev])).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, userId])

  async function openItem(item: Notification) {
    if (!item.read_at) {
      const now = new Date().toISOString()
      await supabase.from("notifications").update({ read_at: now }).eq("id", item.id)
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, read_at: now } : n))
    }
    if (item.type === "comment" && item.dog_id) {
      window.location.href = `/?report=${item.dog_id}#comments`
      return
    }
    if (item.found_claim_id) {
      setClaimId(item.found_claim_id)
      setChatId(null)
      window.history.replaceState({}, "", `/notifications?claim=${item.found_claim_id}`)
      return
    }
    if (item.conversation_id) {
      setChatId(item.conversation_id)
      window.history.replaceState({}, "", `/notifications?chat=${item.conversation_id}`)
    }
  }

  async function markAll() {
    if (!userId) return
    const now = new Date().toISOString()
    await supabase.from("notifications").update({ read_at: now }).eq("user_id", userId).is("read_at", null)
    setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at || now })))
  }

  const filtered = tab === "all" ? items : items.filter(n => category(n.type) === tab)

  if (!loading && !userId) return <main className="mx-auto max-w-3xl p-6"><p className="rounded-2xl border p-6 text-center">Please log in first to view your notifications.</p><Button className="mt-4" onClick={() => window.location.href = "/"}>Go home</Button></main>

  return <main className="min-h-dvh bg-background">
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => history.back()}><ArrowLeft className="size-5" /></Button><div><h1 className="font-serif text-xl font-extrabold">Activity & notifications</h1><p className="text-xs text-muted-foreground">Updates about your reports and chats</p></div></div>
        <Button variant="outline" onClick={markAll}><CheckCheck className="size-4" /> Mark all read</Button>
      </div>
      <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto px-4 pb-3">{tabs.map(t => <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{t}</button>)}</div>
    </header>

    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      {claimId && userId ? <FoundClaimReview claimId={claimId} userId={userId} onOpenChat={(id)=>{setChatId(id);setClaimId(null);window.history.replaceState({}, "", `/notifications?chat=${id}`)}} onClose={()=>{setClaimId(null);window.history.replaceState({}, "", "/notifications")}} /> : loading ? <p className="py-16 text-center text-muted-foreground">Loading activity…</p> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed p-12 text-center"><Bell className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-semibold">No activity in this tab yet.</p></div> : <div className="space-y-3">{filtered.map(item => <button key={item.id} onClick={() => openItem(item)} className={`flex w-full gap-3 rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${!item.read_at ? "border-primary/40 bg-primary/5" : "bg-card"}`}><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"><Icon type={item.type} /></span><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-3"><span className="font-bold">{item.title}</span>{!item.read_at && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}</span><span className="mt-1 block text-sm text-muted-foreground">{item.message}</span><span className="mt-2 block text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>{item.conversation_id && <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary"><MessageCircle className="size-3" /> Open private chat</span>}</span></button>)}</div>}
    </div>
    {userId && <ChatDialog open={!!chatId} onClose={() => setChatId(null)} conversationId={chatId} userId={userId} />}
  </main>
}
