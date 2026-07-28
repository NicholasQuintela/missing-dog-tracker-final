"use client"

import { useEffect, useState } from "react"
import { Eye, Plus } from "lucide-react"

type Rect = { top: number; left: number; width: number; height: number }

type Step = {
  selector: string
  title: string
  description: string
  icon: "report" | "sighting"
}

const STEPS: Step[] = [
  {
    selector: '[data-tour="report-missing"]',
    title: "Report your missing pet",
    description: "Tap this button to create a missing-pet report and place its location on the map.",
    icon: "report",
  },
  {
    selector: '[data-tour="report-sighting"]',
    title: "Report a sighting",
    description: "Tap this button when you see a pet that may be missing. Your sighting will appear as a green pin.",
    icon: "sighting",
  },
]

export function OnboardingTour() {
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const visible = stepIndex < STEPS.length
  const step = STEPS[stepIndex] ?? STEPS[STEPS.length - 1]

  useEffect(() => {
    if (!visible) return

    const update = () => {
      const element = document.querySelector(step.selector) as HTMLElement | null
      if (!element) {
        setRect(null)
        return
      }
      const box = element.getBoundingClientRect()
      const padding = 7
      setRect({
        top: Math.max(8, box.top - padding),
        left: Math.max(8, box.left - padding),
        width: Math.min(window.innerWidth - 16, box.width + padding * 2),
        height: box.height + padding * 2,
      })
    }

    update()
    const timer = window.setTimeout(update, 250)
    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
    }
  }, [step.selector, visible])

  if (!visible) return null

  const advance = () => setStepIndex((current) => current + 1)
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight
  const targetCenter = rect ? rect.left + rect.width / 2 : viewportWidth / 2
  const tooltipWidth = Math.min(360, viewportWidth - 32)
  const tooltipLeft = Math.max(16, Math.min(viewportWidth - tooltipWidth - 16, targetCenter - tooltipWidth / 2))
  const placeBelow = !rect || rect.top + rect.height + 190 < viewportHeight
  const tooltipTop = rect
    ? placeBelow
      ? rect.top + rect.height + 18
      : Math.max(16, rect.top - 180)
    : Math.max(100, viewportHeight / 3)

  return (
    <div
      className="fixed inset-0 z-[300] cursor-pointer"
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
        className="pointer-events-none fixed rounded-2xl border bg-card p-5 text-card-foreground shadow-2xl"
        style={{ top: tooltipTop, left: tooltipLeft, width: tooltipWidth }}
      >
        {rect && (
          <div
            className={`absolute size-4 rotate-45 border bg-card ${
              placeBelow ? "-top-2 border-b-0 border-r-0" : "-bottom-2 border-l-0 border-t-0"
            }`}
            style={{ left: Math.max(24, Math.min(tooltipWidth - 32, targetCenter - tooltipLeft - 8)) }}
          />
        )}
        <div className="relative flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {step.icon === "report" ? <Plus className="size-6" /> : <Eye className="size-6" />}
          </div>
          <div>
            <p className="font-serif text-lg font-extrabold">{step.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
          </div>
        </div>
        <div className="relative mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{stepIndex + 1} of {STEPS.length}</span>
          <span className="font-medium text-foreground">Tap anywhere to continue</span>
        </div>
      </div>
    </div>
  )
}
