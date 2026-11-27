"use client"

import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const DEFAULT_TITLE = "What’s New"
const DEFAULT_BODY = "Pet Alert PH updates and improvements will appear here."

export function WhatsNewOverlay() {
  const [visible, setVisible] = useState(true)
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [body, setBody] = useState(DEFAULT_BODY)

  useEffect(() => {
    const supabase = createClient()
    supabase.from("app_announcements").select("title, body, enabled").eq("id", "whats-new").maybeSingle()
      .then(({ data }) => {
        if (!data) return
        if (data.enabled === false) { setVisible(false); return }
        if (typeof data.title === "string" && data.title.trim()) setTitle(data.title)
        if (typeof data.body === "string" && data.body.trim()) setBody(data.body)
      })
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[400] flex cursor-pointer items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="What's new. Tap anywhere to close." onClick={() => setVisible(false)}>
      <div className="pointer-events-none w-full max-w-sm rounded-3xl border bg-card p-6 text-card-foreground shadow-2xl sm:max-w-md sm:p-7">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Sparkles className="size-6" /></div>
          <div><p className="text-xs font-bold uppercase tracking-widest text-primary">Pet Alert PH</p><h2 className="font-serif text-2xl font-extrabold">{title}</h2></div>
        </div>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{body}</p>
        <p className="mt-5 text-center text-sm font-semibold text-foreground">Tap anywhere to continue</p>
      </div>
    </div>
  )
}
