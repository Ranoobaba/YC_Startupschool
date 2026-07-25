import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getCurrentUser, isVerified } from "@/lib/auth"
import {
  exchangeCode,
  fetchGoogleEvents,
  googleAccountEmail,
} from "@/lib/calendar/google"
import { ingestEvents } from "@/lib/calendar/ingest"
import { supabaseAdmin } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = url.origin
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/calendar?error=${reason}`, origin))

  const { user, profile } = await getCurrentUser()
  if (!user || !isVerified(profile)) return fail("not_verified")

  if (url.searchParams.get("error")) return fail("declined")

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const expected = (await cookies()).get("calendar_oauth_state")?.value
  if (!code || !state || !expected || state !== expected) return fail("bad_state")

  const tokens = await exchangeCode(code, origin)
  if (!tokens.access_token) return fail("token_exchange")

  // Google's consent screen lets people approve sign-in while leaving the
  // calendar permission unticked. Without this check the sync runs, gets a 403,
  // and reports "0 events" — which reads as an empty calendar rather than a
  // permission that was never granted.
  if (!(tokens.scope ?? "").includes("calendar.events.readonly")) {
    return fail("missing_calendar_scope")
  }

  const [email, events] = await Promise.all([
    googleAccountEmail(tokens.access_token),
    fetchGoogleEvents(tokens.access_token),
  ])

  const admin = supabaseAdmin()
  await admin.from("calendar_connections").upsert({
    user_id: user.id,
    provider: "google",
    google_email: email,
    // Google only returns a refresh token on first consent; keep the old one
    // if this was a re-authorization that omitted it.
    ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
  })

  const result = await ingestEvents(user.id, "google", events)

  const response = NextResponse.redirect(
    new URL(`/calendar?connected=${result.kept}`, origin)
  )
  response.cookies.delete("calendar_oauth_state")
  return response
}
