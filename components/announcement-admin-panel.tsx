"use client"

import { useEffect, useState } from "react"
import { Save, Loader2, Megaphone } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function AnnouncementAdminPanel() {
  const supabase = createClient()
  const [title, setTitle] = useState("What’s New")
  const [body, setBody] = useState("Pet Alert PH updates and improvements will appear here.")
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let active = true
    supabase.from("app_announcements").select("title, body, enabled").eq("id", "whats-new").maybeSingle().then(({ data, error }) => {
      if (!active) return
      if (data) {
        setTitle(data.title || "What’s New")
        setBody(data.body || "")
        setEnabled(data.enabled !== false)
      } else if (error) setMessage("Could not load announcement. Apply the included SQL setup first.")
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function save() {
    setSaving(true); setMessage("")
    const { error } = await supabase.from("app_announcements").upsert({ id: "whats-new", title: title.trim(), body: body.trim(), enabled, updated_at: new Date().toISOString() }, { onConflict: "id" })
    setMessage(error ? `Save failed: ${error.message}` : "What’s New announcement saved.")
    setSaving(false)
  }

  return <section className="mt-6 rounded-2xl border bg-card p-4 sm:p-6">
    <div className="flex items-center gap-2"><Megaphone className="size-5 text-primary"/><div><h2 className="text-lg font-bold">What’s New announcement</h2><p className="text-sm text-muted-foreground">Edit the popup shown when visitors open Pet Alert PH.</p></div></div>
    {loading ? <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Loading announcement…</div> : <div className="mt-4 space-y-3">
      <label className="block text-sm font-semibold">Title<input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 font-normal"/></label>
      <label className="block text-sm font-semibold">Description<textarea value={body} onChange={e => setBody(e.target.value)} rows={5} maxLength={2000} className="mt-1 w-full rounded-lg border bg-background p-3 font-normal"/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>Show announcement to visitors</label>
      <div className="flex flex-wrap items-center gap-3"><Button onClick={() => void save()} disabled={saving || !title.trim()}>{saving ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>}Save announcement</Button>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</div>
    </div>}
  </section>
}
