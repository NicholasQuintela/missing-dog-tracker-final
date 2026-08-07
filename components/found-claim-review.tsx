"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, MessageCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { removeStoredPhoto } from "@/lib/storage-photo"

type Claim = {
  id: string
  dog_id: string
  finder_id: string
  finder_name: string
  note: string | null
  photo_url: string | null
  status: "pending" | "confirmed" | "rejected"
  created_at: string
}

type Dog = { id: string; name: string; owner_id: string | null; status: string; photo_url?: string | null; photo_path?: string | null }

export function FoundClaimReview({
  claimId,
  userId,
  onOpenChat,
  onClose,
}: {
  claimId: string
  userId: string
  onOpenChat: (conversationId: string) => void
  onClose: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [claim, setClaim] = useState<Claim | null>(null)
  const [dog, setDog] = useState<Dog | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      const claimResult = await supabase.from("found_claims").select("*").eq("id", claimId).single()
      if (!active) return
      if (claimResult.error || !claimResult.data) {
        setError(claimResult.error?.message || "Claim not found or you do not have access.")
        setLoading(false)
        return
      }
      const nextClaim = claimResult.data as Claim
      setClaim(nextClaim)
      const [dogResult, chatResult] = await Promise.all([
        supabase.from("missing_dogs").select("id,name,owner_id,status,photo_url,photo_path").eq("id", nextClaim.dog_id).single(),
        supabase.from("conversations").select("id").eq("source_type", "found").eq("source_id", nextClaim.id).maybeSingle(),
      ])
      if (!active) return
      if (dogResult.data) setDog(dogResult.data as Dog)
      if (chatResult.data) setConversationId((chatResult.data as { id: string }).id)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [claimId, supabase])

  async function review(decision: "confirmed" | "rejected") {
    if (decision === "confirmed" && !confirm("Confirm that this is your pet? The missing-report photo will be permanently deleted.")) return
    setReviewing(true)
    setError(null)
    const result = await supabase.rpc("review_found_claim", { p_claim_id: claimId, p_decision: decision })
    if (result.error) {
      setError(result.error.message)
      setReviewing(false)
      return
    }
    if (decision === "confirmed" && dog) {
      try {
        await removeStoredPhoto(supabase, dog.photo_path, dog.photo_url)
        const clearResult = await supabase.from("missing_dogs").update({ photo_url: null, photo_path: null }).eq("id", dog.id)
        if (clearResult.error) throw clearResult.error
        setDog(current => current ? { ...current, status: "found", photo_url: null, photo_path: null } : current)
      } catch (photoError) {
        setError(`The pet was marked found, but the old report photo could not be removed. Please report this to support. ${photoError instanceof Error ? photoError.message : ""}`)
      }
    }
    setClaim(current => current ? { ...current, status: decision } : current)
    if (result.data) setConversationId(result.data as string)
    setReviewing(false)
  }

  if (loading) return <div className="rounded-2xl border bg-card p-8 text-center"><Loader2 className="mx-auto size-6 animate-spin" /><p className="mt-3 text-sm text-muted-foreground">Loading claim proof…</p></div>
  if (error && !claim) return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6"><p className="font-semibold text-destructive">Unable to open claim</p><p className="mt-2 text-sm">{error}</p><Button className="mt-4" variant="outline" onClick={onClose}>Back to notifications</Button></div>
  if (!claim) return null

  const isOwner = dog?.owner_id === userId
  return <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wide text-primary">Found-pet claim</p><h2 className="mt-1 font-serif text-2xl font-extrabold">Possible match for {dog?.name || "your pet"}</h2><p className="mt-1 text-sm text-muted-foreground">Submitted {new Date(claim.created_at).toLocaleString()}</p></div>
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold capitalize">{claim.status}</span>
    </div>

    {claim.photo_url ? <img loading="lazy" decoding="async" src={claim.photo_url} alt="Proof submitted by finder" className="mt-5 max-h-[28rem] w-full rounded-2xl bg-muted object-contain" /> : <div className="mt-5 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No proof image is available.</div>}

    <div className="mt-5 rounded-xl bg-muted p-4"><p className="font-bold">Submitted by {claim.finder_name}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{claim.note || "No additional details were provided."}</p></div>
    {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {isOwner && claim.status === "pending" && <>
        <Button disabled={reviewing} onClick={() => review("confirmed")}><CheckCircle2 className="size-4" /> Accept — this is my pet</Button>
        <Button disabled={reviewing} variant="outline" onClick={() => review("rejected")}><XCircle className="size-4" /> Reject claim</Button>
      </>}
      {conversationId && <Button variant="secondary" onClick={() => onOpenChat(conversationId)}><MessageCircle className="size-4" /> Message finder</Button>}
      <Button variant="ghost" onClick={onClose}>Back to notifications</Button>
    </div>
  </section>
}
