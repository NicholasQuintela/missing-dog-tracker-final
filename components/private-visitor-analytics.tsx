"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

const VISITOR_KEY = "petalertph_private_visitor_id"
const RECORDED_PREFIX = "petalertph_private_analytics_recorded_"

function philippineDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export function PrivateVisitorAnalytics() {
  useEffect(() => {
    try {
      const today = philippineDateKey()
      const marker = `${RECORDED_PREFIX}${today}`
      if (localStorage.getItem(marker) === "1") return

      let visitorId = localStorage.getItem(VISITOR_KEY)
      if (!visitorId) {
        visitorId = crypto.randomUUID()
        localStorage.setItem(VISITOR_KEY, visitorId)
      }

      // Mark first so navigation/re-renders cannot generate duplicate analytics writes.
      localStorage.setItem(marker, "1")

      const supabase = createClient()
      void supabase.rpc("record_pet_alert_visit", { p_visitor_id: visitorId }).then(({ error }) => {
        if (error) console.warn("Pet Alert PH private analytics could not record this visit.")
      })
    } catch {
      // Analytics must never interfere with the Pet Alert PH experience.
    }
  }, [])

  return null
}
