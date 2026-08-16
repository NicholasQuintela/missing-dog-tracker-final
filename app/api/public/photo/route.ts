import { unstable_cache } from "next/cache"
import { NextRequest } from "next/server"

const PHOTO_CDN_TTL_SECONDS = 60 * 60 * 24 * 30

function safeStoragePath(path: string) {
  if (!path || path.length > 1024 || path.startsWith("/")) return null
  const segments = path.split("/")
  if (segments.some((part) => !part || part === "." || part === "..")) return null
  return segments.map(encodeURIComponent).join("/")
}

async function recordOriginFetch(base: string, photoPath: string, bytes: number, ok: boolean) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return
  try {
    await fetch(`${base}/rest/v1/rpc/record_pet_alert_photo_origin_fetch`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ p_path: photoPath, p_bytes: bytes, p_ok: ok }),
    })
  } catch {
    // Diagnostics must never break photo delivery.
  }
}

type CachedPhoto = {
  bodyBase64: string
  contentType: string
  bytes: number
}

// Second shield underneath Vercel's CDN. The cache key includes the photo path
// argument, so each Storage object is cached independently for 30 days.
// IMPORTANT: recordOriginFetch lives INSIDE this function. Therefore it runs only
// when this Runtime/Data Cache entry is actually missing and Supabase is contacted.
const getRuntimeCachedPhoto = unstable_cache(
  async (rawPath: string, encodedPath: string): Promise<CachedPhoto> => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!base) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")

    const upstream = await fetch(
      `${base}/storage/v1/object/public/dog-photos/${encodedPath}`,
      { cache: "no-store" },
    )

    if (!upstream.ok || !upstream.body) {
      await recordOriginFetch(base, rawPath, 0, false)
      throw new Error(`Supabase photo fetch failed: ${upstream.status}`)
    }

    const body = await upstream.arrayBuffer()
    const bytes = body.byteLength
    await recordOriginFetch(base, rawPath, bytes, true)

    return {
      bodyBase64: Buffer.from(body).toString("base64"),
      contentType: upstream.headers.get("content-type") || "image/webp",
      bytes,
    }
  },
  ["petalert-public-photo-v5"],
  {
    revalidate: PHOTO_CDN_TTL_SECONDS,
    tags: ["petalert-public-photos"],
  },
)

export async function GET(request: NextRequest) {
  const rawPath = request.nextUrl.searchParams.get("path") || ""
  const path = safeStoragePath(rawPath)
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!path || !base) {
    return new Response("Invalid photo path", { status: 400, headers: { "Cache-Control": "no-store" } })
  }

  try {
    // Layer 1: Vercel CDN can satisfy the request before this route executes.
    // Layer 2: if the route executes, Runtime/Data Cache is checked here before
    // Supabase Storage is contacted.
    const photo = await getRuntimeCachedPhoto(rawPath, path)
    const body = Buffer.from(photo.bodyBase64, "base64")

    const ttl = PHOTO_CDN_TTL_SECONDS.toString()
    const headers = new Headers()
    headers.set("Content-Type", photo.contentType)
    headers.set("Content-Length", String(photo.bytes))
    headers.set("Cache-Control", `public, max-age=0, s-maxage=${ttl}, must-revalidate`)
    headers.set("CDN-Cache-Control", `public, max-age=${ttl}`)
    headers.set("Vercel-CDN-Cache-Control", `public, max-age=${ttl}`)
    headers.set("Vercel-Cache-Tag", "petalert-public-photos")
    headers.set("X-PetAlert-Cache-Architecture", "cdn+runtime-v5")

    return new Response(body, { status: 200, headers })
  } catch (error) {
    console.error("Public photo proxy failed", error)
    return new Response("Unable to load photo", { status: 502, headers: { "Cache-Control": "no-store" } })
  }
}
