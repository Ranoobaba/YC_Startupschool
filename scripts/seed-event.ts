/**
 * Adds the Arena breakout ALTERNATIVES to the schedule.
 *
 * Attendees' own assigned sessions already arrive from their Google Calendars,
 * so this only seeds the parallel tracks nobody was assigned — the sessions you
 * could walk into instead. Times match the existing round slots exactly so the
 * schedule view clusters each alternative against the assigned session.
 *
 * Run with:  set -a; . ./.env.local; set +a; npx tsx scripts/seed-event.ts
 */
import { createClient } from "@supabase/supabase-js"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Event runs in San Francisco; slots below are Pacific.
function pt(day: "2026-07-25" | "2026-07-26", hhmm: string): string {
  return new Date(`${day}T${hhmm}:00-07:00`).toISOString()
}

// Placeholder rows invented before the real programme was known.
const FAKE_TITLES = [
  "Startup School kickoff",
  "Weekly group session",
  "Office hours with a YC partner",
]

interface Alt {
  speaker: string
  speaker_title: string
  venue: string
  round_label: string
  day: "2026-07-25" | "2026-07-26"
  start: string
  end: string
}

const ALTERNATIVES: Alt[] = [
  // Day 1 — Saturday 25 July
  {
    speaker: "Jeff Dean",
    speaker_title: "Chief Scientist, Google DeepMind & Google Research",
    venue: "Center Court: East",
    round_label: "Round 1",
    day: "2026-07-25", start: "13:30", end: "14:30",
  },
  {
    speaker: "Blake Scholl",
    speaker_title: "Founder & CEO, Boom Supersonic",
    venue: "Center Court: East",
    round_label: "Round 2",
    day: "2026-07-25", start: "15:00", end: "16:00",
  },
  {
    speaker: "Dmitri Dolgov",
    speaker_title: "Co-CEO, Waymo",
    venue: "Center Court: West",
    round_label: "Round 2",
    day: "2026-07-25", start: "15:00", end: "16:00",
  },
  {
    speaker: "Michael Kratsios",
    speaker_title: "Director, White House Office of Science and Technology Policy",
    venue: "Center Court: East",
    round_label: "Round 3",
    day: "2026-07-25", start: "16:30", end: "17:30",
  },
  // Day 2 — Sunday 26 July
  {
    speaker: "Max Junestrand",
    speaker_title: "Co-Founder & CEO, Legora",
    venue: "Center Court: East",
    round_label: "Round 1",
    day: "2026-07-26", start: "14:00", end: "15:00",
  },
  {
    speaker: "Max Hodak",
    speaker_title: "Co-founder & CEO, Science",
    venue: "Center Court: East",
    round_label: "Round 2",
    day: "2026-07-26", start: "15:30", end: "16:30",
  },
  {
    speaker: "Chelsea Finn",
    speaker_title: "Stanford / Physical Intelligence",
    venue: "Center Court: West",
    round_label: "Round 2",
    day: "2026-07-26", start: "15:30", end: "16:30",
  },
]

async function main() {
  // Remove the invented placeholders so they stop polluting the schedule.
  for (const title of FAKE_TITLES) {
    const { error } = await db
      .from("school_sessions")
      .delete()
      .eq("title", title)
      .eq("source", "curated")
      .is("calendar_key", null)
    if (error) console.log(`  could not remove "${title}": ${error.message}`)
    else console.log(`  removed placeholder "${title}"`)
  }

  for (const a of ALTERNATIVES) {
    const key = `ss2026-alt:${a.day}:${a.start}:${a.venue}:${a.speaker}`
      .toLowerCase()
      .replace(/\s+/g, "-")

    const row = {
      title: `[${a.round_label}] Arena Breakout: ${a.speaker}`,
      description:
        "Arena breakout — a stadium talk heard on headphones. Nobody checks your badge at the door.",
      track: "standard" as const,
      source: "curated" as const,
      approved: true,
      starts_at: pt(a.day, a.start),
      ends_at: pt(a.day, a.end),
      recurrence: "",
      link: "",
      calendar_key: key,
      speaker: a.speaker,
      speaker_title: a.speaker_title,
      venue: a.venue,
      round_label: a.round_label,
      session_type: "arena",
    }

    const { data: existing } = await db
      .from("school_sessions")
      .select("id")
      .eq("calendar_key", key)
      .maybeSingle()

    if (existing) {
      await db.from("school_sessions").update(row).eq("id", existing.id)
      console.log(`  updated  ${a.speaker} (${a.venue})`)
    } else {
      const { error } = await db.from("school_sessions").insert(row)
      if (error) console.log(`  FAILED ${a.speaker}: ${error.message}`)
      else console.log(`  added    ${a.speaker} (${a.venue})`)
    }
  }

  console.log(`\nseeded ${ALTERNATIVES.length} alternatives across 5 rounds`)
}

main().catch((e) => {
  console.error("FAILED:", e.message)
  process.exit(1)
})
