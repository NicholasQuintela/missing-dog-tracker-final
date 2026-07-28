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

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "Location permission is blocked. Allow location access in your browser settings, then try again."
  if (error.code === error.POSITION_UNAVAILABLE) return "Your device could not determine its location. Turn on GPS or Location Services and try again."
  if (error.code === error.TIMEOUT) return "Finding your location took too long. Move near a window or try again with GPS enabled."
  return "Could not get your location. Check your device and browser location settings."
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
  const [followLive, setFollowLive] = useState(true)
  const [privatePosition, setPrivatePosition] = useState<[number, number] | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>(point)
  const [recenterTrigger, setRecenterTrigger] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  function updateAddress(field: keyof AddressFields, value: string) {
    onAddressChange({ ...address, [field]: value })
  }

  function centerMap(next: [number, number]) {
    setMapCenter(next)
    setRecenterTrigger((value) => value + 1)
  }

  function applyPrivatePosition(position: GeolocationPosition, alsoSelectReportPin: boolean) {
    const next: [number, number] = [position.coords.latitude, position.coords.longitude]
    setPrivatePosition(next)
    setAccuracy(position.coords.accuracy)
    centerMap(next)
    if (alsoSelectReportPin) onPointChange(next)
    setMessage(`Location found. Accuracy is approximately ${Math.round(position.coords.accuracy)} metres.`)
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
      const next: [number, number] = [payload.lat, payload.lng]
      onPointChange(next)
      centerMap(next)
      setMessage(payload.display_name ? `Pin placed near: ${payload.display_name}` : "Pin placed from the address.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not search this address.")
    } finally {
      setSearching(false)
    }
  }

  function requestOneTimeLocation(highAccuracy = true) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyPrivatePosition(position, true)
        setGeoLoading(false)
      },
      (error) => {
        if (highAccuracy && error.code !== error.PERMISSION_DENIED) {
          setMessage("High-accuracy GPS was unavailable. Trying a faster location method…")
          requestOneTimeLocation(false)
          return
        }
        setMessage(geolocationErrorMessage(error))
        setGeoLoading(false)
      },
      { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 12000 : 20000, maximumAge: highAccuracy ? 0 : 60000 },
    )
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Location access is not supported by this browser.")
      return
    }
    setGeoLoading(true)
    setMessage("Getting your location…")
    requestOneTimeLocation(true)
  }

  function startLiveLocation() {
    if (!navigator.geolocation) {
      setMessage("Location access is not supported by this browser.")
      return
    }
    if (watchId.current !== null) {
      setFollowLive(true)
      if (privatePosition) centerMap(privatePosition)
      return
    }

    setLive(true)
    setFollowLive(true)
    setGeoLoading(true)
    setMessage("Starting private live location…")
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const next: [number, number] = [position.coords.latitude, position.coords.longitude]
        setPrivatePosition(next)
        setAccuracy(position.coords.accuracy)
        if (followLive) centerMap(next)
        setGeoLoading(false)
        setMessage(`Live location is active. Accuracy is approximately ${Math.round(position.coords.accuracy)} metres.`)
      },
      (error) => {
        setMessage(geolocationErrorMessage(error))
        setGeoLoading(false)
        stopLiveLocation()
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    )
  }

  function stopLiveLocation() {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setLive(false)
    setFollowLive(false)
    setGeoLoading(false)
  }

  function useBlueLocation() {
    if (!privatePosition) return
    onPointChange(privatePosition)
    centerMap(privatePosition)
    setMessage("The report pin now uses your current location.")
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
            {geoLoading && !live ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
            Locate me
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
            <>
              <Button type="button" variant="outline" onClick={() => { setFollowLive(true); centerMap(privatePosition) }}>
                <Crosshair className="size-4" /> Center on me
              </Button>
              <Button type="button" onClick={useBlueLocation}>
                <MapPin className="size-4" /> Use this location for report
              </Button>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          The blue marker and accuracy circle are visible only on your device. They are never uploaded or shared unless you choose “Use this location for report.”
        </p>

        <div className="h-56 overflow-hidden rounded-xl border border-border">
          <DogMap
            key={mapKey}
            dogs={[]}
            sightings={[]}
            selectedId={null}
            onSelect={() => {}}
            center={mapCenter}
            recenterTrigger={recenterTrigger}
            recenterZoom={17}
            pickMode
            pickKind={kind}
            pickedPoint={point}
            privateUserPoint={privatePosition}
            privateUserAccuracy={accuracy}
            onPick={(lat, lng) => {
              onPointChange([lat, lng])
              setFollowLive(false)
            }}
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
