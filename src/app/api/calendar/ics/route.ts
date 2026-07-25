import { NextResponse } from "next/server"

import { getCurrentUser, isVerified } from "@/lib/auth"
import { parseIcs } from "@/lib/calendar/ics"
import { ingestEvents } from "@/lib/calendar/ingest"
import { supabaseAdmin } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  const { user, profile } = await getCurrentUser()
  if (!user || !isVerified(profile)) {
    return NextResponse.json({ error: "Verified members only" }, { status: 403 })
  }

  const form = await request.formData()
  const file = form.get("calendar")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a .ics file" }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 })
  }

  const text = await file.text()
  if (!text.includes("BEGIN:VCALENDAR")) {
    return NextResponse.json(
      { error: "That doesn't look like a calendar export. Look for the .ics file inside the .zip Google gives you." },
      { status: 400 }
    )
  }

  const events = parseIcs(text)

  const admin = supabaseAdmin()
  await admin.from("calendar_connections").upsert({
    user_id: user.id,
    provider: "ics",
    google_email: "",
    refresh_token: null,
  })

  const result = await ingestEvents(user.id, "ics", events)
  return NextResponse.json(result)
}
