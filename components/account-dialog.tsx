"use client"

import { useEffect, useState } from "react"
import { LogOut, PawPrint } from "lucide-react"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { MissingDog } from "@/lib/types"

export function AccountDialog({ open, onClose, userEmail, username, userId, onSignOut }: { open: boolean; onClose: () => void; userEmail: string; username: string; userId: string; onSignOut: () => void }) {
  const supabase = createClient()
  const [dogs, setDogs] = useState<MissingDog[]>([])
  useEffect(() => { if (!open) return; supabase.from("missing_dogs").select("*").eq("owner_id", userId).order("created_at", { ascending: false }).then(({ data }) => setDogs((data as MissingDog[]) || [])) }, [open, supabase, userId])
  async function signOut() { await supabase.auth.signOut(); onSignOut(); onClose() }
  return <Modal open={open} onClose={onClose} title="My Pet Alert PH account" description={username ? `@${username} · ${userEmail}` : userEmail}>
    <div className="flex flex-col gap-4">
      <div><h3 className="font-bold">My reports</h3><p className="text-sm text-muted-foreground">Pets linked to your account.</p></div>
      {dogs.length === 0 ? <div className="rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground"><PawPrint className="mx-auto mb-2 size-6" />You haven't posted a report yet.</div> : <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">{dogs.map(d => <div key={d.id} className="flex items-center justify-between rounded-xl border border-border p-3"><div><p className="font-semibold">{d.name}</p><p className="text-xs text-muted-foreground">{d.status === "found" ? "Found & safe" : "Still missing"}</p></div><span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</span></div>)}</div>}
      <Button variant="outline" size="lg" onClick={signOut}><LogOut className="size-4" /> Log out</Button>
    </div>
  </Modal>
}
