import type { SupabaseClient } from "@supabase/supabase-js"
import { deletePhotoFromR2 } from "@/lib/r2-upload"

const BUCKET = "dog-photos"

export function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith(`r2://${BUCKET}/`)) {
    return url.slice(`r2://${BUCKET}/`.length).split("?")[0] || null
  }
  try {
    const parsed = new URL(url)
    if (parsed.pathname === "/api/public/photo") {
      return parsed.searchParams.get("path")
    }
  } catch {
    // Continue with legacy Supabase URL parsing.
  }
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

  const isR2Reference = Boolean(
    publicUrl?.startsWith("r2://") || publicUrl?.includes("/api/public/photo?path="),
  )

  // New uploads live in R2. Old objects may still exist in Supabase during the
  // migration window, so remove from R2 first and then best-effort Supabase.
  try {
    await deletePhotoFromR2(supabase, objectPath)
  } catch (error) {
    // If this is an old Supabase-only object, R2 deletion is allowed to fail.
    if (isR2Reference) throw error
  }

  const { error } = await supabase.storage.from(BUCKET).remove([objectPath])
  if (error && !isR2Reference) {
    throw new Error(`Unable to delete the uploaded photo: ${error.message}`)
  }
}
