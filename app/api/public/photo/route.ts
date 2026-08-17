import { NextRequest } from "next/server"
import { canonicalizePhotoPath, getPublicPhoto, recordPhotoRouteExecution } from "@/lib/photo-delivery-server"

// Browser cache: 30 days. Vercel CDN: 1 year.
// UUID/versioned Storage objects are immutable. New uploads get new paths.
const BROWSER_TTL = 60 * 60 * 24 * 30
const VERCEL_CDN_TTL = 60 * 60 * 24 * 365

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function errorResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET(request: NextRequest) {
  const requestedPath = request.nextUrl.searchParams.get("path") || ""
  const canonicalPath = canonicalizePhotoPath(requestedPath)

  if (!canonicalPath || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return errorResponse("Invalid photo path", 400)
  }

  try {
    // Layer 1: browser/PWA cache.
    // Layer 2: Vercel CDN response cache.
    // Layer 3: canonical Next.js Data Cache keyed ONLY by canonicalPath.
    // Layer 4: Supabase, reached only on a true canonical Data Cache miss.
    const photo = await getPublicPhoto(canonicalPath)
    const body = Buffer.from(photo.bodyBase64, "base64")

    // If the cached object's origin timestamp is only a few seconds old, this
    // invocation populated the Data Cache. Otherwise the CDN missed but the
    // Data Cache rescued the request without touching Supabase.
    const originAgeMs = Date.now() - new Date(photo.originFetchedAt).getTime()
    const dataCacheHit = Number.isFinite(originAgeMs) && originAgeMs > 10_000

    await recordPhotoRouteExecution(
      canonicalPath,
      photo.bytes,
      photo.originFetchedAt,
      dataCacheHit,
    )

    console.log(
      "[PETALERT_CACHE_ROUTE]",
      dataCacheHit ? "DATA_HIT" : "DATA_MISS",
      canonicalPath,
      process.env.VERCEL_REGION || "unknown",
      photo.originFetchedAt,
    )

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": photo.contentType,
        "Content-Length": String(photo.bytes),
        "Cache-Control": `public, max-age=${BROWSER_TTL}, immutable`,
        "CDN-Cache-Control": `public, max-age=${VERCEL_CDN_TTL}`,
        "Vercel-CDN-Cache-Control": `public, max-age=${VERCEL_CDN_TTL}`,
        "Vercel-Cache-Tag": "petalert-public-photos-v6.3",
        "X-PetAlert-Cache-Architecture": "canonical-browser30d+vercel365d+data-indefinite+diagnostics-v6.3",
        "X-PetAlert-Data-Cache": dataCacheHit ? "HIT" : "MISS",
        "X-PetAlert-Origin-Fetched-At": photo.originFetchedAt,
        "X-PetAlert-Function-Region": process.env.VERCEL_REGION || "unknown",
      },
    })
  } catch (error) {
    console.error("Public photo delivery failed", error)
    return errorResponse("Unable to load photo", 502)
  }
}
