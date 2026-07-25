// A calendar event normalized out of either source (Google API or .ics file)
// before it reaches the YC filter and the database.
export interface RawEvent {
  uid: string
  title: string
  description: string
  location: string
  startsAt: string | null
  endsAt: string | null
  recurrence: string
  link: string
  organizer: string
}

const YC_DOMAINS = /(ycombinator\.com|startupschool\.org)/i
const YC_TITLE = /\b(startup school|y[\s-]?combinator)\b/i

/**
 * Decides whether an event belongs to Startup School.
 *
 * Deliberately conservative: it matches a YC domain in the event's structured
 * metadata, or a YC name in the title — never free text in the description.
 * A looser rule would sweep personal events ("apply to startup school") into a
 * shared database, and every stored event is one we promised not to keep.
 */
export function isStartupSchoolEvent(event: RawEvent): boolean {
  const metadata = `${event.organizer} ${event.link} ${event.location}`
  if (YC_DOMAINS.test(metadata)) return true
  if (YC_DOMAINS.test(event.title)) return true
  return YC_TITLE.test(event.title)
}

/**
 * The dedup key that makes cross-student corroboration work. Google gives every
 * attendee of the same invite an identical iCalUID, so two students who were
 * both invited to a session produce the same key. Falls back to title + start
 * time for events that arrive without one.
 */
export function calendarKey(event: RawEvent): string {
  if (event.uid) return event.uid.trim().toLowerCase()
  const title = event.title.trim().toLowerCase().replace(/\s+/g, " ")
  return `fallback:${title}|${event.startsAt ?? "no-start"}`
}
