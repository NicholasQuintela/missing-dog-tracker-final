"use client"

import { useState } from "react"
import { ImageIcon, Maximize2, Sparkles } from "lucide-react"

export function WhatsNewOverlay() {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[400] flex cursor-pointer items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="What's new. Tap anywhere to close."
      onClick={() => setVisible(false)}
    >
      <div className="pointer-events-none w-full max-w-sm rounded-3xl border bg-card p-6 text-card-foreground shadow-2xl sm:max-w-md sm:p-7">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles className="size-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Pet Alert PH</p>
            <h2 className="font-serif text-2xl font-extrabold">What&apos;s New</h2>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-4">
            <ImageIcon className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-bold">Full photo in report details</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">Pet photos now keep their original shape without cropping.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-4">
            <Maximize2 className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-bold">Tap to enlarge</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">Tap a report photo to open it in a larger full-screen view.</p>
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-sm font-semibold text-foreground">Tap anywhere to continue</p>
      </div>
    </div>
  )
}
