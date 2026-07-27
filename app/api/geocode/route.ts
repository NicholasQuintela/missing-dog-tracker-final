import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim()
  if (!query || query.length < 3 || query.length > 250) {
    return NextResponse.json({ error: "Enter a more complete address." }, { status: 400 })
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search")
    url.searchParams.set("q", query)
    url.searchParams.set("format", "jsonv2")
    url.searchParams.set("limit", "1")
    url.searchParams.set("countrycodes", "ph")
    url.searchParams.set("addressdetails", "1")

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Pet Alert PH/1.0 (support: quintelanicholas3@gmail.com)",
        Accept: "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) throw new Error("Address provider unavailable")
    const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>
    const first = results[0]
    if (!first) return NextResponse.json({ error: "No matching location was found." }, { status: 404 })

    return NextResponse.json({ lat: Number(first.lat), lng: Number(first.lon), display_name: first.display_name })
  } catch (error) {
    console.error("[Pet Alert PH] geocode error", error)
    return NextResponse.json({ error: "Address search is temporarily unavailable." }, { status: 502 })
  }
}
