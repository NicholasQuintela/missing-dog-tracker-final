"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Crosshair, Loader2, MapPin, Navigation, Search, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, inputClass } from "@/components/modal"

const DogMap = dynamic(() => import("@/components/dog-map"), { ssr: false })

export type AddressFields = {
  region: string
  city: string
  barangay: string
  street: string
}

type Props = {
  point: [number, number]
  onPointChange: (point: [number, number]) => void
  address: AddressFields
  onAddressChange: (address: AddressFields) => void
  kind?: "dog" | "sighting"
  mapKey?: string | number
  title?: string
  hint?: string
}

export function LocationPicker({
  point,
  onPointChange,
  address,
  onAddressChange,
  kind = "dog",
  mapKey = "location-picker",
  title = "Choose the location",
  hint = "Search an address, use your private current location, or tap the map.",
}: Props) {
  const [searching, setSearching] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [live, setLive] = useState(false)
  const [privatePosition, setPrivatePosition] = useState<[number, number] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  function updateAddress(field: keyof AddressFields, value: string) {
    onAddressChange({ ...address, [field]: value })
  }

  async function findAddress() {
    const query = [address.street, address.barangay, address.city, address.region, "Philippines"]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(", ")

    if (!query || query === "Philippines") {
      setMessage("Enter at least a city, barangay, street, or landmark.")
      return
    }

    setSearching(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
      const payload = (await response.json()) as { lat?: number; lng?: number; display_name?: string; error?: string }
      if (!response.ok || typeof payload.lat !== "number" || typeof payload.lng !== "number") {
        throw new Error(payload.error || "Location not found. Try adding a nearby landmark.")
      }
      onPointChange([payload.lat, payload.lng])
      setMessage(payload.display_name ? `Pin placed near: ${payload.display_name}` : "Pin placed from the address.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not search this address.")
    } finally {
      setSearching(false)
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Location access is not supported by this browser.")
      return
    }
    setGeoLoading(true)
    setMessage("Waiting for location permission…")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: [number, number] = [position.coords.latitude, position.coords.longitude]
        setPrivatePosition(next)
        onPointChange(next)
        setMessage(`Current location found (accuracy about ${Math.round(position.coords.accuracy)} m).`)
        setGeoLoading(false)
      },
      (error) => {
        setMessage(error.code === error.PERMISSION_DENIED ? "Location permission was denied." : "Could not get your current location.")
        setGeoLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
  }

  function startLiveLocation() {
    if (!navigator.geolocation) {
      setMessage("Location access is not supported by this browser.")
      return
    }
    if (watchId.current !== null) return
    setLive(true)
    setMessage("Live location is on. The blue marker is private and is not saved automatically.")
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setPrivatePosition([position.coords.latitude, position.coords.longitude])
      },
      () => {
        setMessage("Live location could not update. Check your device location settings.")
        stopLiveLocation()
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 10000 },
    )
  }

  function stopLiveLocation() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setLive(false)
  }

  return (
    <Field label={title} hint={hint}>
      <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className={inputClass} value={address.region} onChange={(e) => updateAddress("region", e.target.value)} placeholder="Region (e.g. NCR)" />
          <input className={inputClass} value={address.city} onChange={(e) => updateAddress("city", e.target.value)} placeholder="City / Municipality" />
          <input className={inputClass} value={address.barangay} onChange={(e) => updateAddress("barangay", e.target.value)} placeholder="Barangay" />
          <input className={inputClass} value={address.street} onChange={(e) => updateAddress("street", e.target.value)} placeholder="Street or landmark" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={findAddress} disabled={searching}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Find address
          </Button>
          <Button type="button" variant="outline" onClick={useCurrentLocation} disabled={geoLoading}>
            {geoLoading ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
            Use my location
          </Button>
          {!live ? (
            <Button type="button" variant="outline" onClick={startLiveLocation}>
              <Navigation className="size-4" /> Start private live location
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={stopLiveLocation}>
              <Square className="size-4" /> Stop live location
            </Button>
          )}
          {privatePosition && (
            <Button type="button" onClick={() => onPointChange(privatePosition)}>
              <MapPin className="size-4" /> Use blue location for report
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          The blue marker is visible only on your device. It is not uploaded or shared unless you press “Use blue location for report.”
        </p>

        <div className="h-56 overflow-hidden rounded-xl border border-border">
          <DogMap
            key={mapKey}
            dogs={[]}
            sightings={[]}
            selectedId={null}
            onSelect={() => {}}
            center={privatePosition || point}
            recenterTrigger={privatePosition ? privatePosition[0] + privatePosition[1] : point[0] + point[1]}
            pickMode
            pickKind={kind}
            pickedPoint={point}
            privateUserPoint={privatePosition}
            onPick={(lat, lng) => onPointChange([lat, lng])}
          />
        </div>

        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3" /> Selected report pin: {point[0].toFixed(5)}, {point[1].toFixed(5)}
        </p>
        {message && <p className="text-xs text-muted-foreground" role="status">{message}</p>}
      </div>
    </Field>
  )
}
