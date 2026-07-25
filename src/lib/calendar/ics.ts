import type { RawEvent } from "./types"

/**
 * Minimal iCalendar parser for Google Calendar .ics exports.
 *
 * Scope is deliberately narrow: enough to read VEVENTs out of a Google export,
 * not a general-purpose RFC 5545 implementation. Recurring events are kept as
 * their master entry plus a human-readable rule rather than being expanded.
 */

// Offset of `timeZone` from UTC at a given instant, via the formatter trick:
// render the instant in that zone, read it back as if it were UTC, subtract.
function zoneOffset(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs))

  const at: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== "literal") at[part.type] = Number(part.value)
  }
  // hour can come back as 24 for midnight in some engines.
  const asUtc = Date.UTC(
    at.year,
    at.month - 1,
    at.day,
    at.hour % 24,
    at.minute,
    at.second
  )
  return asUtc - utcMs
}

function parseIcsDate(value: string, tzid: string | null): string | null {
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/
  )
  if (!match) return null

  const [, y, mo, d, h = "0", mi = "0", s = "0", zulu] = match
  const wallClock = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)

  // Already UTC, or a date-only value we treat as UTC midnight.
  if (zulu || !tzid) return new Date(wallClock).toISOString()

  try {
    // Two passes: the first offset is measured at the wrong instant when the
    // event sits near a DST boundary, so re-measure after correcting once.
    let utc = wallClock - zoneOffset(wallClock, tzid)
    utc = wallClock - zoneOffset(utc, tzid)
    return new Date(utc).toISOString()
  } catch {
    return new Date(wallClock).toISOString()
  }
}

const DAY_NAMES: Record<string, string> = {
  MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday",
  FR: "Friday", SA: "Saturday", SU: "Sunday",
}

function describeRecurrence(rrule: string): string {
  const rules: Record<string, string> = {}
  for (const pair of rrule.split(";")) {
    const [key, value] = pair.split("=")
    if (key && value) rules[key.toUpperCase()] = value
  }

  const cadence = {
    DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Yearly",
  }[rules.FREQ] ?? ""
  if (!cadence) return ""

  const days = (rules.BYDAY ?? "")
    .split(",")
    .map((d) => DAY_NAMES[d.replace(/^[+-]?\d/, "")])
    .filter(Boolean)

  return days.length > 0 ? `${cadence} on ${days.join(", ")}` : cadence
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
}

export function parseIcs(source: string): RawEvent[] {
  // Unfold: continuation lines begin with a space or tab.
  const lines = source
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")

  const events: RawEvent[] = []
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {}
      continue
    }
    if (line === "END:VEVENT") {
      if (current) events.push(toRawEvent(current))
      current = null
      continue
    }
    if (!current) continue

    const colon = line.indexOf(":")
    if (colon === -1) continue

    const rawName = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const [name, ...paramParts] = rawName.split(";")

    const params: Record<string, string> = {}
    for (const part of paramParts) {
      const eq = part.indexOf("=")
      if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1)
    }

    current[name.toUpperCase()] = { value, params }
  }

  return events
}

function toRawEvent(
  fields: Record<string, { value: string; params: Record<string, string> }>
): RawEvent {
  const get = (key: string) => fields[key]?.value ?? ""
  const start = fields.DTSTART
  const end = fields.DTEND

  return {
    uid: get("UID"),
    title: unescapeText(get("SUMMARY")),
    description: unescapeText(get("DESCRIPTION")).slice(0, 1000),
    location: unescapeText(get("LOCATION")).slice(0, 300),
    startsAt: start ? parseIcsDate(start.value, start.params.TZID ?? null) : null,
    endsAt: end ? parseIcsDate(end.value, end.params.TZID ?? null) : null,
    recurrence: get("RRULE") ? describeRecurrence(get("RRULE")) : "",
    link: (get("URL") || extractUrl(get("DESCRIPTION"))).slice(0, 500),
    organizer: get("ORGANIZER").slice(0, 300),
  }
}

function extractUrl(text: string): string {
  return text.match(/https?:\/\/[^\s<>"\\]+/)?.[0] ?? ""
}
