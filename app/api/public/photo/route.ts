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

export async function GET(request: NextRequest) {
  const rawPath = request.nextUrl.searchParams.get("path") || ""
  const path = safeStoragePath(rawPath)
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!path || !base) {
    return new Response("Invalid photo path", { status: 400, headers: { "Cache-Control": "no-store" } })
  }

  try {
    // IMPORTANT: this route should execute for a photo only when Vercel CDN does not
    // already have that exact /api/public/photo?path=... response.
    const upstream = await fetch(`${base}/storage/v1/object/public/dog-photos/${path}`, { cache: "no-store" })

    if (!upstream.ok || !upstream.body) {
      await recordOriginFetch(base, rawPath, 0, false)
      return new Response("Photo not found", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "Cache-Control": "no-store" },
      })
    }

    // Buffer only on a genuine origin miss so the dashboard can measure exact bytes
    // Supabase returned to Vercel. CDN HITs never execute this code.
    const body = await upstream.arrayBuffer()
    const bytes = body.byteLength
    await recordOriginFetch(base, rawPath, bytes, true)

    const ttl = PHOTO_CDN_TTL_SECONDS.toString()
    const headers = new Headers()
    headers.set("Content-Type", upstream.headers.get("content-type") || "image/webp")
    headers.set("Content-Length", String(bytes))
    headers.set("Cache-Control", `public, max-age=0, s-maxage=${ttl}, must-revalidate`)
    headers.set("CDN-Cache-Control", `public, max-age=${ttl}`)
    headers.set("Vercel-CDN-Cache-Control", `public, max-age=${ttl}`)
    headers.set("Vercel-Cache-Tag", "petalert-public-photos")

    return new Response(body, { status: 200, headers })
  } catch (error) {
    console.error("Public photo proxy failed", error)
    if (base) await recordOriginFetch(base, rawPath, 0, false)
    return new Response("Unable to load photo", { status: 502, headers: { "Cache-Control": "no-store" } })
  }
}
