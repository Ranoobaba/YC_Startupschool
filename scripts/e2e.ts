/**
 * End-to-end test harness for Startup School Hub.
 *
 *   pnpm test:e2e                                     # runs against production
 *   E2E_BASE_URL=http://localhost:3000 pnpm test:e2e  # runs against a dev server
 *
 * What it needs
 * -------------
 * Credentials are read from .env.local in the repo root (or $ENV_FILE), and any
 * variable already exported in the shell wins over the file. Required:
 *
 *   NEXT_PUBLIC_SUPABASE_URL       used to talk to the same database the site uses
 *   SUPABASE_SERVICE_ROLE_KEY      creates throwaway users and inspects/cleans rows
 *
 * The remaining secrets (ANTHROPIC_API_KEY, GOOGLE_CLIENT_*) are read by the
 * deployment under test, not by this script — a check that depends on one fails
 * loudly if the target deployment is missing it.
 *
 * What it does
 * ------------
 * Signs in throwaway users with real magic links (no email involved), drives the
 * live HTTP endpoints exactly as a browser would, and asserts against both the
 * responses and the database rows behind them. Every row it creates carries a
 * unique run label and is deleted in a finally block, including on failure. It
 * never touches a user, profile, or row it did not create.
 *
 * Exit code is 0 only if every check passed, so it can gate a deploy.
 */

import { readFileSync } from "fs"
import { resolve } from "path"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function loadEnvFile(): string {
  const candidates = [
    process.env.ENV_FILE,
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "..", ".env.local"),
  ].filter(Boolean) as string[]

  for (const path of candidates) {
    let raw: string
    try {
      raw = readFileSync(path, "utf8")
    } catch {
      continue
    }
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match) continue
      const [, key, rawValue] = match
      // Shell-exported values win: they are how you point the run somewhere else.
      if (process.env[key] !== undefined) continue
      let value = rawValue.trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
    return path
  }
  return ""
}

const ENV_PATH = loadEnvFile()
const BASE_URL = (process.env.E2E_BASE_URL ?? "https://yc-startupschool.vercel.app").replace(/\/$/, "")
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

// Never modify the real owner, whatever else goes wrong.
const PROTECTED_EMAILS = new Set(["alisyedrayyan89@gmail.com"])

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const results: { name: string; ok: boolean; detail: string }[] = []
const warnings: string[] = []

const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const DIM = "\x1b[2m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

function section(title: string) {
  console.log(`\n${BOLD}${title}${RESET}`)
}

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail })
  const tag = ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`
  console.log(`  ${tag}  ${name}`)
  if (detail) console.log(`        ${DIM}${detail}${RESET}`)
}

function warn(message: string) {
  warnings.push(message)
  console.log(`  ${DIM}note  ${message}${RESET}`)
}

/** Runs one check. A thrown error is a failure, never a crash. */
async function check(name: string, fn: () => Promise<string> | string) {
  try {
    const detail = await fn()
    record(name, true, detail)
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err))
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

// ---------------------------------------------------------------------------
// HTTP with a cookie jar (a browser session, minus the browser)
// ---------------------------------------------------------------------------

class Jar {
  private cookies = new Map<string, string>()

  absorb(response: Response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : []
    for (const raw of setCookies) {
      const [pair, ...attrs] = raw.split(";")
      const eq = pair.indexOf("=")
      if (eq === -1) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const expired =
        value === "" ||
        attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a)) ||
        attrs.some((a) => /^\s*expires\s*=\s*Thu,\s*01 Jan 1970/i.test(a))
      if (expired) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ")
  }

  get size() {
    return this.cookies.size
  }

  names(): string[] {
    return [...this.cookies.keys()]
  }
}

interface Hit {
  status: number
  location: string
  body: string
  headers: Headers
}

/** One request, redirects left alone so gating can be asserted. */
async function hit(
  path: string,
  options: { jar?: Jar; method?: string; body?: BodyInit; headers?: Record<string, string> } = {}
): Promise<Hit> {
  const headers: Record<string, string> = { ...options.headers }
  if (options.jar && options.jar.size > 0) headers.cookie = options.jar.header()

  const response = await fetch(path.startsWith("http") ? path : `${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    body: options.body,
    headers,
    redirect: "manual",
  })
  options.jar?.absorb(response)

  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    body: await response.text(),
    headers: response.headers,
  }
}

