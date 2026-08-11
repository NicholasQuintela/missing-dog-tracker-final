export function publicPhotoSrc(publicUrl?: string | null, path?: string | null) {
  if (path) return `/api/public/photo?path=${encodeURIComponent(path)}`
  return publicUrl || "/placeholder.svg"
}
