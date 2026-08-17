import { NextRequest } from "next/server"
import { canonicalizePhotoPath, getPublicPhoto, recordPhotoRouteExecution } from "@/lib/photo-delivery-server"

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
    // Layer 1: browser/PWA cache
    // Layer 2: Vercel CDN
    // Layer 3: canonical Next.js Data Cache
    // Layer 4: private Cloudflare R2
    // Layer 5: Supabase fallback only when R2 is missing/unavailable
    const photo = await getPublicPhoto(canonicalPath)
    const body = Buffer.from(photo.bodyBase64, "base64")

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
      photo.origin.toUpperCase(),
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
        "Vercel-Cache-Tag": "petalert-public-photos-r2-v6.3.1",
        "X-PetAlert-Cache-Architecture": "browser30d+vercel365d+data+R2-first+supabase-fallback-v6.3.1",
        "X-PetAlert-Data-Cache": dataCacheHit ? "HIT" : "MISS",
        "X-PetAlert-Photo-Origin": photo.origin,
        "X-PetAlert-Origin-Fetched-At": photo.originFetchedAt,
        "X-PetAlert-Function-Region": process.env.VERCEL_REGION || "unknown",
      },
    })
  } catch (error) {
    console.error("Public photo delivery failed", error)
    return errorResponse("Unable to load photo", 502)
  }
}
