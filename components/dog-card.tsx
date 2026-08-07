"use client"

import { MapPin, Gift, Users, CheckCircle2 } from "lucide-react"
import type { MissingDog } from "@/lib/types"
import { formatReward } from "@/lib/currency"
import { cn } from "@/lib/utils"

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

type Props = {
  dog: MissingDog
  volunteerCount: number
  selected: boolean
  onClick: () => void
}

export function DogCard({ dog, volunteerCount, selected, onClick }: Props) {
  const isFound = dog.status === "found"
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full gap-3 rounded-2xl border bg-card p-3 text-left transition-all hover:border-primary/50 hover:shadow-md",
        selected ? "border-primary ring-2 ring-primary/30 shadow-md" : "border-border",
      )}
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
        {dog.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy"
            decoding="async"
            src={dog.photo_url || "/placeholder.svg"}
            alt={`Photo of ${dog.name}`}
            className={cn("h-full w-full object-cover", isFound && "opacity-70")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <MapPin className="size-6" />
          </div>
        )}
        {isFound && (
          <div className="absolute inset-0 flex items-center justify-center bg-accent/60">
            <CheckCircle2 className="size-7 text-accent-foreground" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate font-serif text-base font-extrabold text-foreground">{dog.name}</h3>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(dog.created_at)}</span>
        </div>
        {dog.breed_details && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground text-pretty">{dog.breed_details}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1.5">
          {dog.reward > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              <Gift className="size-3" />{formatReward(dog.reward, dog.reward_currency)} reward
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
            <Users className="size-3" />
            {volunteerCount} helping
          </span>
        </div>
      </div>
    </button>
  )
}
