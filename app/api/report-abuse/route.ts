import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const allowedTargets = new Set(["missing_dog", "sighting", "message", "user"])
const allowedCategories = new Set(["fake_report", "spam", "scam", "harassment", "inappropriate", "other"])

type RequestBody = {
  targetType?: string
  targetId?: string
  category?: string
  details?: string | null
}

function getServerClients(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    throw new Error("Server configuration is incomplete.")
  }

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { authClient, adminClient }
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization")
    const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null
    if (!accessToken) {
      return NextResponse.json({ error: "Please log in before reporting abuse." }, { status: 401 })
    }

    const body = (await request.json()) as RequestBody
    const targetType = body.targetType?.trim()
    const targetId = body.targetId?.trim()
    const category = body.category?.trim()
    const details = body.details?.trim() || null

    if (!targetType || !allowedTargets.has(targetType)) {
      return NextResponse.json({ error: "Invalid report type." }, { status: 400 })
    }
    if (!targetId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
      return NextResponse.json({ error: "Invalid reported item." }, { status: 400 })
    }
    if (!category || !allowedCategories.has(category)) {
      return NextResponse.json({ error: "Choose a valid reason." }, { status: 400 })
    }
    if (details && details.length > 1000) {
      return NextResponse.json({ error: "Details must be 1,000 characters or fewer." }, { status: 400 })
    }

    const { authClient, adminClient } = getServerClients(accessToken)
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
    const user = userData.user
    if (userError || !user) {
      return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 })
    }

    if (targetType === "missing_dog") {
      const { data } = await adminClient.from("missing_dogs").select("id").eq("id", targetId).maybeSingle()
      if (!data) return NextResponse.json({ error: "The reported pet post no longer exists." }, { status: 404 })
    } else if (targetType === "sighting") {
      const { data } = await adminClient.from("sightings").select("id").eq("id", targetId).maybeSingle()
      if (!data) return NextResponse.json({ error: "The reported sighting no longer exists." }, { status: 404 })
    } else if (targetType === "message") {
      const { data: message } = await adminClient
        .from("messages")
        .select("id, sender_id, conversation_id")
        .eq("id", targetId)
        .maybeSingle()
      if (!message) return NextResponse.json({ error: "The reported message no longer exists." }, { status: 404 })

      const { data: conversation } = await adminClient
        .from("conversations")
        .select("owner_id, volunteer_id")
        .eq("id", message.conversation_id)
        .maybeSingle()
      if (!conversation || ![conversation.owner_id, conversation.volunteer_id].includes(user.id)) {
        return NextResponse.json({ error: "You cannot report a message outside your conversation." }, { status: 403 })
      }
      if (message.sender_id === user.id) {
        return NextResponse.json({ error: "You cannot report your own message." }, { status: 400 })
      }
    }

    const { error: insertError } = await adminClient.from("abuse_reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason: category,
      details,
      status: "pending",
    })

    if (insertError) {
      console.error("[Pet Alert PH] abuse report insert failed", insertError)
      return NextResponse.json({ error: "Unable to save the abuse report. Please try again." }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[Pet Alert PH] report abuse route failed", error)
    return NextResponse.json({ error: "Unable to submit the report right now." }, { status: 500 })
  }
}
