import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ModerationCenter } from "@/components/moderation-center"

export const dynamic = "force-dynamic"

export default async function ModerationPage() {
  const supabase = await createClient()
  const userResult = await supabase.auth.getUser()
  const user = userResult.data.user
  if (!user) return <main className="p-8">Please log in to access moderation.</main>

  const roleResult = await supabase.rpc("get_my_pet_alert_admin_role")
  const role = typeof roleResult.data === "string" ? roleResult.data : null
  if (!role) return <main className="p-8">Access denied. This area is for Pet Alert PH administrators only.</main>

  const [abuseResult, statsResult] = await Promise.all([
    supabase.from("abuse_reports").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.rpc("get_pet_alert_admin_stats"),
  ])

  const rawStats = (statsResult.data || {}) as Record<string, number>
  const stats = {
    users: Number(rawStats.users || 0),
    reports: Number(rawStats.reports || 0),
    activeReports: Number(rawStats.active_reports || 0),
    solvedReports: Number(rawStats.solved_reports || 0),
    sightings: Number(rawStats.sightings || 0),
    volunteers: Number(rawStats.volunteers || 0),
    pendingAbuse: Number(rawStats.pending_abuse || 0),
  }

  return <main className="min-h-dvh bg-background">
    <header className="border-b bg-card"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4"><div><h1 className="text-2xl font-extrabold">Pet Alert PH Moderation</h1><p className="text-sm text-muted-foreground">Admin and super-admin management center</p></div><Link href="/" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">Back to map</Link></div></header>
    <div className="mx-auto max-w-6xl p-4 sm:p-6"><ModerationCenter initialItems={(abuseResult.data || []) as never[]} stats={stats} role={role}/></div>
  </main>
}
