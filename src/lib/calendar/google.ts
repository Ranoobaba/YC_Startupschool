import type { RawEvent } from "./types"

// Read-only, events-only: the narrowest Calendar scope that still lets us read
// invite details, which matters because Google reviews exactly what you ask for.
// userinfo.email is non-sensitive and only used to label which account is linked.
export const GOOGLE_SCOPE = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ")

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function redirectUri(origin: string): string {
  return `${origin}/api/calendar/google/callback`
}

export function consentUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPE,
    // offline + consent is what actually returns a refresh token, so the
    // connection survives past the first access token.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  scope?: string
  error?: string
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  })
  return res.json()
}

export function exchangeCode(code: string, origin: string) {
  return tokenRequest({
    code,
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  })
}

export function refreshAccessToken(refreshToken: string) {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" })
}

export async function googleAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return ""
  const data = await res.json()
  return typeof data.email === "string" ? data.email : ""
}

interface GoogleEvent {
  iCalUID?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  hangoutLink?: string
  status?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  organizer?: { email?: string; displayName?: string }
  recurringEventId?: string
}

function toRawEvent(event: GoogleEvent): RawEvent {
  const organizer = [event.organizer?.email, event.organizer?.displayName]
    .filter(Boolean)
    .join(" ")

  return {
    uid: event.iCalUID ?? "",
    title: event.summary ?? "",
    description: (event.description ?? "").slice(0, 1000),
    location: (event.location ?? "").slice(0, 300),
    startsAt: event.start?.dateTime ?? event.start?.date ?? null,
    endsAt: event.end?.dateTime ?? event.end?.date ?? null,
    // singleEvents=true expands recurrences into instances, so each row is a
    // concrete occurrence and there is no rule left to describe.
    recurrence: "",
    link: (event.hangoutLink || event.htmlLink || "").slice(0, 500),
    organizer: organizer.slice(0, 300),
  }
}

/** Pulls upcoming events from the user's primary calendar. */
export async function fetchGoogleEvents(accessToken: string): Promise<RawEvent[]> {
  const events: RawEvent[] = []
  let pageToken: string | undefined

  // A term runs a few months; a year of lookahead covers it with room to spare.
  const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      ...(pageToken ? { pageToken } : {}),
    })

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) break

    const data = await res.json()
    for (const item of (data.items ?? []) as GoogleEvent[]) {
      if (item.status === "cancelled") continue
      events.push(toRawEvent(item))
    }

    pageToken = data.nextPageToken
    if (!pageToken) break
  }

  return events
}
