"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, ExternalLink, EyeOff, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

type AbuseItem = {
  id: string
  reporter_id: string
  target_type: "missing_dog" | "sighting" | "message" | "user"
  target_id: string
  reason: string
  details: string | null
  status: string
  moderation_notes?: string | null
  created_at: string
}

type Stats = { users:number; reports:number; activeReports:number; solvedReports:number; sightings:number; volunteers:number; pendingAbuse:number }

export function ModerationCenter({ initialItems, stats, role }: { initialItems: AbuseItem[]; stats: Stats; role: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState("pending")
  const [busyId, setBusyId] = useState<string | null>(null)

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

  const shown = filter === "all" ? items : items.filter(x => x.status === filter)
  const targetUrl = (item: AbuseItem) => item.target_type === "missing_dog" ? `/?report=${item.target_id}` : item.target_type === "sighting" ? `/?sighting=${item.target_id}` : null

  return <div className="space-y-6">
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Registered users", stats.users], ["All reports", stats.reports], ["Active missing", stats.activeReports], ["Solved reports", stats.solvedReports],
        ["Sightings", stats.sightings], ["Volunteers", stats.volunteers], ["Pending abuse", stats.pendingAbuse], ["Your role", role],
      ].map(([label, value]) => <article key={String(label)} className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-extrabold">{value}</p></article>)}
    </section>

    <section className="rounded-2xl border bg-card p-4 sm:p-6">
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
    </section>
  </div>
}
