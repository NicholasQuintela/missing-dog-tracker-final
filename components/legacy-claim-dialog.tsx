"use client"

import { useEffect, useState } from "react"
import { ArchiveRestore, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/modal"
import { createClient } from "@/lib/supabase/client"

type LegacyCheck = {
  available?: boolean
  reports?: number
  sightings?: number
}

type LegacyClaim = {
  claimed?: boolean
  reports?: number
  sightings?: number
}

type Props = {
  userId: string | null
}

export function LegacyClaimDialog({ userId }: Props) {
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [counts, setCounts] = useState({ reports: 0, sightings: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setOpen(false)
      setCounts({ reports: 0, sightings: 0 })
      setError(null)
      return
    }

    let cancelled = false

    async function checkLegacyReports() {
      setChecking(true)
      setError(null)
      const supabase = createClient()
      const { data, error } = await supabase.rpc("check_legacy_pet_alert_reports")

      if (cancelled) return

      setChecking(false)
      if (error) {
        // Migration assistance should never block normal app use.
        console.warn("[Pet Alert PH] legacy report check failed", error)
        return
      }

      const result = (data || {}) as LegacyCheck
      const reports = Number(result.reports || 0)
      const sightings = Number(result.sightings || 0)
      setCounts({ reports, sightings })
      setOpen(Boolean(result.available) && reports + sightings > 0)
    }

    void checkLegacyReports()
    return () => {
      cancelled = true
    }
  }, [userId])

  async function claimReports() {
    setClaiming(true)
    setError(null)
    const supabase = createClient()
    const { data, error } = await supabase.rpc("claim_legacy_pet_alert_reports")

    if (error) {
      setError(error.message || "Unable to transfer your previous reports.")
      setClaiming(false)
      return
    }

    const result = (data || {}) as LegacyClaim
    if (!result.claimed) {
      setError("No previous reports are available to transfer to this account.")
      setClaiming(false)
      return
    }

    // Reload so report ownership, edit permissions, and account views all use
    // the newly transferred owner/reporter IDs immediately.
    window.location.reload()
  }

  if (!userId || checking) return null

  const reportText = `${counts.reports} missing-pet ${counts.reports === 1 ? "report" : "reports"}`
  const sightingText = `${counts.sightings} ${counts.sightings === 1 ? "sighting" : "sightings"}`

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Welcome back"
      description="We found activity from your previous Pet Alert PH account."
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-2xl border bg-muted/35 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ArchiveRestore className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold">Transfer your previous reports</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We found {reportText} and {sightingText} associated with this email address. Claiming them makes this account their new owner.
            </p>
          </div>
        </div>

        {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={claiming}>
            Maybe later
          </Button>
          <Button type="button" onClick={claimReports} disabled={claiming}>
            {claiming ? <><Loader2 className="size-4 animate-spin" /> Transferring…</> : <><ArchiveRestore className="size-4" /> Claim my reports</>}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          This does not create duplicate reports. It only transfers ownership of the existing imported records to your current account.
        </p>
      </div>
    </Modal>
  )
}