/** Follows redirects while collecting cookies, the way a browser would. */
async function follow(path: string, jar: Jar, max = 5): Promise<Hit> {
  let current = path
  let last = await hit(current, { jar })
  for (let i = 0; i < max && last.status >= 300 && last.status < 400 && last.location; i++) {
    current = new URL(last.location, BASE_URL).toString()
    last = await hit(current, { jar })
  }
  return last
}

async function postJson(path: string, jar: Jar, payload: unknown): Promise<Hit> {
  return hit(path, {
    jar,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
}

// ---------------------------------------------------------------------------
// Run identity: everything this run creates is greppable and unique
// ---------------------------------------------------------------------------

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const LABEL = `e2e-${RUN}`
const TOKEN = `Zorbafloxil${RUN}` // a word that exists nowhere else in the database

const ALPHA_KEY = `${LABEL}-alpha@e2e.invalid`
const BETA_KEY = `${LABEL}-beta@e2e.invalid`
const ALPHA_TITLE = `E2E ${RUN} group office hours`
const BETA_TITLE = `Startup School kickoff E2E ${RUN}`
const SUBMITTED_TITLE = `E2E ${RUN} community submission`

const created = {
  userIds: [] as string[],
  emails: [] as string[],
  calendarKeys: [ALPHA_KEY, BETA_KEY],
  sessionIds: [] as string[],
}

// ---------------------------------------------------------------------------
// Calendar fixtures: shaped like a real Google Calendar export
// ---------------------------------------------------------------------------

function icsFor(events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:America/Los_Angeles",
    "X-LIC-LOCATION:America/Los_Angeles",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0800",
    "TZOFFSETTO:-0700",
    "TZNAME:PDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0800",
    "TZNAME:PST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n")
}

// Matches only on the organizer domain: the title carries no YC wording, which
// is the whole point — a session nobody would find by keyword still gets in.
const ALPHA_EVENT = [
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Los_Angeles:20260901T100000",
  "DTEND;TZID=America/Los_Angeles:20260901T110000",
  "RRULE:FREQ=WEEKLY;BYDAY=TU",
  `UID:${ALPHA_KEY}`,
  "ORGANIZER;CN=Startup School:mailto:startupschool2026@ycombinator.com",
  "DESCRIPTION:Weekly small-group session with your assigned group. Join with G",
  " oogle Meet: https://meet.google.com/e2e-alpha-test\\nBring an update\\, a bloc",
  " ker\\, and a question.",
  "LOCATION:Google Meet",
  `SUMMARY:${ALPHA_TITLE}`,
  "END:VEVENT",
].join("\r\n")

// Matches only on the title wording: no YC address anywhere in its metadata.
const BETA_EVENT = [
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Los_Angeles:20260902T090000",
  "DTEND;TZID=America/Los_Angeles:20260902T103000",
  `UID:${BETA_KEY}`,
  "ORGANIZER;CN=Cohort Host:mailto:host@example.invalid",
  "DESCRIPTION:Opening lecture for the cohort.",
  "LOCATION:Online",
  `SUMMARY:${BETA_TITLE}`,
  "END:VEVENT",
].join("\r\n")

/**
 * The privacy trap. Its description is stuffed with the exact wording the filter
 * looks for — if the filter ever starts reading descriptions, this event lands
 * in a shared database and the check below fails.
 */
function personalEvent(who: string): string {
  return [
    "BEGIN:VEVENT",
    "DTSTART;TZID=America/Los_Angeles:20260903T140000",
    "DTEND;TZID=America/Los_Angeles:20260903T150000",
    `UID:${LABEL}-personal-${who}@e2e.invalid`,
    "ORGANIZER;CN=Reception:mailto:reception@dentalcare.invalid",
    "DESCRIPTION:Remember to ask about the Startup School application and the Y ",
    " Combinator deadline while waiting.",
    "LOCATION:12 Elm St\\, Suite 3",
    `SUMMARY:Dentist appointment ${LABEL}-${who}`,
    "END:VEVENT",
  ].join("\r\n")
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

let admin: SupabaseClient

interface TestUser {
  id: string
  email: string
  jar: Jar
}

async function createSignedInUser(
  suffix: string,
  profile: Record<string, unknown>
): Promise<TestUser> {
  const email = `${LABEL}-${suffix}@e2e.invalid`
  assert(!PROTECTED_EMAILS.has(email), "refusing to touch a protected account")

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  assert(!error && data.user, `createUser failed: ${error?.message}`)
  const id = data.user!.id
  created.userIds.push(id)
  created.emails.push(email)

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id, ...profile })
  assert(!profileError, `profile upsert failed: ${profileError?.message}`)

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })
  assert(!linkError && link?.properties?.hashed_token, `generateLink failed: ${linkError?.message}`)

  const jar = new Jar()
  const landing = await follow(
    `/auth/confirm?token_hash=${link!.properties.hashed_token}&type=magiclink&next=/`,
    jar
  )
  assert(landing.status === 200, `magic link landed on ${landing.status}`)
  assert(
    jar.names().some((n) => n.includes("auth-token")),
    `no Supabase session cookie was set (got: ${jar.names().join(", ") || "none"})`
  )

  return { id, email, jar }
}

