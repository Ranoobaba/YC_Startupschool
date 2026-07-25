import { supabaseAdmin } from "@/lib/supabase/server"

import { calendarKey, isStartupSchoolEvent, type RawEvent } from "./types"

export interface IngestResult {
  scanned: number
  kept: number
  discovered: number
}

/**
 * Filters a student's raw calendar down to Startup School events, stores those
 * (and only those), then re-runs the shared aggregation so newly corroborated
 * sessions reach the public schedule.
 */
export async function ingestEvents(
  userId: string,
  provider: "google" | "ics",
  raw: RawEvent[]
): Promise<IngestResult> {
  const admin = supabaseAdmin()

  const matched = raw.filter(isStartupSchoolEvent)

  // Deduplicate within this one calendar before writing: the unique index is
  // (user_id, calendar_key), and a single upsert batch cannot touch the same
  // key twice.
  const byKey = new Map<string, RawEvent>()
  for (const event of matched) {
    byKey.set(calendarKey(event), event)
  }

  const rows = [...byKey.entries()].map(([key, event]) => ({
    user_id: userId,
    calendar_key: key,
    title: event.title,
    description: event.description,
    location: event.location,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    recurrence: event.recurrence,
    link: event.link,
    organizer: event.organizer,
    provider,
  }))

  // Replace this student's previous snapshot so events YC cancelled disappear.
  await admin.from("calendar_events").delete().eq("user_id", userId)
  if (rows.length > 0) {
    await admin
      .from("calendar_events")
      .upsert(rows, { onConflict: "user_id,calendar_key" })
  }

  await admin.from("calendar_connections").update({
    last_synced_at: new Date().toISOString(),
    event_count: rows.length,
  }).eq("user_id", userId)

  await admin.rpc("publish_calendar_sessions")

  // What this student gains: sessions on the shared schedule they do not have.
  const { data: published } = await admin
    .from("school_sessions")
    .select("calendar_key")
    .eq("approved", true)
    .not("calendar_key", "is", null)

  const discovered = (published ?? []).filter(
    (row) => row.calendar_key && !byKey.has(row.calendar_key)
  ).length

  return { scanned: raw.length, kept: rows.length, discovered }
}
