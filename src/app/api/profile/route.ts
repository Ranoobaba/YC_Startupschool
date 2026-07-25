import { NextResponse } from "next/server"

import { isCompanyEmail } from "@/lib/auth"
import { embed } from "@/lib/retrieval"
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.slice(0, max).trim() : ""
}

// Creates or updates the signed-in user's profile. Founders with a verified
// company email are approved immediately; students stay pending until their
// acceptance screenshot passes verification.
export async function POST(request: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const body = await request.json()
  const requestedRole = body.role === "founder" ? "founder" : "student"

  const admin = supabaseAdmin()
  const { data: existing } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle()

  // Role and status are decided server-side; never trust them from the body.
  const role = existing?.role === "admin" ? "admin" : requestedRole
  let status = existing?.status ?? "pending"
  if (status !== "approved" && role === "founder") {
    status = isCompanyEmail(user.email ?? "") ? "approved" : "pending"
  }

  const fields = {
    full_name: str(body.full_name, 120),
    startup_name: str(body.startup_name, 120),
    one_liner: str(body.one_liner, 200),
    bio: str(body.bio, 2000),
    looking_for: str(body.looking_for, 500),
    location: str(body.location, 120),
    linkedin_url: str(body.linkedin_url, 300),
  }

  const embeddingText = `${fields.full_name}. ${fields.startup_name}: ${fields.one_liner}. ${fields.bio}. Looking for: ${fields.looking_for}. Location: ${fields.location}`
  const embedding = await embed(embeddingText)

  const { error } = await admin.from("profiles").upsert({
    id: user.id,
    role,
    status,
    ...fields,
    ...(embedding ? { embedding } : {}),
    updated_at: new Date().toISOString(),
  })
  if (error) {
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 })
  }

  return NextResponse.json({ role, status })
}
