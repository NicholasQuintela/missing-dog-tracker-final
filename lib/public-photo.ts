function pathFromPublicUrl(publicUrl?: string | null) {
  if (!publicUrl) return null
  try {
    const url = new URL(publicUrl)
    const marker = "/storage/v1/object/public/dog-photos/"
    const index = url.pathname.indexOf(marker)
    if (index === -1) return null
    return decodeURIComponent(url.pathname.slice(index + marker.length))
  } catch {
    return null
  }
}

/**
 * Strict public-photo policy:
 * Browser-visible pet photos must use the same-origin Vercel proxy.
 * Never return a raw Supabase Storage URL as a display fallback.
 */
export function publicPhotoSrc(publicUrl?: string | null, path?: string | null) {
  const storagePath = path || pathFromPublicUrl(publicUrl)
  if (storagePath) return `/api/public/photo?path=${encodeURIComponent(storagePath)}`
  return "/placeholder.svg"
}