async function setStatus(userId: string, status: string) {
  assert(created.userIds.includes(userId), "refusing to update a profile this run did not create")
  const { error } = await admin.from("profiles").update({ status }).eq("id", userId)
  assert(!error, `status update failed: ${error?.message}`)
}

async function uploadIcs(user: TestUser, ics: string) {
  const form = new FormData()
  form.append("calendar", new File([ics], "calendar.ics", { type: "text/calendar" }))
  const response = await fetch(`${BASE_URL}/api/calendar/ics`, {
    method: "POST",
    headers: { cookie: user.jar.header() },
    body: form,
  })
  const text = await response.text()
  return { status: response.status, text, json: safeJson(text) }
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

async function sessionByKey(key: string) {
  const { data } = await admin
    .from("school_sessions")
    .select("id, title, approved, attendee_count, track, source, calendar_key")
    .eq("calendar_key", key)
    .maybeSingle()
  return data
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function main() {
  console.log(`${BOLD}Startup School Hub — end-to-end${RESET}`)
  console.log(`${DIM}target      ${BASE_URL}${RESET}`)
  console.log(`${DIM}credentials ${ENV_PATH || "(environment only)"}${RESET}`)
  console.log(`${DIM}run label   ${LABEL}${RESET}`)

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      `\n${RED}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.${RESET}\n` +
        `Put them in .env.local (see .env.example) or export them before running.`
    )
    process.exit(2)
  }

  admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  const baseline = await counts()

  // -- 1. Anonymous gating --------------------------------------------------
  section("1. Anonymous gating")

  const gated = ["/schedule", "/ask", "/calendar", "/admin", "/verify"]
  await check("gated pages redirect anonymous visitors to /login", async () => {
    const seen: string[] = []
    for (const path of gated) {
      const res = await hit(path)
      assert(res.status >= 300 && res.status < 400, `${path} returned ${res.status}, expected a redirect`)
      const location = new URL(res.location, BASE_URL)
      assert(location.pathname === "/login", `${path} redirected to ${location.pathname}`)
      assert(
        location.searchParams.get("next") === path,
        `${path} lost its next param (got ${location.searchParams.get("next")})`
      )
      seen.push(`${path}->${res.status}`)
    }
    return seen.join("  ")
  })

  await check("public pages stay public", async () => {
    const seen: string[] = []
    for (const path of ["/", "/join", "/login"]) {
      const res = await hit(path)
      assert(res.status === 200, `${path} returned ${res.status}`)
      seen.push(`${path}->200`)
    }
    return seen.join("  ")
  })

  await check("API routes fail closed for anonymous callers", async () => {
    const ask = await hit("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "hello" }),
    })
    assert(ask.status === 403, `POST /api/ask returned ${ask.status}, expected 403`)
    const sessions = await hit("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "should not exist" }),
    })
    assert(sessions.status === 403, `POST /api/sessions returned ${sessions.status}, expected 403`)
    const ics = await hit("/api/calendar/ics")
    assert(ics.status === 405, `GET /api/calendar/ics returned ${ics.status}, expected 405`)
    return "ask 403  sessions 403  ics GET 405"
  })

  // -- 2. Unverified lockout ------------------------------------------------
  section("2. Unverified lockout")

  const alice = await createSignedInUser("alice", {
    role: "student",
    status: "pending",
    full_name: `E2E Harness Student ${RUN}`,
    startup_name: TOKEN,
    one_liner: `${TOKEN} builds automated freight routing for small carriers.`,
    bio: `Temporary end-to-end test profile (${LABEL}). Working on ${TOKEN}.`,
    looking_for: "A technical cofounder and design partners",
    location: "Test Harbor",
  })
  record("signed in a throwaway student with a real magic link", true, `${alice.email}  ${alice.id}`)

  const LOCKED = ["Almost in.", "Your verification is being reviewed"]
  const REAL_CONTENT: Record<string, string> = {
    "/schedule": "Schedule</h1>",
    "/ask": "People</h1>",
    "/calendar": "Your schedule, and everything around it.",
  }

  await check("pending member sees the locked state, never the real content", async () => {
    const seen: string[] = []
    for (const [path, marker] of Object.entries(REAL_CONTENT)) {
      const res = await hit(path, { jar: alice.jar })
      assert(res.status === 200, `${path} returned ${res.status}`)
      for (const locked of LOCKED) {
        assert(res.body.includes(locked), `${path} is missing the locked copy "${locked}"`)
      }
      assert(!res.body.includes(marker), `${path} leaked real content ("${marker}") to a pending member`)
      seen.push(path)
    }
    return `locked: ${seen.join(" ")}`
  })

  await check("pending member is rejected by the API too", async () => {
    const ask = await postJson("/api/ask", alice.jar, { question: "who is here?" })
    assert(ask.status === 403, `POST /api/ask returned ${ask.status}, expected 403`)
    const upload = await uploadIcs(alice, icsFor([ALPHA_EVENT]))
    assert(upload.status === 403, `POST /api/calendar/ics returned ${upload.status}, expected 403`)
    return "ask 403  ics 403"
  })

  await check("pending member cannot start the Google Calendar OAuth flow", async () => {
    const res = await hit("/api/calendar/google/start", { jar: alice.jar })
    assert(res.status >= 300 && res.status < 400, `returned ${res.status}, expected a redirect`)
    const location = new URL(res.location, BASE_URL)
    assert(location.pathname === "/join", `redirected to ${location.pathname}, expected /join`)
    return `${res.status} -> /join`
  })

  await check("non-admin is bounced off /admin (pending)", async () => {
    const res = await hit("/admin", { jar: alice.jar })
    assert(res.status >= 300 && res.status < 400, `returned ${res.status}, expected a redirect`)
    assert(new URL(res.location, BASE_URL).pathname === "/", `redirected to ${res.location}`)
    return `${res.status} -> /`
  })

  // -- 3. Approval unlocks the hub -----------------------------------------
  section("3. Approval unlocks the hub")

  await setStatus(alice.id, "approved")

  await check("approved member sees real content on every gated page", async () => {
    const seen: string[] = []
    for (const [path, marker] of Object.entries(REAL_CONTENT)) {
      const res = await hit(path, { jar: alice.jar })
      assert(res.status === 200, `${path} returned ${res.status}`)
      assert(res.body.includes(marker), `${path} is missing "${marker}" after approval`)
      assert(!res.body.includes(LOCKED[0]), `${path} still shows the locked state after approval`)
      seen.push(path)
    }
    const verify = await hit("/verify", { jar: alice.jar })
    assert(verify.body.includes("Full access is unlocked."), "/verify does not confirm the unlock")
    seen.push("/verify")
    return `unlocked: ${seen.join(" ")}`
  })

  await check("approval does not grant admin (role is checked separately)", async () => {
    const res = await hit("/admin", { jar: alice.jar })
    assert(res.status >= 300 && res.status < 400, `returned ${res.status}, expected a redirect`)
    assert(new URL(res.location, BASE_URL).pathname === "/", `redirected to ${res.location}`)
    const followed = await follow("/admin", alice.jar)
    for (const marker of ["Verifications awaiting review", "Session submissions", "Add a student manually"]) {
      assert(!followed.body.includes(marker), `admin UI leaked: "${marker}"`)
    }
    return `${res.status} -> /, no admin UI in the body`
  })

  // -- 4. Calendar ingestion and the privacy filter -------------------------
  section("4. Calendar ingestion and the privacy filter")

  const aliceUpload = await uploadIcs(
    alice,
    icsFor([ALPHA_EVENT, BETA_EVENT, personalEvent("alice")])
  )

  await check("uploading a .ics keeps the Startup School events and drops the rest", () => {
    assert(aliceUpload.status === 200, `upload returned ${aliceUpload.status}: ${aliceUpload.text.slice(0, 200)}`)
    assert(aliceUpload.json.scanned === 3, `scanned ${aliceUpload.json.scanned}, expected 3`)
    assert(aliceUpload.json.kept === 2, `kept ${aliceUpload.json.kept}, expected 2`)
    return `scanned 3  kept 2  discovered ${aliceUpload.json.discovered}`
  })

  await check("the personal event is nowhere in the database", async () => {
    const { data: events } = await admin
      .from("calendar_events")
      .select("calendar_key, title")
      .eq("user_id", alice.id)
    const keys = (events ?? []).map((e) => e.calendar_key).sort()
    assert(keys.length === 2, `stored ${keys.length} events, expected 2`)
    assert(keys.includes(ALPHA_KEY) && keys.includes(BETA_KEY), `stored the wrong keys: ${keys.join(", ")}`)

    // The personal event's description contains "Startup School" and
    // "Y Combinator" verbatim. Finding it anywhere means the filter widened.
    const { data: leaked } = await admin
      .from("calendar_events")
      .select("id")
      .ilike("title", `%Dentist appointment ${LABEL}%`)
    assert((leaked ?? []).length === 0, "a personal event was stored despite not matching on metadata")
    const { data: leakedSession } = await admin
      .from("school_sessions")
      .select("id")
      .ilike("title", `%Dentist appointment ${LABEL}%`)
    assert((leakedSession ?? []).length === 0, "a personal event reached the shared schedule")
    return "dentist appointment dropped from calendar_events and school_sessions"
  })

  await check("both matched events are stored (organizer match and title match)", async () => {
    const { data: events } = await admin
      .from("calendar_events")
      .select("calendar_key, title, organizer, recurrence, starts_at")
      .eq("user_id", alice.id)
    const alpha = (events ?? []).find((e) => e.calendar_key === ALPHA_KEY)
    const beta = (events ?? []).find((e) => e.calendar_key === BETA_KEY)
    assert(alpha, "the organizer-matched event was not stored")
    assert(
      alpha!.organizer.includes("ycombinator.com"),
      "the organizer-matched event lost its organizer"
    )
    assert(
      alpha!.recurrence === "Weekly on Tuesday",
      `recurrence parsed as "${alpha!.recurrence}", expected "Weekly on Tuesday"`
    )
    assert(alpha!.starts_at, "the event lost its start time")
    assert(beta, "the title-matched event was not stored")
    assert(
      !beta!.organizer.includes("ycombinator"),
      "the title-match test event has a YC organizer, so it proves nothing"
    )
    return `organizer match + title match stored; recurrence "${alpha!.recurrence}"`
  })

  await check("one student's sighting does not publish a session", async () => {
    const alpha = await sessionByKey(ALPHA_KEY)
    const beta = await sessionByKey(BETA_KEY)
    assert(alpha, "no shared session row was created for the first event")
    assert(beta, "no shared session row was created for the second event")
    assert(alpha!.approved === false, "a single sighting was published")
    assert(alpha!.attendee_count === 1, `attendee_count is ${alpha!.attendee_count}, expected 1`)
    assert(alpha!.source === "calendar", `source is ${alpha!.source}, expected calendar`)
    assert(alpha!.track === "hidden", `track is ${alpha!.track}, expected hidden`)
    const schedule = await hit("/schedule", { jar: alice.jar })
    assert(!schedule.body.includes(ALPHA_TITLE), "an uncorroborated session appeared on the schedule")
    return "stored unapproved, attendee_count 1, absent from /schedule"
  })

  // -- 5. Two-student corroboration ----------------------------------------
  section("5. Two-student corroboration")

  const bob = await createSignedInUser("bob", {
    role: "student",
    status: "approved",
    full_name: `E2E Harness Corroborator ${RUN}`,
    startup_name: `${TOKEN}Two`,
    one_liner: "Temporary end-to-end test profile.",
    bio: `Temporary end-to-end test profile (${LABEL}).`,
    looking_for: "Nothing - this row is deleted at the end of the run",
    location: "Test Harbor",
  })
  record("signed in a second approved student", true, `${bob.email}  ${bob.id}`)

  const bobUpload = await uploadIcs(bob, icsFor([ALPHA_EVENT, personalEvent("bob")]))

  await check("a second student's calendar publishes the shared session", async () => {
    assert(bobUpload.status === 200, `upload returned ${bobUpload.status}: ${bobUpload.text.slice(0, 200)}`)
    assert(bobUpload.json.kept === 1, `kept ${bobUpload.json.kept}, expected 1`)
    const alpha = await sessionByKey(ALPHA_KEY)
    assert(alpha, "the shared session row disappeared")
    assert(alpha!.attendee_count === 2, `attendee_count is ${alpha!.attendee_count}, expected 2`)
    assert(alpha!.approved === true, "two independent students did not publish the session")
    return "attendee_count 2, approved true"
  })

  await check("the session with one sighting stays unpublished", async () => {
    const beta = await sessionByKey(BETA_KEY)
    assert(beta, "the single-sighting session row disappeared")
    assert(beta!.attendee_count === 1, `attendee_count is ${beta!.attendee_count}, expected 1`)
    assert(beta!.approved === false, "a single sighting was published - the threshold is not holding")
    return "attendee_count 1, still unapproved"
  })

  await check("the published session reaches the shared schedule", async () => {
    const schedule = await hit("/schedule", { jar: alice.jar })
    assert(schedule.status === 200, `/schedule returned ${schedule.status}`)
    assert(
      schedule.body.includes(ALPHA_TITLE),
      "the corroborated session is not on /schedule for the other student"
    )
    assert(!schedule.body.includes(BETA_TITLE), "the uncorroborated session leaked onto /schedule")
    const calendar = await hit("/calendar", { jar: alice.jar })
    assert(calendar.body.includes(ALPHA_TITLE), "the corroborated session is not on /calendar")
    return "visible on /schedule and /calendar to a student who never uploaded it alone"
  })

  // -- 6. Ask ---------------------------------------------------------------
  section("6. Ask")

  await check("Ask returns a sourced answer grounded in the directory", async () => {
    const res = await postJson("/api/ask", alice.jar, {
      question: `Tell me about the startup ${TOKEN} and what they are looking for.`,
    })
    assert(res.status === 200, `POST /api/ask returned ${res.status}: ${res.body.slice(0, 200)}`)
    const payload = safeJson(res.body) as {
      answer?: string
      sources?: { name: string; startup: string }[]
    }
    assert(typeof payload.answer === "string" && payload.answer.length > 20, "the answer is empty")
    assert(Array.isArray(payload.sources) && payload.sources.length > 0, "the answer cited no sources")
    assert(
      payload.sources!.some((s) => s.startup?.includes(TOKEN)),
      `the seeded profile was not retrieved (sources: ${payload.sources!.map((s) => s.startup).join(", ")})`
    )
    assert(
      payload.answer!.toLowerCase().includes(TOKEN.toLowerCase()),
      `the answer never mentions the retrieved startup: ${payload.answer!.slice(0, 160)}`
    )
    return `${payload.sources!.length} sources, answer names ${TOKEN}: "${payload.answer!.slice(0, 90).replace(/\s+/g, " ")}..."`
  })

  await check("Ask rejects an empty question", async () => {
    const res = await postJson("/api/ask", alice.jar, { question: "   " })
    assert(res.status === 400, `returned ${res.status}, expected 400`)
    return "400 on a blank question"
  })

  // -- 7. Session submission needs approval ---------------------------------
  section("7. Session submission")

  await check("a student's submission is queued, not published", async () => {
    const res = await postJson("/api/sessions", alice.jar, {
      title: SUBMITTED_TITLE,
      description: `Temporary end-to-end test row (${LABEL}).`,
      track: "hidden",
      recurrence: "Weekly on Thursday",
      link: "https://example.invalid/e2e",
    })
    assert(res.status === 200, `POST /api/sessions returned ${res.status}: ${res.body.slice(0, 200)}`)
    const payload = safeJson(res.body) as { ok?: boolean; message?: string }
    assert(payload.ok === true, "the submission was not accepted")
    assert(
      /approve/i.test(payload.message ?? ""),
      `the response does not mention approval: ${payload.message}`
    )

    const { data } = await admin
      .from("school_sessions")
      .select("id, approved, source, submitted_by, track")
      .eq("title", SUBMITTED_TITLE)
    const rows = data ?? []
    assert(rows.length === 1, `expected 1 stored row, found ${rows.length}`)
    created.sessionIds.push(rows[0].id)
    assert(rows[0].approved === false, "a student submission was published without approval")
    assert(rows[0].source === "community", `source is ${rows[0].source}, expected community`)
    assert(rows[0].submitted_by === alice.id, "the submission is not attributed to the submitter")

    const schedule = await hit("/schedule", { jar: alice.jar })
    assert(!schedule.body.includes(SUBMITTED_TITLE), "an unapproved submission appeared on /schedule")
    return `stored unapproved as community, absent from /schedule ("${payload.message}")`
  })

  await check("a submission without a title is rejected", async () => {
    const res = await postJson("/api/sessions", alice.jar, { title: "  " })
    assert(res.status === 400, `returned ${res.status}, expected 400`)
    return "400 on a blank title"
  })

  // -- 8. Google OAuth start ------------------------------------------------
  section("8. Google Calendar OAuth")

  await check("the OAuth start endpoint sends the right consent request", async () => {
    const res = await hit("/api/calendar/google/start", { jar: bob.jar })
    assert(res.status >= 300 && res.status < 400, `returned ${res.status}, expected a redirect`)

    const target = new URL(res.location, BASE_URL)
    assert(
      target.host !== new URL(BASE_URL).host,
      `redirected back to the app (${target.pathname}${target.search}) instead of Google` +
        (target.search.includes("google_unconfigured")
          ? " - GOOGLE_CLIENT_ID/SECRET are not set on this deployment"
          : "")
    )
    assert(
      target.origin === "https://accounts.google.com",
      `redirected to ${target.origin}, expected https://accounts.google.com`
    )

    const q = target.searchParams
    assert(q.get("client_id"), "no client_id")
    assert(q.get("response_type") === "code", `response_type is ${q.get("response_type")}`)
    assert(
      q.get("redirect_uri") === `${BASE_URL}/api/calendar/google/callback`,
      `redirect_uri is ${q.get("redirect_uri")}`
    )
    const scope = q.get("scope") ?? ""
    assert(
      scope.includes("https://www.googleapis.com/auth/calendar.events.readonly"),
      `scope is missing calendar.events.readonly: ${scope}`
    )
    assert(
      !/auth\/calendar(\s|$)/.test(scope),
      `scope is broader than read-only events: ${scope}`
    )
    assert(q.get("access_type") === "offline", `access_type is ${q.get("access_type")}`)
    assert(q.get("prompt") === "consent", `prompt is ${q.get("prompt")}`)

    // CSRF: the state sent to Google must be the one pinned in the cookie.
    const state = q.get("state") ?? ""
    assert(state.length >= 16, `state is too short to be a CSRF guard: "${state}"`)
    const setCookies =
      typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : []
    const stateCookie = setCookies.find((c) => c.startsWith("calendar_oauth_state="))
    assert(stateCookie, "no calendar_oauth_state cookie was set")
    assert(
      stateCookie!.startsWith(`calendar_oauth_state=${state}`),
      "the state cookie does not match the state sent to Google"
    )
    assert(/httponly/i.test(stateCookie!), "the state cookie is not HttpOnly")
    return `accounts.google.com, read-only scope, offline+consent, state pinned to an HttpOnly cookie`
  })

  return baseline
}

