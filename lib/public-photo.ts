function decodeSafe(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Client-side mirror of the server's canonical Storage-path rules. */
function canonicalPhotoPath(input?: string | null) {
  if (!input) return null

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

function pathFromPublicUrl(publicUrl?: string | null) {
  if (!publicUrl) return null
  try {
    const url = new URL(publicUrl)
    const marker = "/storage/v1/object/public/dog-photos/"
    const index = url.pathname.indexOf(marker)
    if (index === -1) return null
    return canonicalPhotoPath(url.pathname.slice(index + marker.length))
  } catch {
    return null
  }
}

/**
 * Strict + canonical public-photo policy:
 * - Browser-visible photos always use the same-origin Vercel proxy.
 * - Every logical Storage object is emitted using one canonical query value.
 * - Raw Supabase Storage URLs are never used as a display fallback.
 */
export function publicPhotoSrc(publicUrl?: string | null, path?: string | null) {
  const storagePath = canonicalPhotoPath(path) || pathFromPublicUrl(publicUrl)
  if (storagePath) return `/api/public/photo?path=${encodeURIComponent(storagePath)}`
  return "/placeholder.svg"
}
