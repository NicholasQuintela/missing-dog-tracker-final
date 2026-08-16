"use client"

import { useMemo, useState } from "react"
import { BarChart3, Bug, CheckCircle2, ExternalLink, EyeOff, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

type AbuseItem = {
  id: string
  reporter_id: string
  target_type: "missing_dog" | "sighting" | "message" | "user" | "comment"
  target_id: string
  reason: string
  details: string | null
  status: string
  moderation_notes?: string | null
  created_at: string
}

type BugItem = {
  id: string
  user_id: string | null
  email: string | null
  title: string
  description: string
  steps_to_reproduce: string | null
  device: string | null
  browser: string | null
  screen_size: string | null
  page_url: string | null
  app_version: string | null
  status: "new" | "investigating" | "fixed" | "closed"
  moderator_notes: string | null
  created_at: string
}

type Stats = { users:number; reports:number; activeReports:number; solvedReports:number; sightings:number; volunteers:number; pendingAbuse:number; openBugs:number }
type AnalyticsRow = { visit_date: string; unique_visitors: number }

export function ModerationCenter({ initialItems, initialBugs, stats, role }: { initialItems: AbuseItem[]; initialBugs: BugItem[]; stats: Stats; role: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState(initialItems)
  const [bugs, setBugs] = useState(initialBugs)
  const [section, setSection] = useState<"abuse" | "bugs" | "analytics">("abuse")
  const [filter, setFilter] = useState("pending")
  const [bugFilter, setBugFilter] = useState("open")
  const [busyId, setBusyId] = useState<string | null>(null)
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), [])
  const [analyticsFrom, setAnalyticsFrom] = useState(today)
  const [analyticsTo, setAnalyticsTo] = useState(today)
  const [analyticsRows, setAnalyticsRows] = useState<AnalyticsRow[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false)

  async function loadAnalytics() {
    if (!analyticsFrom || !analyticsTo || analyticsFrom > analyticsTo) {
      alert("Choose a valid date range.")
      return
    }
    setAnalyticsLoading(true)
    const result = await supabase.rpc("get_pet_alert_visitor_analytics", { p_from: analyticsFrom, p_to: analyticsTo })
    if (result.error) alert(result.error.message)
    else setAnalyticsRows(((result.data || []) as { visit_date: string; unique_visitors: number | string }[]).map(row => ({ visit_date: row.visit_date, unique_visitors: Number(row.unique_visitors || 0) })))
    setAnalyticsLoaded(true)
    setAnalyticsLoading(false)
  }

  async function moderate(item: AbuseItem, action: "remove" | "ignore") {
    const notes = window.prompt(action === "remove" ? "Optional moderation note for removal:" : "Optional reason for ignoring this report:", "")
    if (notes === null) return
    if (!window.confirm(action === "remove" ? "Hide the reported content from the public and resolve this abuse report?" : "Ignore this abuse report and keep the content online?")) return
    setBusyId(item.id)
    const result = await supabase.rpc("moderate_pet_alert_abuse_report", { p_report_id: item.id, p_action: action, p_notes: notes.trim() || null })
    if (result.error) alert(result.error.message)
    else setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: action === "remove" ? "resolved" : "dismissed", moderation_notes: notes.trim() || null } : x))
    setBusyId(null)
  }

  async function updateBug(item: BugItem, status: BugItem["status"]) {
    const notes = window.prompt("Optional moderator note:", item.moderator_notes || "")
    if (notes === null) return
    setBusyId(item.id)
    const result = await supabase.from("bug_reports").update({
      status,
      moderator_notes: notes.trim() || null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", item.id)
    if (result.error) alert(result.error.message)
    else setBugs(prev => prev.map(x => x.id === item.id ? { ...x, status, moderator_notes: notes.trim() || null } : x))
    setBusyId(null)
  }

  const shown = filter === "all" ? items : items.filter(x => x.status === filter)
  const shownBugs = bugFilter === "all" ? bugs : bugFilter === "open" ? bugs.filter(x => x.status === "new" || x.status === "investigating") : bugs.filter(x => x.status === bugFilter)
  const targetUrl = (item: AbuseItem) => item.target_type === "missing_dog" ? `/?report=${item.target_id}` : item.target_type === "sighting" ? `/?sighting=${item.target_id}` : null

  return <div className="space-y-6">
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Registered users", stats.users], ["All reports", stats.reports], ["Active missing", stats.activeReports], ["Solved reports", stats.solvedReports],
        ["Sightings", stats.sightings], ["Volunteers", stats.volunteers], ["Pending abuse", stats.pendingAbuse], ["Open bugs", stats.openBugs],
      ].map(([label, value]) => <article key={String(label)} className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-extrabold">{value}</p></article>)}
    </section>

    <section className="rounded-2xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => setSection("abuse")} className={`rounded-xl px-4 py-2 text-sm font-bold ${section === "abuse" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Reported content</button>
          <button onClick={() => setSection("bugs")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${section === "bugs" ? "bg-primary text-primary-foreground" : "bg-muted"}`}><Bug className="size-4"/>Bug Reports</button>
          <button onClick={() => setSection("analytics")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${section === "analytics" ? "bg-primary text-primary-foreground" : "bg-muted"}`}><BarChart3 className="size-4"/>Analytics</button>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-bold capitalize">Role: {role}</span>
      </div>
    </section>

    {section === "abuse" ? <section className="rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Reported content</h2><p className="text-sm text-muted-foreground">Review abuse reports, remove content, or dismiss false reports.</p></div><div className="flex flex-wrap gap-2">{["pending","reviewing","resolved","dismissed","all"].map(x => <button key={x} onClick={()=>setFilter(x)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${filter===x?"bg-primary text-primary-foreground":"bg-muted"}`}>{x}</button>)}</div></div>
      <div className="mt-5 space-y-3">
        {!shown.length ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No reports in this filter.</p> : shown.map(item => <article key={item.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-primary">{item.target_type.replace("_", " ")}</p><h3 className="mt-1 font-bold capitalize">{item.reason.replaceAll("_", " ")}</h3></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-bold capitalize">{item.status}</span></div>
          {item.details && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{item.details}</p>}
          {item.moderation_notes && <p className="mt-3 rounded-lg bg-muted p-3 text-sm"><strong>Moderation note:</strong> {item.moderation_notes}</p>}
          <p className="mt-3 text-xs text-muted-foreground">Submitted {new Date(item.created_at).toLocaleString()}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {targetUrl(item) && <a href={targetUrl(item)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted"><ExternalLink className="size-4"/>View content</a>}
            {item.status === "pending" && <>
              <Button disabled={busyId===item.id} variant="destructive" onClick={()=>moderate(item,"remove")}><Trash2 className="size-4"/>Remove content</Button>
              <Button disabled={busyId===item.id} variant="outline" onClick={()=>moderate(item,"ignore")}><EyeOff className="size-4"/>Ignore report</Button>
            </>}
            {item.status === "resolved" && <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700"><CheckCircle2 className="size-4"/>Resolved</span>}
          </div>
        </article>)}
      </div>
    </section> : section === "bugs" ? <section className="rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><Bug className="size-5"/>Bug Reports</h2><p className="text-sm text-muted-foreground">Review technical problems submitted by users.</p></div><div className="flex flex-wrap gap-2">{["open","new","investigating","fixed","closed","all"].map(x => <button key={x} onClick={()=>setBugFilter(x)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${bugFilter===x?"bg-primary text-primary-foreground":"bg-muted"}`}>{x}</button>)}</div></div>
      <div className="mt-5 space-y-3">
        {!shownBugs.length ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No bug reports in this filter.</p> : shownBugs.map(item => <article key={item.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-primary">Bug report</p><h3 className="mt-1 text-lg font-bold">{item.title}</h3></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-bold capitalize">{item.status}</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm">{item.description}</p>
          {item.steps_to_reproduce && <div className="mt-3 rounded-lg bg-muted p-3 text-sm"><strong>Steps:</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.steps_to_reproduce}</p></div>}
          <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <div><dt className="font-bold text-foreground">Device / browser</dt><dd>{item.device || "Unknown"} · {item.browser || "Unknown"}</dd></div>
            <div><dt className="font-bold text-foreground">Screen / version</dt><dd>{item.screen_size || "Unknown"} · {item.app_version || "Unknown"}</dd></div>
            <div><dt className="font-bold text-foreground">Contact</dt><dd>{item.email || "Not provided"}</dd></div>
            <div><dt className="font-bold text-foreground">Submitted</dt><dd>{new Date(item.created_at).toLocaleString()}</dd></div>
          </dl>
          {item.page_url && <a href={item.page_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1 break-all text-sm font-semibold text-primary underline"><ExternalLink className="size-4 shrink-0"/>Open reported page</a>}
          {item.moderator_notes && <p className="mt-3 rounded-lg border p-3 text-sm"><strong>Moderator note:</strong> {item.moderator_notes}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busyId===item.id} variant="outline" onClick={()=>updateBug(item,"investigating")}>Investigating</Button>
            <Button disabled={busyId===item.id} onClick={()=>updateBug(item,"fixed")}><CheckCircle2 className="size-4"/>Mark fixed</Button>
            <Button disabled={busyId===item.id} variant="outline" onClick={()=>updateBug(item,"closed")}>Close</Button>
          </div>
        </article>)}
      </div>
    </section> : <section className="rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="flex items-center gap-2 text-xl font-bold"><BarChart3 className="size-5"/>Private Visitor Analytics</h2><p className="text-sm text-muted-foreground">Counts unique browser/device visitors by Philippine date. No GPS, IP address, or personal profile data is stored.</p></div>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-semibold">From<input type="date" value={analyticsFrom} onChange={(e)=>setAnalyticsFrom(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"/></label>
        <label className="grid gap-1 text-sm font-semibold">To<input type="date" value={analyticsTo} onChange={(e)=>setAnalyticsTo(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"/></label>
        <Button onClick={()=>void loadAnalytics()} disabled={analyticsLoading}>{analyticsLoading ? "Loading…" : "Check visitors"}</Button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Visitors in selected range</p><p className="mt-2 text-3xl font-extrabold">{analyticsRows.reduce((sum,row)=>sum+row.unique_visitors,0)}</p><p className="mt-1 text-xs text-muted-foreground">Daily unique browser/device counts added together.</p></article>
        <article className="rounded-xl border p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Days selected</p><p className="mt-2 text-3xl font-extrabold">{analyticsRows.length}</p><p className="mt-1 text-xs text-muted-foreground">Only dates with at least one recorded visitor appear below.</p></article>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border">
        <div className="grid grid-cols-2 bg-muted px-4 py-2 text-xs font-bold uppercase tracking-wide"><span>Date</span><span className="text-right">Unique visitors</span></div>
        {!analyticsLoaded ? <p className="p-6 text-center text-sm text-muted-foreground">Choose a date or date range, then click Check visitors.</p> : !analyticsRows.length ? <p className="p-6 text-center text-sm text-muted-foreground">No visitor records for this date range.</p> : analyticsRows.map(row => <div key={row.visit_date} className="grid grid-cols-2 border-t px-4 py-3 text-sm"><span>{row.visit_date}</span><strong className="text-right">{row.unique_visitors}</strong></div>)}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">For your egress test: Supabase Cached Egress for a date ÷ this visitor count = approximate cached egress per visitor. Incognito/private sessions, cleared browser storage, or multiple devices can count as separate visitors.</p>
    </section>}
  </div>
}
