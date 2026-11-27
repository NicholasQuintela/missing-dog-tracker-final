"use client"

import { useEffect, useMemo, useState } from "react"
import { ScanSearch, ClipboardPlus, MapPinCheck, X, ChevronRight } from "lucide-react"

type Rect = { top: number; left: number; width: number; height: number }
type Viewport = { width: number; height: number }
type Step = { selector: string; title: string; description: string; icon: "scan" | "report" | "sighting" }

const STEPS: Step[] = [
  { selector: '[data-tour="scan-pet"]', title: "Scan a Pet", description: "Upload one pet photo to find visually similar Missing Pet and Pet Sighting reports on Pet Alert PH.", icon: "scan" },
  { selector: '[data-tour="report-missing"]', title: "Report a missing pet", description: "Create a missing-pet report so the community can help find your pet.", icon: "report" },
  { selector: '[data-tour="report-sighting"]', title: "Report a sighting", description: "Share a photo and location when you spot a pet that may be missing.", icon: "sighting" },
]

export function OnboardingTour() {
  // Restart on each fresh app load/refresh, as requested.
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ width: 1024, height: 768 })
  const visible = stepIndex < STEPS.length
  const step = STEPS[stepIndex] ?? STEPS[STEPS.length - 1]
  const isMobile = viewport.width <= 640

  useEffect(() => {
    const update = () => {
      const vv = window.visualViewport
      setViewport({ width: Math.round(vv?.width ?? window.innerWidth), height: Math.round(vv?.height ?? window.innerHeight) })
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    window.visualViewport?.addEventListener("resize", update)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
      window.visualViewport?.removeEventListener("resize", update)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    let raf = 0
    let observer: ResizeObserver | null = null
    const update = () => {
      const element = document.querySelector(step.selector) as HTMLElement | null
      if (!element) { setRect(null); return }
      const box = element.getBoundingClientRect()
      const padding = isMobile ? 4 : 7
      const left = Math.max(8, Math.min(viewport.width - 8, box.left - padding))
      setRect({ top: Math.max(8, box.top - padding), left, width: Math.max(0, Math.min(viewport.width - left - 8, box.width + padding * 2)), height: box.height + padding * 2 })
    }
    const schedule = () => { window.cancelAnimationFrame(raf); raf = window.requestAnimationFrame(update) }
    update()
    const target = document.querySelector(step.selector)
    if (target && typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(schedule); observer.observe(target) }
    window.addEventListener("scroll", schedule, true)
    window.addEventListener("resize", schedule)
    window.visualViewport?.addEventListener("resize", schedule)
    return () => {
      window.cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener("scroll", schedule, true)
      window.removeEventListener("resize", schedule)
      window.visualViewport?.removeEventListener("resize", schedule)
    }
  }, [isMobile, step.selector, viewport.height, viewport.width, visible])

  const tooltip = useMemo(() => {
    const width = Math.min(360, Math.max(260, viewport.width - 24))
    const targetCenter = rect ? rect.left + rect.width / 2 : viewport.width / 2
    const left = Math.max(12, Math.min(viewport.width - width - 12, targetCenter - width / 2))
    // Keep mobile instructions above the bottom action row on phones and tablets.
    if (isMobile) return { width, left: 12, top: 84 }
    const estimate = 174
    const below = rect ? rect.top + rect.height + 16 : 220
    const top = below + estimate < viewport.height - 12 ? below : Math.max(12, (rect?.top ?? viewport.height / 2) - estimate - 16)
    return { width, left, top }
  }, [isMobile, rect, viewport.height, viewport.width])

  if (!visible) return null
  const advance = () => setStepIndex((current) => Math.min(STEPS.length, current + 1))
  const finish = () => setStepIndex(STEPS.length)

  return (
    <>
      {/* Four non-interactive panels dim the page while leaving the highlighted button fully visible and tappable. */}
      {rect ? <>
        <div aria-hidden="true" className="pointer-events-none fixed left-0 right-0 top-0 z-[300] bg-black/65" style={{ height: rect.top }} />
        <div aria-hidden="true" className="pointer-events-none fixed bottom-0 left-0 right-0 z-[300] bg-black/65" style={{ top: rect.top + rect.height }} />
        <div aria-hidden="true" className="pointer-events-none fixed left-0 z-[300] bg-black/65" style={{ top: rect.top, height: rect.height, width: rect.left }} />
        <div aria-hidden="true" className="pointer-events-none fixed right-0 z-[300] bg-black/65" style={{ top: rect.top, height: rect.height, left: rect.left + rect.width }} />
        <div aria-hidden="true" className="pointer-events-none fixed z-[301] rounded-xl border-[3px] border-white shadow-[0_0_0_4px_rgba(255,255,255,0.18)]" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      </> : <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[300] bg-black/65" />}
      <section role="dialog" aria-modal="false" aria-label={`${step.title} guide`} className="fixed z-[302] max-h-[min(42dvh,280px)] overflow-y-auto rounded-2xl border bg-card p-4 text-card-foreground shadow-2xl sm:p-5" style={{ top: tooltip.top, left: tooltip.left, width: tooltip.width }}>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {step.icon === "scan" ? <ScanSearch className="size-5" /> : step.icon === "report" ? <ClipboardPlus className="size-5" /> : <MapPinCheck className="size-5" />}
          </div>
          <div className="min-w-0 flex-1"><p className="font-serif text-base font-extrabold sm:text-lg">{step.title}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{step.description}</p></div>
          <button type="button" onClick={finish} aria-label="Close guide" className="-mr-1 -mt-1 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">{stepIndex + 1} of {STEPS.length}</span>
          <button type="button" onClick={advance} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90">{stepIndex === STEPS.length - 1 ? "Finish" : "Next"}{stepIndex !== STEPS.length - 1 && <ChevronRight className="size-4" />}</button>
        </div>
      </section>
    </>
  )
}
