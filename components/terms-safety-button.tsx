"use client"

import Link from "next/link"
import { useState } from "react"
import { Bug, ShieldCheck } from "lucide-react"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { BugReportDialog } from "@/components/bug-report-dialog"

export function TermsSafetyButton() {
  const [open, setOpen] = useState(false)
  const [bugOpen, setBugOpen] = useState(false)
  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-[calc(env(safe-area-inset-bottom)+6rem)] right-4 z-[1500] flex size-11 items-center justify-center rounded-full border bg-card text-primary shadow-lg hover:bg-muted md:right-4 md:top-auto md:bottom-24 md:size-auto md:rounded-xl md:px-3 md:py-2 md:text-xs md:font-bold" aria-label="Terms and safety">
      <ShieldCheck className="size-5 shrink-0"/><span className="ml-2 hidden md:inline">Terms, Privacy & Safety</span>
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="Terms, privacy & safety" description="Important reminders for using Pet Alert PH responsibly.">
      <div className="space-y-4 text-sm leading-relaxed">
        <div className="rounded-xl bg-muted p-4"><p className="font-bold">Stay safe when meeting people</p><p className="mt-1 text-muted-foreground">Meet in a public place, bring someone you trust, and never send money before verifying a claim.</p></div>
        <div className="rounded-xl bg-muted p-4"><p className="font-bold">User-submitted information</p><p className="mt-1 text-muted-foreground">Pet Alert PH cannot guarantee the accuracy of reports, sightings, identities, or recovery claims. Use the private chat and verify evidence carefully.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setOpen(false); setBugOpen(true) }} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-semibold hover:bg-muted"><Bug className="size-4"/>Report a Bug</button>
          <Link href="/terms" target="_blank" className="rounded-lg border px-4 py-2 font-semibold hover:bg-muted">Terms of Use</Link>
          <Link href="/privacy" target="_blank" className="rounded-lg border px-4 py-2 font-semibold hover:bg-muted">Privacy Notice</Link>
        </div>
        <div className="rounded-xl border p-4"><p className="flex items-center gap-2 font-bold"><ShieldCheck className="size-4"/>Contact support</p><p className="mt-1">Nicholas Quintela</p><a className="text-primary underline" href="mailto:quintelanicholas3@gmail.com">quintelanicholas3@gmail.com</a></div>
        <Button className="w-full" onClick={() => setOpen(false)}>I understand</Button>
      </div>
    </Modal>
    <BugReportDialog open={bugOpen} onClose={() => setBugOpen(false)}/>
  </>
}
