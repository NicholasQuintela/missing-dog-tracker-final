import type { SupabaseClient } from "@supabase/supabase-js"

async function getAccessToken(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error("Please log in again before uploading a photo.")
  return token
}

export async function uploadPhotoToR2(supabase: SupabaseClient, path: string, file: File) {
  const token = await getAccessToken(supabase)
  const form = new FormData()
  form.set("path", path)
  form.set("file", file)

  const response = await fetch("/api/private/photo-object", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const result = (await response.json().catch(() => ({}))) as { error?: string; photoUrl?: string }
  if (!response.ok) throw new Error(result.error || "Photo upload failed.")
  return { path, photoUrl: result.photoUrl || `${window.location.origin}/api/public/photo?path=${encodeURIComponent(path)}` }
}

export async function deletePhotoFromR2(supabase: SupabaseClient, path: string) {
  const token = await getAccessToken(supabase)
  const response = await fetch("/api/private/photo-object", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  })
  if (!response.ok && response.status !== 404) {
    const result = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(result.error || "Photo deletion failed.")
  }
}
