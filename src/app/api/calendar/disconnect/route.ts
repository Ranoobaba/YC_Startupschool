import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase/server"

export const runtime = "nodejs"

// Removes the connection and every event we stored for this student. Sessions
// already published to the shared schedule stay — they are anonymous and other
// students depend on them — but nothing of this calendar remains linked here.
export async function POST() {
  const { user } = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const admin = supabaseAdmin()
  await admin.from("calendar_events").delete().eq("user_id", user.id)
  await admin.from("calendar_connections").delete().eq("user_id", user.id)
  await admin.rpc("publish_calendar_sessions")

  return NextResponse.json({ ok: true })
}
