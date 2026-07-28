"use client"

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

const COLLAPSED = 34
const HALF = 56
const EXPANDED = 82

function nearestSnap(value: number) {
  return [COLLAPSED, HALF, EXPANDED].reduce((best, current) =>
    Math.abs(current - value) < Math.abs(best - value) ? current : best,
  )
}

export function MobileReportSheet({ children }: { children: ReactNode }) {
  const [height, setHeight] = useState(HALF)
  const startY = useRef(0)
  const startHeight = useRef(HALF)
  const dragging = useRef(false)

  useEffect(() => {
    const onResize = () => setHeight((value) => Math.min(EXPANDED, Math.max(COLLAPSED, value)))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragging.current = true
    startY.current = event.clientY
    startHeight.current = height
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    const delta = startY.current - event.clientY
    const next = startHeight.current + (delta / window.innerHeight) * 100
    setHeight(Math.min(EXPANDED, Math.max(COLLAPSED, next)))
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    dragging.current = false
    setHeight((value) => nearestSnap(value))
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function toggle() {
    setHeight((value) => value <= COLLAPSED + 4 ? HALF : value >= EXPANDED - 4 ? HALF : EXPANDED)
  }

  return (
    <section
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[1.75rem] border-t bg-background shadow-[0_-12px_35px_rgba(0,0,0,0.18)] transition-[height] duration-200 md:hidden"
      style={{ height: `${height}dvh`, paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Reports panel"
    >
      <div
        className="shrink-0 touch-none select-none px-4 pb-2 pt-2"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <button type="button" onClick={toggle} className="mx-auto flex w-full flex-col items-center gap-1" aria-label="Resize reports panel">
          <span className="h-1.5 w-12 rounded-full bg-muted-foreground/35" />
          <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            {height < HALF ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            Drag to show {height < HALF ? "more reports" : "more map"}
          </span>
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}
