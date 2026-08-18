import { createHash, createHmac } from "node:crypto"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { canonicalizePhotoPath } from "@/lib/photo-delivery-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = process.env.R2_BUCKET || "dog-photos"
const MAX_UPLOAD_BYTES = 200 * 1024
const ALLOWED_PREFIXES = new Set(["reports", "sightings", "found"])

const MOBILE_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
}

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  for (const [key, value] of Object.entries(MOBILE_CORS_HEADERS)) response.headers.set(key, value)
  return response
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS_HEADERS })
}

function sha256Hex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest()
}

function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/")
}

function getR2Config() {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("R2 is not configured.")
  return { endpoint, accessKeyId, secretAccessKey }
}

async function getAuthenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization")
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null
  if (!accessToken) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase authentication is not configured.")

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) return null
  return data.user
}

function validateOwnedPhotoPath(input: string, userId: string) {
  const path = canonicalizePhotoPath(input)
  if (!path) return null
  const parts = path.split("/")
  if (parts.length !== 3) return null
  if (!ALLOWED_PREFIXES.has(parts[0])) return null
  if (parts[1] !== userId) return null
  if (!/^[0-9a-f-]{36}\.webp$/i.test(parts[2])) return null
  return path
}

async function signedR2Request(method: "PUT" | "DELETE", canonicalPath: string, body?: Buffer) {
  const { endpoint, accessKeyId, secretAccessKey } = getR2Config()
  const base = new URL(endpoint)
  const encodedPath = encodeStoragePath(canonicalPath)
  const bucket = encodeURIComponent(BUCKET)
  const canonicalUri = `${base.pathname.replace(/\/$/, "")}/${bucket}/${encodedPath}`.replace(/\/+/g, "/")
  const requestUrl = new URL(base.toString())
  requestUrl.pathname = canonicalUri
  requestUrl.search = ""

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(body || "")
  const host = requestUrl.host
  const contentType = method === "PUT" ? "image/webp" : null

  // SigV4 requires CanonicalHeaders and SignedHeaders to be sorted by
  // lowercase header name. We intentionally sign only the required stable
  // S3 headers here; Content-Type is still sent on PUT, but does not need
  // to participate in the signature. This keeps PUT/DELETE signing aligned
  // with the already-working R2 GET signer.
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date"

  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n")
  const algorithm = "AWS4-HMAC-SHA256"
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`
  const stringToSign = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n")

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, "auto")
  const kService = hmac(kRegion, "s3")
  const kSigning = hmac(kService, "aws4_request")
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex")
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const headers: Record<string, string> = {
    Authorization: authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  }
  if (contentType) headers["Content-Type"] = contentType

  return fetch(requestUrl, {
    method,
    cache: "no-store",
    headers,
    body: method === "PUT" ? body : undefined,
  })
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return json({ error: "Please log in before uploading a photo." }, { status: 401 })

    const form = await request.formData()
    const file = form.get("file")
    const requestedPath = String(form.get("path") || "")
    const path = validateOwnedPhotoPath(requestedPath, user.id)

    if (!path) return json({ error: "Invalid photo path." }, { status: 400 })
    if (!(file instanceof File)) return json({ error: "Photo file is required." }, { status: 400 })
    if (file.type !== "image/webp") return json({ error: "Only optimized WebP uploads are accepted." }, { status: 415 })
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return json({ error: "Optimized photo must be 200 KB or smaller." }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const response = await signedR2Request("PUT", path, buffer)
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      console.error("[PETALERT_R2_UPLOAD_ERROR]", response.status, path, detail.slice(0, 500))
      return json({ error: "R2 photo upload failed." }, { status: 502 })
    }

    console.log("[PETALERT_R2_UPLOAD_OK]", path, buffer.byteLength)
    const publicPhotoUrl = `${new URL(request.url).origin}/api/public/photo?path=${encodeURIComponent(path)}`
    return json({ ok: true, path, photoUrl: publicPhotoUrl })
  } catch (error) {
    console.error("[PETALERT_R2_UPLOAD_ERROR]", error)
    return json({ error: "Unable to upload the photo right now." }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return json({ error: "Please log in before deleting a photo." }, { status: 401 })

    const body = (await request.json()) as { path?: string }
    const path = validateOwnedPhotoPath(body.path || "", user.id)
    if (!path) return json({ error: "Invalid photo path." }, { status: 400 })

    const response = await signedR2Request("DELETE", path)
    if (!response.ok && response.status !== 404) {
      console.error("[PETALERT_R2_DELETE_ERROR]", response.status, path)
      return json({ error: "R2 photo deletion failed." }, { status: 502 })
    }

    console.log("[PETALERT_R2_DELETE_OK]", path)
    return json({ ok: true })
  } catch (error) {
    console.error("[PETALERT_R2_DELETE_ERROR]", error)
    return json({ error: "Unable to delete the photo right now." }, { status: 500 })
  }
}