// ---------------------------------------------------------------------------
// Counts and cleanup
// ---------------------------------------------------------------------------

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const [table, idColumn] of [
    ["profiles", "id"],
    ["school_sessions", "id"],
    ["calendar_events", "id"],
    ["calendar_connections", "user_id"],
    ["verifications", "id"],
  ] as const) {
    const { count } = await admin.from(table).select(idColumn, { count: "exact", head: true })
    out[table] = count ?? -1
  }
  return out
}

/**
 * Deletes exactly what this run created, by id or by run label. Runs even when a
 * check throws, so a failed run does not leave rows in a production database.
 */
async function cleanup() {
  section("Cleanup")
  const ids = created.userIds
  const problems: string[] = []

  const step = async (what: string, fn: () => PromiseLike<{ error: unknown }>) => {
    const { error } = await fn()
    if (error) problems.push(`${what}: ${(error as { message?: string }).message}`)
  }

  if (ids.length > 0) {
    await step("calendar_events", () => admin.from("calendar_events").delete().in("user_id", ids))
    await step("calendar_connections", () =>
      admin.from("calendar_connections").delete().in("user_id", ids)
    )
    await step("verifications", () => admin.from("verifications").delete().in("user_id", ids))
    await step("submitted sessions", () =>
      admin.from("school_sessions").delete().in("submitted_by", ids)
    )
  }
  await step("calendar sessions", () =>
    admin.from("school_sessions").delete().in("calendar_key", created.calendarKeys)
  )
  if (created.sessionIds.length > 0) {
    await step("session rows", () =>
      admin.from("school_sessions").delete().in("id", created.sessionIds)
    )
  }
  if (ids.length > 0) {
    await step("profiles", () => admin.from("profiles").delete().in("id", ids))
  }

  for (const [index, id] of ids.entries()) {
    const email = created.emails[index]
    if (PROTECTED_EMAILS.has(email)) {
      problems.push(`refused to delete protected account ${email}`)
      continue
    }
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) problems.push(`auth user ${email}: ${error.message}`)
  }

  console.log(`  ${DIM}deleted ${ids.length} users, their profiles, calendars, and sessions${RESET}`)
  if (problems.length > 0) {
    for (const problem of problems) console.log(`  ${RED}cleanup problem${RESET} ${problem}`)
  }
  return problems
}

