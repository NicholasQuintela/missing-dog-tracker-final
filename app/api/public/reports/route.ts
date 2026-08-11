import { NextRequest } from "next/server"
import { getPublicReportBatch, getPublicReportById } from "@/lib/public-data"

const CDN_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "public, max-age=30",
  "Vercel-CDN-Cache-Control": "public, max-age=30",
  "Vercel-Cache-Tag": "petalert-public,petalert-reports",
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim()
    if (id) {
      const report = await getPublicReportById(id)
      return Response.json({ report }, { headers: CDN_HEADERS })
    }

    const rawOffset = Number(request.nextUrl.searchParams.get("offset") || 0)
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 10)
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0
    const limit = Number.isFinite(rawLimit) ? Math.min(20, Math.max(1, Math.floor(rawLimit))) : 10
    const reports = await getPublicReportBatch(offset, limit)
    return Response.json({ reports }, { headers: CDN_HEADERS })
  } catch (error) {
    console.error("Public reports cache route failed", error)
    return Response.json({ error: "Unable to load reports." }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
}
