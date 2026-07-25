import { randomBytes } from "crypto"
import { NextResponse } from "next/server"

import { getCurrentUser, isVerified } from "@/lib/auth"
import { consentUrl, googleConfigured } from "@/lib/calendar/google"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const { profile } = await getCurrentUser()
  const origin = new URL(request.url).origin

  if (!isVerified(profile)) {
    return NextResponse.redirect(new URL("/join", origin))
  }
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/calendar?error=google_unconfigured", origin))
  }

  // CSRF guard: the state we send to Google must come back matching the cookie.
  const state = randomBytes(16).toString("hex")
  const response = NextResponse.redirect(consentUrl(origin, state))
  response.cookies.set("calendar_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })
  return response
}
