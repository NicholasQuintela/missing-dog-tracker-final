"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

const VISITOR_KEY = "petalertph_private_visitor_id"
const LAST_ACTIVITY_KEY = "petalertph_analytics_last_activity"
const SESSION_TIMEOUT_MS = 30 * 60 * 1000

export function PrivateVisitorAnalytics() {
  useEffect(() => {
    try {
      let visitorId = localStorage.getItem(VISITOR_KEY)
      if (!visitorId) {
        visitorId = crypto.randomUUID()
        localStorage.setItem(VISITOR_KEY, visitorId)
      }

      const now = Date.now()
      const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || "0")
      const newSession = !lastActivity || now - lastActivity >= SESSION_TIMEOUT_MS
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now))

      // One tiny aggregate RPC per full app/page load. It counts the load, increments
      // sessions only after 30+ minutes away, and keeps unique visitors deduplicated.
      const supabase = createClient()
      void supabase.rpc("record_pet_alert_activity", {
        p_visitor_id: visitorId,
        p_new_session: newSession,
      }).then(({ error }) => {
        if (error) console.warn("Pet Alert PH private analytics could not record this activity.")
      })
    } catch {
      // Analytics must never interfere with the Pet Alert PH experience.
    }
  }, [])

  return null
}
