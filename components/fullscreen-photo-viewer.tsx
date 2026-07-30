"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

type Props = {
  open: boolean
  src: string
  alt: string
  onClose: () => void
}

export function FullscreenPhotoViewer({ open, src, alt, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKey)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex cursor-zoom-out items-center justify-center bg-black/95 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Full-size pet photo"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close full-size photo"
        className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 sm:right-5 sm:top-5"
        onClick={onClose}
      >
        <X className="size-6" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full cursor-default object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  )
}
