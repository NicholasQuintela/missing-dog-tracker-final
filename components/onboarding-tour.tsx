"use client"

import { useEffect, useMemo, useState } from "react"
import { BrainCircuit, Eye, Plus } from "lucide-react"

type Rect = { top: number; left: number; width: number; height: number }
type Viewport = { width: number; height: number }

type Step = {
  selector: string
  title: string
  description: string
  icon: "scan" | "report" | "sighting"
}

const STEPS: Step[] = [
  { selector: '[data-tour="scan-pet"]', title: "Scan a Pet", description: "Upload one pet photo to find visually similar Missing Pet and Pet Sighting reports on Pet Alert PH.", icon: "scan" },
  { selector: '[data-tour="report-missing"]', title: "Report a missing pet", description: "Create a missing-pet report so the community can help find your pet.", icon: "report" },
  { selector: '[data-tour="report-sighting"]', title: "Report a sighting", description: "Share a photo and location when you spot a pet that may be missing.", icon: "sighting" },
]

export function OnboardingTour() {
  const [stepIndex, setStepIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ width: 1024, height: 768 })

  const visible = started && stepIndex < STEPS.length
  const step = STEPS[stepIndex] ?? STEPS[STEPS.length - 1]
  const isMobile = viewport.width <= 640

  useEffect(() => {
    try { if (localStorage.getItem("petalertph:mini-guide-complete") === "1") return } catch {}
    const begin = () => {
      setStarted(true)
      window.removeEventListener("pointerdown", begin, true)
    }
    window.addEventListener("pointerdown", begin, true)
    return () => window.removeEventListener("pointerdown", begin, true)
  }, [])

  useEffect(() => {
    const updateViewport = () => {
      const visualViewport = window.visualViewport
      setViewport({
        width: Math.round(visualViewport?.width ?? window.innerWidth),
        height: Math.round(visualViewport?.height ?? window.innerHeight),
      })
    }

    updateViewport()
    window.addEventListener("resize", updateViewport)
    window.addEventListener("orientationchange", updateViewport)
    window.visualViewport?.addEventListener("resize", updateViewport)

    return () => {
      window.removeEventListener("resize", updateViewport)
      window.removeEventListener("orientationchange", updateViewport)
      window.visualViewport?.removeEventListener("resize", updateViewport)
    }
  }, [])

  useEffect(() => {
    if (!visible) return

    let timer = 0
    let scrollTimer = 0

    const update = () => {
      const element = document.querySelector(step.selector) as HTMLElement | null
      if (!element) {
        setRect(null)
        return
      }

      const box = element.getBoundingClientRect()
      const outsideViewport = box.bottom < 8 || box.top > viewport.height - 8

      if (outsideViewport) {
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
        scrollTimer = window.setTimeout(update, 350)
        return
      }

      const padding = isMobile ? 5 : 7
      const left = Math.max(8, box.left - padding)
      const maxWidth = Math.max(0, viewport.width - left - 8)

      setRect({
        top: Math.max(8, box.top - padding),
        left,
        width: Math.min(maxWidth, box.width + padding * 2),
        height: box.height + padding * 2,
      })
    }

    update()
    timer = window.setTimeout(update, 250)
    window.addEventListener("scroll", update, true)

    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(scrollTimer)
      window.removeEventListener("scroll", update, true)
    }
  }, [isMobile, step.selector, viewport.height, viewport.width, visible])

  const tooltip = useMemo(() => {
    const width = Math.min(360, Math.max(0, viewport.width - 24))
    const targetCenter = rect ? rect.left + rect.width / 2 : viewport.width / 2
    const left = Math.max(12, Math.min(viewport.width - width - 12, targetCenter - width / 2))
    const placeBelow = !rect || rect.top + rect.height + 190 < viewport.height
    const top = rect
      ? placeBelow
        ? rect.top + rect.height + 18
        : Math.max(12, rect.top - 180)
      : Math.max(80, viewport.height / 3)

    return { width, left, top, targetCenter, placeBelow }
  }, [rect, viewport.height, viewport.width])

  if (!visible) return null

  const advance = () => setStepIndex((current) => {
    const next = current + 1
    if (next >= STEPS.length) {
      try { localStorage.setItem("petalertph:mini-guide-complete", "1") } catch {}
    }
    return next
  })

  return (
    <div
      className="fixed inset-0 z-[300] cursor-pointer overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`${step.title}. Tap anywhere to continue.`}
      onClick={advance}
    >
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl border-2 border-white bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.72)] transition-all duration-300"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/70" />
      )}

      <div
        className={
          isMobile
            ? "pointer-events-none fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] max-h-[46dvh] overflow-y-auto rounded-2xl border bg-card p-4 text-card-foreground shadow-2xl"
            : "pointer-events-none fixed rounded-2xl border bg-card p-5 text-card-foreground shadow-2xl"
        }
        style={isMobile ? undefined : { top: tooltip.top, left: tooltip.left, width: tooltip.width }}
      >
        {!isMobile && rect && (
          <div
            className={`absolute size-4 rotate-45 border bg-card ${
              tooltip.placeBelow ? "-top-2 border-b-0 border-r-0" : "-bottom-2 border-l-0 border-t-0"
            }`}
            style={{
              left: Math.max(24, Math.min(tooltip.width - 32, tooltip.targetCenter - tooltip.left - 8)),
            }}
          />
        )}

        <div className="relative flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground sm:size-11">
            {step.icon === "scan" ? <BrainCircuit className="size-5 sm:size-6" /> : step.icon === "report" ? <Plus className="size-5 sm:size-6" /> : <Eye className="size-5 sm:size-6" />}
          </div>
          <div className="min-w-0">
            <p className="font-serif text-base font-extrabold sm:text-lg">{step.title}</p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground sm:leading-6">{step.description}</p>
          </div>
        </div>

        <div className="relative mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground sm:mt-4 sm:text-xs">
          <span className="shrink-0">{stepIndex + 1} of {STEPS.length}</span>
          <span className="text-right font-medium text-foreground">{stepIndex === STEPS.length - 1 ? "Tap to finish" : "Tap anywhere to continue"}</span>
        </div>
      </div>
    </div>
  )
}
