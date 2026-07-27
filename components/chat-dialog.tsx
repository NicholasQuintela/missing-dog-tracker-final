"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Send } from "lucide-react"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { ChatMessage } from "@/lib/types"

export function ChatDialog({ open, onClose, conversationId, userId }: { open: boolean; onClose: () => void; conversationId: string | null; userId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !conversationId) return
    let active = true
    async function loadMessages() {
      const result = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200)

      if (!active) return
      if (result.error) setError(result.error.message)
      else setMessages((result.data as ChatMessage[]) || [])
    }

    void loadMessages()
    const channel = supabase.channel(`chat-${conversationId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, payload => setMessages(prev => prev.some(m => m.id === (payload.new as ChatMessage).id) ? prev : [...prev, payload.new as ChatMessage])).subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [open, conversationId, supabase])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!conversationId || !text || text.length > 1000) return
    setSending(true); setError(null)
    const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, body: text })
    if (error) setError(error.message); else setBody("")
    setSending(false)
  }

  return <Modal open={open} onClose={onClose} title="Private chat" description="Only the dog owner and the verified volunteer, sighting reporter, or finder can read this conversation.">
    <div className="flex h-[60vh] flex-col gap-3">
      <div className="flex-1 space-y-2 overflow-y-auto rounded-xl bg-muted/50 p-3">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Start the conversation.</p>}
        {messages.map(message => <div key={message.id} className={`flex ${message.sender_id === userId ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${message.sender_id === userId ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}><p className="whitespace-pre-wrap break-words">{message.body}</p><p className="mt-1 text-[10px] opacity-70">{new Date(message.created_at).toLocaleString()}</p></div></div>)}
        <div ref={bottomRef} />
      </div>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <form onSubmit={send} className="flex gap-2">
        <input value={body} onChange={e => setBody(e.target.value)} maxLength={1000} placeholder="Write a message…" className="h-11 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <Button type="submit" size="icon-lg" disabled={sending || !body.trim()}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
      </form>
      <p className="text-xs text-muted-foreground">Text-only chat keeps storage use very low. Maximum 1,000 characters per message.</p>
    </div>
  </Modal>
}
