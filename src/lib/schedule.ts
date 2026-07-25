import { supabaseAdmin } from "@/lib/supabase/server"

export interface ScheduleSession {
  id: string
  title: string
  description: string
  track: "standard" | "hidden"
  source: "curated" | "community" | "calendar"
  starts_at: string | null
  ends_at: string | null
  recurrence: string
  link: string
  calendar_key: string | null
  speaker: string
  speaker_title: string
  venue: string
  round_label: string
  session_type: string
  /** On this student's own calendar. */
  mine: boolean
}

/**
 * Sessions for the shared schedule, plus this student's own calendar events
 * even when no second student has corroborated them yet.
 *
 * The two-student rule decides what gets *published to everyone*; it should
 * never hide a student's own calendar from them. Without this the first person
 * to connect contributes everything and sees nothing.
 */
export async function getSchedule(userId: string | null): Promise<ScheduleSession[]> {
  const admin = supabaseAdmin()

  const [{ data: published }, { data: own }] = await Promise.all([
    admin
      .from("school_sessions")
      .select(
        "id, title, description, track, source, starts_at, ends_at, recurrence, link, calendar_key, speaker, speaker_title, venue, round_label, session_type"
      )
      .eq("approved", true),
    userId
      ? admin.from("calendar_events").select("calendar_key").eq("user_id", userId)
      : Promise.resolve({ data: [] as { calendar_key: string }[] }),
  ])

  const myKeys = new Set((own ?? []).map((r) => r.calendar_key))
  const rows = [...((published ?? []) as Omit<ScheduleSession, "mine">[])]
  const seen = new Set(rows.map((r) => r.id))

  // Pull in the student's own not-yet-corroborated sessions.
  if (myKeys.size > 0) {
    const { data: mine } = await admin
      .from("school_sessions")
      .select(
        "id, title, description, track, source, starts_at, ends_at, recurrence, link, calendar_key, speaker, speaker_title, venue, round_label, session_type"
      )
      .in("calendar_key", [...myKeys])

    for (const row of (mine ?? []) as Omit<ScheduleSession, "mine">[]) {
      if (!seen.has(row.id)) {
        rows.push(row)
        seen.add(row.id)
      }
    }
  }

  return rows
    .map((row) => ({
      ...row,
      mine: row.calendar_key ? myKeys.has(row.calendar_key) : false,
    }))
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""))
}

function endOf(session: ScheduleSession): number {
  const start = new Date(session.starts_at!).getTime()
  if (!session.ends_at) return start + 60 * 60 * 1000
  return Math.max(new Date(session.ends_at).getTime(), start + 15 * 60 * 1000)
}

/**
 * Groups sessions that run at overlapping times.
 *
 * YC runs the same session across many parallel slots, so a cluster of more
 * than one is exactly the question a student has: "what else is on when mine
 * is?" Everything in a cluster is an alternative to everything else in it.
 */
export function clusterByTime(sessions: ScheduleSession[]): ScheduleSession[][] {
  const timed = sessions
    .filter((s) => s.starts_at)
    .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))

  const clusters: ScheduleSession[][] = []
  let current: ScheduleSession[] = []
  let clusterEnd = 0

  for (const session of timed) {
    const start = new Date(session.starts_at!).getTime()
    if (current.length > 0 && start < clusterEnd) {
      current.push(session)
      clusterEnd = Math.max(clusterEnd, endOf(session))
    } else {
      if (current.length > 0) clusters.push(current)
      current = [session]
      clusterEnd = endOf(session)
    }
  }
  if (current.length > 0) clusters.push(current)

  return clusters
}

export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Calendar weeks (Sunday-first) covering the given month. */
export function monthMatrix(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const cursor = new Date(first)
  cursor.setDate(1 - first.getDay())

  const weeks: Date[][] = []
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
    // Stop once we've covered the month and finished a week.
    if (cursor.getMonth() !== month && cursor > new Date(year, month + 1, 0)) break
  }
  return weeks
}

// Time formatting lives here, not in pages: the conversion was previously
// duplicated across two pages and only one got fixed, leaving every slot on
// the other seven hours out. The event runs in San Francisco; the server runs
// in UTC, so every rendered time must name the zone explicitly.
export const EVENT_TZ = "America/Los_Angeles"

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TZ,
  })
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: EVENT_TZ,
  })
}

export function timeRangeLabel(
  startsAt: string | null,
  endsAt: string | null,
  recurrence = ""
): string {
  if (!startsAt) return recurrence || "Time TBA"
  return endsAt
    ? `${clockTime(startsAt)} – ${clockTime(endsAt)}`
    : clockTime(startsAt)
}

/**
 * Logistics rather than a session you choose: transitions, meals, arrivals,
 * and the all-day container event. Worth showing on the timeline, but they are
 * not decisions, so they should not render as round cards with alternatives.
 */
export function isLogistics(session: ScheduleSession): boolean {
  const title = session.title.trim().toLowerCase()
  return /^(transition|lunch|breakfast|dinner|arrivals|registration|check[- ]?in|doors|day \w+ concludes?|event concludes?|startup school \d{4}$)/.test(
    title
  ) || /concludes?$/.test(title)
}
