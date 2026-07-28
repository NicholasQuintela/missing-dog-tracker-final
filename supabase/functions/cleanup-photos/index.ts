import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

Deno.serve(async (req) => {
  const secret = Deno.env.get("CLEANUP_SECRET")
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: rows, error } = await supabase.from("photo_cleanup_queue").select("id,bucket_id,object_path").is("processed_at", null).limit(500)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let removed = 0
  for (const row of rows ?? []) {
    const { error: removeError } = await supabase.storage.from(row.bucket_id).remove([row.object_path])
    await supabase.from("photo_cleanup_queue").update(removeError
      ? { last_error: removeError.message }
      : { processed_at: new Date().toISOString(), last_error: null }
    ).eq("id", row.id)
    if (!removeError) {
      removed++
      await supabase.from("missing_dogs").update({ photo_url: null, photo_path: null }).eq("photo_path", row.object_path)
      await supabase.from("missing_dogs").update({ found_photo_url: null, found_photo_path: null }).eq("found_photo_path", row.object_path)
      await supabase.from("sightings").update({ photo_url: null, photo_path: null }).eq("photo_path", row.object_path)
    }
  }
  return Response.json({ processed: rows?.length ?? 0, removed })
})
