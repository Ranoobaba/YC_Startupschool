import { NextResponse } from "next/server"

import { getCurrentUser, isVerified } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase/server"

export const runtime = "nodejs"

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.slice(0, max).trim() : ""
}

// Verified members submit sessions they've discovered; admins approve them
// before they appear on the schedule.
export async function POST(request: Request) {
  const { user, profile } = await getCurrentUser()
  if (!user || !isVerified(profile)) {
    return NextResponse.json({ error: "Verified members only" }, { status: 403 })
  }

  const body = await request.json()
  const title = str(body.title, 160)
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const { error } = await admin.from("school_sessions").insert({
    title,
    description: str(body.description, 1000),
    track: body.track === "hidden" ? "hidden" : "standard",
    source: "community",
    approved: profile!.role === "admin",
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    recurrence: str(body.recurrence, 120),
    link: str(body.link, 500),
    submitted_by: user.id,
  })
  if (error) {
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    message:
      profile!.role === "admin"
        ? "Session published."
        : "Submitted - it'll appear once an admin approves it.",
  })
}
