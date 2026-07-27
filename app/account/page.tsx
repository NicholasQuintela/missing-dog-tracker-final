import Link from "next/link"
import { redirect } from "next/navigation"
import { Bell, PawPrint } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { AccountClient } from "@/components/account-client"

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: dogs } = await supabase.from("missing_dogs").select("*").eq("owner_id", user.id).order("created_at", { ascending: false })
  const { data: notifications } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20)
  return <main className="min-h-dvh bg-background p-4 sm:p-8"><div className="mx-auto max-w-5xl"><div className="mb-8 flex flex-wrap items-center justify-between gap-4"><Link href="/" className="flex items-center gap-2 font-serif text-xl font-extrabold"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><PawPrint className="size-5"/></span>PawFinder</Link><Button asChild variant="outline"><Link href="/"><Bell className="size-4"/> Back to map</Link></Button></div><div className="mb-8"><p className="text-sm text-muted-foreground">Signed in as {user.email}</p><h1 className="font-serif text-3xl font-extrabold">My reports</h1><p className="mt-1 text-muted-foreground">Track your lost dogs and receive updates from the search community.</p></div><AccountClient dogs={dogs || []} notifications={notifications || []}/></div></main>
}
