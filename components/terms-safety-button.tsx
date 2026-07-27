"use client"

import Link from "next/link"
import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"

export function TermsSafetyButton() {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed right-0 top-1/2 z-[1500] -translate-y-1/2 rounded-l-xl border border-r-0 bg-card px-2 py-3 text-xs font-bold shadow-lg [writing-mode:vertical-rl] hover:bg-muted" aria-label="Terms and safety">
      Terms & Safety
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="Terms, privacy & safety" description="Important reminders for using Pet Alert PH responsibly.">
      <div className="space-y-4 text-sm leading-relaxed">
        <div className="rounded-xl bg-muted p-4"><p className="font-bold">Stay safe when meeting people</p><p className="mt-1 text-muted-foreground">Meet in a public place, bring someone you trust, and never send money before verifying a claim.</p></div>
        <div className="rounded-xl bg-muted p-4"><p className="font-bold">User-submitted information</p><p className="mt-1 text-muted-foreground">Pet Alert PH cannot guarantee the accuracy of reports, sightings, identities, or recovery claims. Use the private chat and verify evidence carefully.</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/terms" target="_blank" className="rounded-lg border px-4 py-2 font-semibold hover:bg-muted">Terms of Use</Link>
          <Link href="/privacy" target="_blank" className="rounded-lg border px-4 py-2 font-semibold hover:bg-muted">Privacy Notice</Link>
        </div>
        <div className="rounded-xl border p-4"><p className="flex items-center gap-2 font-bold"><ShieldCheck className="size-4"/>Contact support</p><p className="mt-1">Nicholas Quintela</p><a className="text-primary underline" href="mailto:quintelanicholas3@gmail.com">quintelanicholas3@gmail.com</a></div>
        <Button className="w-full" onClick={() => setOpen(false)}>I understand</Button>
      </div>
    </Modal>
  </>
}