/** Proves the database is back where it started, not just that deletes ran. */
async function verifyNoResidue(baseline: Record<string, number> | undefined) {
  const leftovers: string[] = []

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 })
  const strayUsers = (users?.users ?? []).filter((u) => (u.email ?? "").startsWith(`${LABEL}-`))
  if (strayUsers.length > 0) leftovers.push(`${strayUsers.length} auth users`)

  if (created.userIds.length > 0) {
    for (const [table, column] of [
      ["profiles", "id"],
      ["calendar_events", "user_id"],
      ["calendar_connections", "user_id"],
      ["verifications", "user_id"],
    ] as const) {
      const { data } = await admin.from(table).select(column).in(column, created.userIds)
      if ((data ?? []).length > 0) leftovers.push(`${(data ?? []).length} ${table} rows`)
    }
  }

  const { data: sessions } = await admin
    .from("school_sessions")
    .select("id, title")
    .or(`title.ilike.%${LABEL}%,title.ilike.%${RUN}%`)
  if ((sessions ?? []).length > 0) leftovers.push(`${(sessions ?? []).length} school_sessions rows`)

  await check("the run left no residue behind", () => {
    assert(leftovers.length === 0, `still present: ${leftovers.join(", ")}`)
    return "no test users, profiles, calendar rows, or sessions remain"
  })

  if (baseline) {
    const after = await counts()
    const drift = Object.keys(baseline)
      .filter((table) => baseline[table] !== after[table])
      .map((table) => `${table} ${baseline[table]}->${after[table]}`)
    if (drift.length > 0) {
      warn(`row counts moved during the run (${drift.join(", ")}) - expected only if the site was in use`)
    } else {
      console.log(`  ${DIM}row counts identical to the start of the run${RESET}`)
    }
  }
}

// ---------------------------------------------------------------------------

async function run() {
  let baseline: Record<string, number> | undefined
  let fatal: unknown

  try {
    baseline = await main()
  } catch (err) {
    fatal = err
    record("the run completed", false, err instanceof Error ? err.message : String(err))
  } finally {
    try {
      const problems = await cleanup()
      await verifyNoResidue(baseline)
      if (problems.length > 0) record("cleanup completed without errors", false, problems.join(" | "))
    } catch (err) {
      record("cleanup completed without errors", false, err instanceof Error ? err.message : String(err))
    }
  }

  const failed = results.filter((r) => !r.ok)
  console.log(
    `\n${BOLD}${results.length - failed.length}/${results.length} checks passed${RESET}` +
      (warnings.length > 0 ? ` ${DIM}(${warnings.length} note${warnings.length === 1 ? "" : "s"})${RESET}` : "")
  )
  if (failed.length > 0) {
    console.log(`${RED}Failed:${RESET}`)
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  }
  if (fatal instanceof Error && fatal.stack) console.log(`\n${DIM}${fatal.stack}${RESET}`)

  process.exit(failed.length > 0 ? 1 : 0)
}

run()
