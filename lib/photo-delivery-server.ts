import { cacheLife, cacheTag } from "next/cache"

const SUPABASE_BUCKET = "dog-photos"

// v6.1: every logical Storage object gets ONE canonical server-cache identity.
// This protects Supabase even if equivalent browser/CDN URLs differ in encoding.
const PHOTO_CACHE_TAG = "petalert-public-photos-v6.4"

export type DeliveredPhoto = {
  bodyBase64: string
  contentType: string
  bytes: number
  originFetchedAt: string
}

/**
 * Convert every equivalent representation of a Storage object path into one
 * canonical path. Important examples that collapse to the same identity:
 *   reports/a/photo.webp
 *   reports%2Fa%2Fphoto.webp
 *   reports%252Fa%252Fphoto.webp
 *
 * Storage paths remain case-sensitive. We only normalize encoding, slash
 * structure and Unicode representation; we never lowercase object names.
 */
export function canonicalizePhotoPath(input: string) {
  if (!input || input.length > 4096) return null

  let value = input

  // URLSearchParams already decodes one layer. A legacy caller can still hand
  // us another encoded layer, so collapse a few safe layers until stable.
  for (let i = 0; i < 3; i += 1) {
    const decoded = decodeSafe(value)
    if (decoded === value) break
    value = decoded
  }

  value = value.normalize("NFC")

  if (!value || value.length > 1024) return null
  if (value.startsWith("/") || value.endsWith("/") || value.includes("\\")) return null

  const segments = value.split("/")
  if (segments.some((part) => !part || part === "." || part === "..")) return null

  return segments.join("/")
}

function decodeSafe(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function encodeStoragePath(canonicalPath: string) {
  return canonicalPath.split("/").map(encodeURIComponent).join("/")
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
    // Diagnostics are best-effort and must never block photo delivery.
  }
}

export async function recordPhotoRouteExecution(
  photoPath: string,
  bytes: number,
  originFetchedAt: string,
  dataCacheHit: boolean,
) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !serviceKey) return

  try {
    await fetch(`${base}/rest/v1/rpc/record_pet_alert_photo_route_execution`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        p_path: photoPath,
        p_bytes: Math.max(0, bytes),
        p_origin_fetched_at: originFetchedAt,
        p_data_cache_hit: dataCacheHit,
        p_vercel_region: process.env.VERCEL_REGION || null,
        p_deployment_id: process.env.VERCEL_DEPLOYMENT_ID || null,
      }),
    })
  } catch {
    // Cache diagnostics are best-effort and must never block photo delivery.
  }
}

/**
 * The ONLY function allowed to download a public pet photo from Supabase.
 * It receives exactly one argument: the canonical Storage object path.
 * That same canonical path is also the only variable part of the Data Cache
 * key, so different URL encodings can no longer create different origin keys.
 */
async function fetchCanonicalPhotoFromOrigin(canonicalPath: string): Promise<DeliveredPhoto> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")

  console.log(
    "[PETALERT_ORIGIN_EXECUTED]",
    canonicalPath,
    new Date().toISOString(),
  )

  const encodedPath = encodeStoragePath(canonicalPath)
  const response = await fetch(
    `${base}/storage/v1/object/public/${SUPABASE_BUCKET}/${encodedPath}`,
    { cache: "no-store" },
  )

  if (!response.ok || !response.body) {
    await recordOriginFetch(base, canonicalPath, 0, false)
    throw new Error(`Supabase photo fetch failed: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const bytes = buffer.byteLength
  const originFetchedAt = new Date().toISOString()
  await recordOriginFetch(base, canonicalPath, bytes, true)

  return {
    bodyBase64: Buffer.from(buffer).toString("base64"),
    contentType: response.headers.get("content-type") || "image/webp",
    bytes,
    originFetchedAt,
  }
}

// v6.4: one authoritative Runtime Cache entry per canonical Storage path.
// Next.js 16 `use cache` keys the result by the function arguments, so the
// canonicalPath remains the photo identity. `max` is appropriate because
// uploaded photo object paths are immutable: replacements get a new UUID/path.
async function getCachedCanonicalPhoto(canonicalPath: string): Promise<DeliveredPhoto> {
  "use cache"
  cacheLife("max")
  cacheTag(PHOTO_CACHE_TAG)
  return fetchCanonicalPhotoFromOrigin(canonicalPath)
}

export async function getPublicPhoto(canonicalPath: string) {
  return getCachedCanonicalPhoto(canonicalPath)
}
