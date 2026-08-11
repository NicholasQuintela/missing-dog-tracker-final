import { NextRequest } from "next/server"

function safeStoragePath(path: string) {
  if (!path || path.length > 1024 || path.startsWith("/")) return null
  const segments = path.split("/")
  if (segments.some((part) => !part || part === "." || part === "..")) return null
  return segments.map(encodeURIComponent).join("/")
}

export async function GET(request: NextRequest) {
  const rawPath = request.nextUrl.searchParams.get("path") || ""
  const path = safeStoragePath(rawPath)
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!path || !base) return new Response("Invalid photo path", { status: 400, headers: { "Cache-Control": "no-store" } })

  try {
    const upstream = await fetch(`${base}/storage/v1/object/public/dog-photos/${path}`, { cache: "no-store" })
    if (!upstream.ok || !upstream.body) {
      return new Response("Photo not found", { status: upstream.status === 404 ? 404 : 502, headers: { "Cache-Control": "no-store" } })
    }

    const headers = new Headers()
    headers.set("Content-Type", upstream.headers.get("content-type") || "image/webp")
    headers.set("Cache-Control", "public, max-age=0, must-revalidate")
    headers.set("CDN-Cache-Control", "public, max-age=300")
    headers.set("Vercel-CDN-Cache-Control", "public, max-age=300")
    headers.set("Vercel-Cache-Tag", "petalert-public-photos")
    const contentLength = upstream.headers.get("content-length")
    if (contentLength) headers.set("Content-Length", contentLength)

    return new Response(upstream.body, { status: 200, headers })
  } catch (error) {
    console.error("Public photo proxy failed", error)
    return new Response("Unable to load photo", { status: 502, headers: { "Cache-Control": "no-store" } })
  }
}
