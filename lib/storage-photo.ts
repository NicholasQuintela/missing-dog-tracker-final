import type { SupabaseClient } from "@supabase/supabase-js"

const BUCKET = "dog-photos"

export function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const index = url.indexOf(marker)
  if (index < 0) return null
  try {
    return decodeURIComponent(url.slice(index + marker.length).split("?")[0])
  } catch {
    return url.slice(index + marker.length).split("?")[0]
  }
}

export async function removeStoredPhoto(
  supabase: SupabaseClient,
  path: string | null | undefined,
  publicUrl?: string | null,
) {
  const objectPath = path || storagePathFromPublicUrl(publicUrl)
  if (!objectPath) return
  const { error } = await supabase.storage.from(BUCKET).remove([objectPath])
  if (error) throw new Error(`Unable to delete the uploaded photo: ${error.message}`)
}
