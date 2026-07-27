"use client"

import { useEffect, useMemo } from "react"
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import type { MissingDog, Sighting } from "@/lib/types"
import "leaflet/dist/leaflet.css"

function pinIcon(kind: "dog" | "sighting", active = false) {
  const color = kind === "sighting" ? "#16a34a" : active ? "#ea580c" : "#78716c"
  const glyph = kind === "sighting"
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="white" stroke-width="2"/>'
    : '<circle cx="5.5" cy="9" r="2"/><circle cx="9.5" cy="5.5" r="2"/><circle cx="14.5" cy="5.5" r="2"/><circle cx="18.5" cy="9" r="2"/><path d="M12 11c-2.5 0-5 2.2-5 4.6 0 1.9 1.5 2.9 3.2 2.9.9 0 1.3-.3 1.8-.3s.9.3 1.8.3c1.7 0 3.2-1 3.2-2.9C17 13.2 14.5 11 12 11z"/>'
  return L.divIcon({
    html: `<div style="position:relative;transform:translate(-50%,-100%);"><div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};box-shadow:0 3px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;border:2px solid white;"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="white" style="transform:rotate(45deg);">${glyph}</svg></div></div>`,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [0, 0],
  })
}

function ClickHandler({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick?.(e.latlng.lat, e.latlng.lng) } })
  return null
}

function Recenter({ center, trigger }: { center: [number, number]; trigger: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo(center, Math.max(map.getZoom(), 13), { duration: 0.8 }) }, [center, trigger, map])
  return null
}

type Props = {
  dogs: MissingDog[]
  sightings?: Sighting[]
  selectedId: string | null
  onSelect: (dog: MissingDog) => void
  onSelectSighting?: (sighting: Sighting) => void
  center: [number, number]
  recenterTrigger: number
  pickMode?: boolean
  pickedPoint?: [number, number] | null
  pickKind?: "dog" | "sighting"
  onPick?: (lat: number, lng: number) => void
}

export default function DogMap({ dogs, sightings = [], selectedId, onSelect, onSelectSighting, center, recenterTrigger, pickMode, pickedPoint, pickKind = "dog", onPick }: Props) {
  const dogMarkers = useMemo(() => dogs.map((dog) => (
    <Marker key={`dog-${dog.id}`} position={[dog.latitude, dog.longitude]} icon={pinIcon("dog", dog.id === selectedId || !selectedId)} eventHandlers={{ click: () => onSelect(dog) }} />
  )), [dogs, selectedId, onSelect])

  const sightingMarkers = useMemo(() => sightings.map((sighting) => (
    <Marker key={`sighting-${sighting.id}`} position={[sighting.latitude, sighting.longitude]} icon={pinIcon("sighting", true)} eventHandlers={{ click: () => onSelectSighting?.(sighting) }} />
  )), [sightings, onSelectSighting])

  return <MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full" style={{ background: "oklch(0.95 0.015 75)", zIndex: 0 }}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
    {dogMarkers}{sightingMarkers}
    {pickMode && pickedPoint && <Marker position={pickedPoint} icon={pinIcon(pickKind, true)} />}
    <ClickHandler onPick={pickMode ? onPick : undefined} />
    <Recenter center={center} trigger={recenterTrigger} />
  </MapContainer>
}
