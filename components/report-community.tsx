"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Flag, Megaphone, MessageCircle, Pencil, ThumbsUp, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { ReportAbuseDialog } from "@/components/report-abuse-dialog"

type CommentRow = {
  id: string
  dog_id: string
  user_id: string
  author_name: string
  body: string
  created_at: string
  updated_at: string | null
}

type Props = {
  dogId: string
  ownerId: string | null
  currentUserId?: string | null
}

export function ReportCommunity({ dogId, ownerId, currentUserId }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [awareCount, setAwareCount] = useState(0)
  const [isAware, setIsAware] = useState(false)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [helpfulCounts, setHelpfulCounts] = useState<Record<string, number>>({})
  const [myHelpful, setMyHelpful] = useState<Set<string>>(new Set())
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState("")
  const [abuseCommentId, setAbuseCommentId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [awareResult, commentsResult, helpfulResult] = await Promise.all([
      supabase.from("report_awareness").select("user_id").eq("dog_id", dogId),
      supabase.from("report_comments").select("id,dog_id,user_id,author_name,body,created_at,updated_at").eq("dog_id", dogId).is("deleted_at", null).order("created_at", { ascending: true }),
      supabase.from("comment_helpful").select("comment_id,user_id").eq("dog_id", dogId),
    ])

    const awareRows = (awareResult.data as { user_id: string }[] | null) || []
    setAwareCount(awareRows.length)
    setIsAware(Boolean(currentUserId && awareRows.some(row => row.user_id === currentUserId)))
    setComments((commentsResult.data as CommentRow[] | null) || [])

    const counts: Record<string, number> = {}
    const mine = new Set<string>()
    for (const row of ((helpfulResult.data as { comment_id: string; user_id: string }[] | null) || [])) {
      counts[row.comment_id] = (counts[row.comment_id] || 0) + 1
      if (row.user_id === currentUserId) mine.add(row.comment_id)
    }
    setHelpfulCounts(counts)
    setMyHelpful(mine)
  }, [currentUserId, dogId, supabase])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel(`report-community-${dogId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "report_awareness", filter: `dog_id=eq.${dogId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "report_comments", filter: `dog_id=eq.${dogId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "comment_helpful", filter: `dog_id=eq.${dogId}` }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [dogId, load, supabase])

  async function toggleAware() {
    if (!currentUserId) { setMessage("Please log in to mark yourself as aware."); return }
    setMessage(null)
    if (isAware) {
      const { error } = await supabase.from("report_awareness").delete().eq("dog_id", dogId).eq("user_id", currentUserId)
      if (error) { setMessage(error.message); return }
      setIsAware(false)
      setAwareCount(value => Math.max(0, value - 1))
    } else {
      const { error } = await supabase.from("report_awareness").insert({ dog_id: dogId, user_id: currentUserId })
      if (error) { setMessage(error.message); return }
      setIsAware(true)
      setAwareCount(value => value + 1)
    }
  }

  async function submitComment(event: React.FormEvent) {
    event.preventDefault()
    if (!currentUserId) { setMessage("Please log in to comment."); return }
    const text = body.trim()
    if (!text) return
    setBusy(true)
    setMessage(null)
    const profileResult = await supabase.from("profiles").select("username").eq("id", currentUserId).maybeSingle()
    const authorName = profileResult.data?.username || "Community member"
    const { error } = await supabase.from("report_comments").insert({ dog_id: dogId, user_id: currentUserId, author_name: authorName, body: text })
    setBusy(false)
    if (error) { setMessage(error.message); return }
    setBody("")
  }

  async function saveEdit(id: string) {
    const text = editingBody.trim()
    if (!text) return
    const { error } = await supabase.from("report_comments").update({ body: text, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", currentUserId)
    if (error) { setMessage(error.message); return }
    setEditingId(null)
    setEditingBody("")
  }

  async function deleteComment(id: string) {
    if (!confirm("Delete this comment?")) return
    const { error } = await supabase.from("report_comments").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("user_id", currentUserId)
    if (error) setMessage(error.message)
  }

  async function toggleHelpful(commentId: string) {
    if (!currentUserId) { setMessage("Please log in to mark a comment helpful."); return }
    if (myHelpful.has(commentId)) {
      const { error } = await supabase.from("comment_helpful").delete().eq("comment_id", commentId).eq("user_id", currentUserId)
      if (error) { setMessage(error.message); return }
    } else {
      const { error } = await supabase.from("comment_helpful").insert({ dog_id: dogId, comment_id: commentId, user_id: currentUserId })
      if (error) { setMessage(error.message); return }
    }
    void load()
  }

  return <section id="comments" className="rounded-2xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 font-serif text-lg font-extrabold"><MessageCircle className="size-5" /> Community activity</h3>
        <p className="text-xs text-muted-foreground">Awareness and useful public updates for this report.</p>
      </div>
      <Button type="button" variant={isAware ? "default" : "outline"} onClick={toggleAware}>
        <Megaphone className="size-4" /> {isAware ? "Aware" : "I'm Aware"} · {awareCount}
      </Button>
    </div>

    <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
      <MessageCircle className="size-4" /> {comments.length} {comments.length === 1 ? "comment" : "comments"}
    </div>

    <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
      {comments.length === 0 && <p className="rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">No comments yet. Be the first to leave a helpful update.</p>}
      {comments.map(comment => {
        const mine = comment.user_id === currentUserId
        const owner = comment.user_id === ownerId
        const editing = editingId === comment.id
        return <article key={comment.id} className="rounded-xl border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-bold">{comment.author_name} {owner && <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">OWNER</span>}</p><p className="text-[11px] text-muted-foreground">{new Date(comment.created_at).toLocaleString()}{comment.updated_at ? " · edited" : ""}</p></div>
            <div className="flex items-center gap-1">
              {mine && <><button type="button" className="rounded p-1.5 hover:bg-muted" aria-label="Edit comment" onClick={() => { setEditingId(comment.id); setEditingBody(comment.body) }}><Pencil className="size-3.5" /></button><button type="button" className="rounded p-1.5 text-destructive hover:bg-destructive/10" aria-label="Delete comment" onClick={() => void deleteComment(comment.id)}><Trash2 className="size-3.5" /></button></>}
              {!mine && currentUserId && <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Report comment" onClick={() => setAbuseCommentId(comment.id)}><Flag className="size-3.5" /></button>}
            </div>
          </div>
          {editing ? <div className="mt-2 space-y-2"><textarea value={editingBody} onChange={e => setEditingBody(e.target.value)} maxLength={1000} className="min-h-20 w-full rounded-lg border bg-card p-2 text-sm outline-none"/><div className="flex gap-2"><Button type="button" size="sm" onClick={() => void saveEdit(comment.id)}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="size-4" /> Cancel</Button></div></div> : <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>}
          <button type="button" onClick={() => void toggleHelpful(comment.id)} className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${myHelpful.has(comment.id) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><ThumbsUp className="size-3.5" /> Helpful · {helpfulCounts[comment.id] || 0}</button>
        </article>
      })}
    </div>

    <form onSubmit={submitComment} className="mt-4 space-y-2">
      <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={1000} placeholder={currentUserId ? "Add a useful public comment…" : "Log in to comment"} disabled={!currentUserId || busy} className="min-h-24 w-full rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
      <div className="flex items-center justify-between gap-3"><p className="text-[11px] text-muted-foreground">Do not post private phone numbers, home addresses, or sensitive information.</p><Button type="submit" disabled={!currentUserId || busy || !body.trim()}>{busy ? "Posting…" : "Post comment"}</Button></div>
    </form>
    {message && <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm">{message}</p>}
    <ReportAbuseDialog open={!!abuseCommentId} onClose={() => setAbuseCommentId(null)} targetType="comment" targetId={abuseCommentId || ""} />
  </section>
}
