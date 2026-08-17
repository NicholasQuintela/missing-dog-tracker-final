import { createHash, createHmac } from "node:crypto"
import { unstable_cache } from "next/cache"

const SUPABASE_BUCKET = "dog-photos"
const R2_BUCKET = process.env.R2_BUCKET || "dog-photos"

// Operation R2: one canonical object path is shared by browser/CDN/Data Cache,
// R2, and the Supabase fallback. Old and new URL encodings therefore cannot
// create different origin identities for the same photo.
const PHOTO_CACHE_NAMESPACE = "petalert-photo-object-r2-v6.3.1"
const PHOTO_CACHE_TAG = "petalert-public-photos-r2-v6.3.1"

export type DeliveredPhoto = {
  bodyBase64: string
  contentType: string
  bytes: number
  originFetchedAt: string
  origin: "r2" | "supabase"
}

export function canonicalizePhotoPath(input: string) {
  if (!input || input.length > 4096) return null

  let value = input
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

function sha256Hex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest()
}

function r2Configured() {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  )
}

/**
 * Private Cloudflare R2 GET using its S3-compatible API.
 * Native Node crypto is used so Operation R2 adds no new npm dependency.
 */
async function fetchPhotoFromR2(canonicalPath: string): Promise<DeliveredPhoto | null> {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!endpoint || !accessKeyId || !secretAccessKey) return null

  const base = new URL(endpoint)
  const encodedPath = encodeStoragePath(canonicalPath)
  const bucket = encodeURIComponent(R2_BUCKET)
  const canonicalUri = `${base.pathname.replace(/\/$/, "")}/${bucket}/${encodedPath}`.replace(/\/+/g, "/")
  const requestUrl = new URL(base.toString())
  requestUrl.pathname = canonicalUri
  requestUrl.search = ""

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
  const dateStamp = amzDate.slice(0, 8)
  const region = "auto"
  const service = "s3"
  const payloadHash = sha256Hex("")
  const host = requestUrl.host

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date"
  const canonicalRequest = [
    "GET",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n")

  const algorithm = "AWS4-HMAC-SHA256"
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n")

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, "aws4_request")
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex")

  const authorization =
    `${algorithm} Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: authorization,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
      },
    })

    if (response.status === 404) {
      console.log("[PETALERT_R2_MISS]", canonicalPath)
      return null
    }

    if (!response.ok) {
      console.warn("[PETALERT_R2_ERROR]", canonicalPath, response.status)
      return null
    }

    const buffer = await response.arrayBuffer()
    const originFetchedAt = new Date().toISOString()

    console.log("[PETALERT_R2_HIT]", canonicalPath, buffer.byteLength)

    return {
      bodyBase64: Buffer.from(buffer).toString("base64"),
      contentType: response.headers.get("content-type") || "image/webp",
      bytes: buffer.byteLength,
      originFetchedAt,
      origin: "r2",
    }
  } catch (error) {
    console.warn("[PETALERT_R2_ERROR]", canonicalPath, error)
    return null
  }
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
    // Diagnostics must never block photo delivery.
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
    // Cache diagnostics are best-effort.
  }
}

async function fetchPhotoFromSupabase(canonicalPath: string): Promise<DeliveredPhoto> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")

  console.log("[PETALERT_SUPABASE_ORIGIN_EXECUTED]", canonicalPath, new Date().toISOString())

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
    origin: "supabase",
  }
}

/**
 * Operation R2 origin order:
 *   1) private Cloudflare R2 dog-photos
 *   2) Supabase dog-photos fallback
 *
 * Supabase remains untouched, so any object missing from R2 still works.
 */
async function fetchCanonicalPhotoFromOrigin(canonicalPath: string): Promise<DeliveredPhoto> {
  if (r2Configured()) {
    const r2Photo = await fetchPhotoFromR2(canonicalPath)
    if (r2Photo) return r2Photo
  }

  return fetchPhotoFromSupabase(canonicalPath)
}

const getCachedCanonicalPhoto = unstable_cache(
  fetchCanonicalPhotoFromOrigin,
  [PHOTO_CACHE_NAMESPACE],
  {
    revalidate: false,
    tags: [PHOTO_CACHE_TAG],
  },
)

export async function getPublicPhoto(canonicalPath: string) {
  return getCachedCanonicalPhoto(canonicalPath)
}
