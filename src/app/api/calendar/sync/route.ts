import { NextResponse } from "next/server"

import { getCurrentUser, isVerified } from "@/lib/auth"
import { fetchGoogleEvents, refreshAccessToken } from "@/lib/calendar/google"
import { ingestEvents } from "@/lib/calendar/ingest"
import { supabaseAdmin } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

// Re-pulls a connected Google Calendar so newly-added YC invites show up.
export async function POST() {
  const { user, profile } = await getCurrentUser()
  if (!user || !isVerified(profile)) {
    return NextResponse.json({ error: "Verified members only" }, { status: 403 })
  }

  const admin = supabaseAdmin()
  const { data: connection } = await admin
    .from("calendar_connections")
    .select("provider, refresh_token")
    .eq("user_id", user.id)
    .maybeSingle()

  if (connection?.provider !== "google" || !connection.refresh_token) {
    return NextResponse.json(
      { error: "Re-upload your .ics export to refresh." },
      { status: 400 }
    )
  }

  const tokens = await refreshAccessToken(connection.refresh_token)
  if (!tokens.access_token) {
    return NextResponse.json(
      {
        error:
          "Google access expired — reconnect your calendar. (Until the app is Google-verified, connections lapse after 7 days.)",
      },
      { status: 401 }
    )
  }

  const events = await fetchGoogleEvents(tokens.access_token)
  const result = await ingestEvents(user.id, "google", events)
  return NextResponse.json(result)
}
