import type { Metadata } from "next"
import Link from "next/link"

import { Locked } from "@/components/locked"
import { getCurrentUser, isVerified } from "@/lib/auth"
import {
  clusterByTime,
  getSchedule,
  isLogistics,
  type ScheduleSession,
} from "@/lib/schedule"

import { SubmitSessionForm } from "./submit-form"

export const metadata: Metadata = {
  title: "Schedule",
  description:
    "Every round, the session you were assigned, and what else is running at the same time.",
}

const TYPE_NOTE: Record<string, string> = {
  arena: "Stadium talk · thousands of people, on headphones",
  suite: "Suite session · capacity-limited, meet a YC partner",
  symposium: "Symposium · capacity-limited, talk to people directly",
}

const fmt = (d: Date) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

function timeRange(s: ScheduleSession): string {
  if (!s.starts_at) return s.recurrence || "Time TBA"
  const start = new Date(s.starts_at)
  return s.ends_at ? `${fmt(start)} – ${fmt(new Date(s.ends_at))}` : fmt(start)
}

function dayHeading(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

/** Strips the "[Round 1] Arena Breakout:" prefix YC puts on invite titles. */
function cleanTitle(s: ScheduleSession): string {
  if (s.speaker) return s.speaker
  return s.title.replace(/^\[round \d+\]\s*/i, "").replace(/^arena breakout:\s*/i, "")
}

function subtitleOf(s: ScheduleSession): string {
  if (s.speaker_title) return s.speaker_title
  const m = s.title.match(/\(([^)]+)\)/)
  return m ? m[1] : ""
}

function venueOf(s: ScheduleSession): string {
  return s.venue || ""
}

function SessionCard({ s, assigned }: { s: ScheduleSession; assigned: boolean }) {
  const note = TYPE_NOTE[s.session_type ?? ""] ?? ""
  const subtitle = subtitleOf(s)
  const venue = venueOf(s)

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        assigned ? "border-orange bg-orange-soft" : "border-line hover:border-ink/25"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="leading-snug font-bold">{cleanTitle(s)}</h4>
        {assigned && (
          <span className="shrink-0 rounded-full bg-orange px-2 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase">
            Yours
          </span>
        )}
      </div>
      {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      {venue && (
        <p className="mt-2.5 font-mono text-[12px] tracking-wide uppercase">{venue}</p>
      )}
      {note && <p className="mt-1 text-[13px] text-muted">{note}</p>}
    </div>
  )
}

function Round({ sessions }: { sessions: ScheduleSession[] }) {
  const assigned = sessions.filter((s) => s.mine)
  const alternatives = sessions.filter((s) => !s.mine)
  const label =
    sessions.find((s) => s.round_label)?.round_label ||
    sessions.find((s) => /\[round \d+\]/i.test(s.title))?.title.match(/\[(round \d+)\]/i)?.[1] ||
    ""

  const intimate = assigned.some(
    (s) => s.session_type === "suite" || s.session_type === "symposium" ||
      /symposium|suite/i.test(`${s.title} ${s.venue}`)
  )

  return (
    <section className="rounded-xl border border-line p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2.5 font-bold tracking-tight capitalize">
          <span className="sq" aria-hidden />
          {label || cleanTitle(sessions[0])}
        </h3>
        <span className="font-mono text-[13px] text-muted">
          {timeRange(sessions[0])}
        </span>
      </div>

      {assigned.length > 0 && (
        <div className="grid gap-3">
          {assigned.map((s) => (
            <SessionCard key={s.id} s={s} assigned />
          ))}
        </div>
      )}

      {alternatives.length > 0 && (
        <>
          <p className="mt-4 mb-2 font-mono text-[12px] tracking-[0.1em] text-muted uppercase">
            {assigned.length > 0
              ? `Or walk into instead (${alternatives.length})`
              : `Running at this time (${alternatives.length})`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {alternatives.map((s) => (
              <SessionCard key={s.id} s={s} assigned={false} />
            ))}
          </div>
        </>
      )}

      {intimate && alternatives.length > 0 && (
        <p className="mt-4 border-l-2 border-orange pl-3 text-[13px] text-muted">
          Your session here is capacity-limited and intimate — direct access to a
          YC partner and the other people in the room. The alternatives are
          multi-thousand-person stadium talks. Swapping trades small-group access
          for a big-name stage.
        </p>
      )}
    </section>
  )
}

export default async function SchedulePage() {
  const { user, profile } = await getCurrentUser()
  if (!isVerified(profile)) {
    return <Locked pending={profile?.status === "pending"} />
  }

  const all = await getSchedule(user?.id ?? null)
  const sessions = all.filter((s) => !isLogistics(s))
  const logistics = all.filter((s) => isLogistics(s) && s.starts_at)
  const clusters = clusterByTime(sessions)

  const days = new Map<string, ScheduleSession[][]>()
  for (const cluster of clusters) {
    const key = dayHeading(cluster[0].starts_at!)
    if (!days.has(key)) days.set(key, [])
    days.get(key)!.push(cluster)
  }

  const logisticsByDay = new Map<string, ScheduleSession[]>()
  for (const l of logistics) {
    const key = dayHeading(l.starts_at!)
    if (!logisticsByDay.has(key)) logisticsByDay.set(key, [])
    logisticsByDay.get(key)!.push(l)
  }

  const mineCount = all.filter((s) => s.mine).length
  const choices = clusters.filter((c) => c.length > 1).length

  return (
    <div className="fade-up mx-auto max-w-3xl space-y-12 pt-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Schedule</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Your badge isn&apos;t checked at the door, so every round is a choice.
          Yours is marked — the rest is what you could walk into instead.
          {choices > 0 && ` ${choices} rounds have alternatives.`}
        </p>
        {mineCount === 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg bg-orange-soft px-4 py-3">
            <p className="flex-1 text-[15px]">
              Connect your calendar and we&apos;ll mark which session is yours in
              each round.
            </p>
            <Link href="/calendar" className="btn px-4 py-1.5 text-sm">
              Upload your schedule
            </Link>
          </div>
        )}
      </header>

      {days.size === 0 && (
        <p className="text-muted">
          Nothing scheduled yet. Connect a calendar or add a session below.
        </p>
      )}

      {[...days.entries()].map(([day, rounds]) => (
        <div key={day}>
          <h2 className="mb-4 text-xl font-bold tracking-tight">{day}</h2>
          <div className="space-y-4">
            {rounds.map((cluster, i) => (
              <Round key={i} sessions={cluster} />
            ))}
          </div>

          {(logisticsByDay.get(day) ?? []).length > 0 && (
            <details className="mt-4 rounded-lg border border-line px-4 py-3">
              <summary className="cursor-pointer font-mono text-[12px] tracking-[0.08em] text-muted uppercase">
                Timings and breaks ({(logisticsByDay.get(day) ?? []).length})
              </summary>
              <ul className="mt-3 space-y-1.5">
                {(logisticsByDay.get(day) ?? []).map((l) => (
                  <li key={l.id} className="flex gap-3 text-[14px]">
                    <span className="w-20 shrink-0 font-mono text-[12px] text-muted">
                      {fmt(new Date(l.starts_at!))}
                    </span>
                    <span className="text-muted">{l.title}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}

      <section>
        <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="sq" aria-hidden />
          Found a session we&apos;re missing?
        </h2>
        <SubmitSessionForm />
      </section>
    </div>
  )
}
