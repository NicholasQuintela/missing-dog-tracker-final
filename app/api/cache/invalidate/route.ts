import { revalidatePath, revalidateTag } from "next/cache"

const ALLOWED_TABLES = new Set(["missing_dogs", "sightings", "volunteers"])

export async function POST(request: Request) {
  const configuredSecret = process.env.PETALERT_CACHE_WEBHOOK_SECRET
  const suppliedSecret = request.headers.get("x-petalert-cache-secret")
  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }

  let payload: { table?: string; type?: string } = {}
  try { payload = await request.json() } catch {}
  if (payload.table && !ALLOWED_TABLES.has(payload.table)) {
    return Response.json({ ok: true, ignored: true }, { headers: { "Cache-Control": "no-store" } })
  }

  // Event-driven invalidation: nothing runs when the database is idle.
  // expire: 0 makes the next request get fresh cached data rather than waiting for a timer.
  revalidateTag("petalert-public", { expire: 0 })
  if (payload.table === "missing_dogs") revalidateTag("petalert-reports", { expire: 0 })
  if (payload.table === "sightings") revalidateTag("petalert-sightings", { expire: 0 })
  if (payload.table === "volunteers") revalidateTag("petalert-volunteers", { expire: 0 })
  revalidatePath("/", "page")

  return Response.json({ ok: true, table: payload.table || null, event: payload.type || null }, { headers: { "Cache-Control": "no-store" } })
}
