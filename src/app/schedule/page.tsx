import type { Metadata } from "next"

import { Locked } from "@/components/locked"
import { getCurrentUser, isVerified } from "@/lib/auth"
import { googleConfigured } from "@/lib/calendar/google"
import {
  clockTime,
  clusterByTime,
  dayLabel,
  getSchedule,
  isLogistics,
  timeRangeLabel,
  type ScheduleSession,
} from "@/lib/schedule"
import { supabaseAdmin } from "@/lib/supabase/server"

import { ConnectPanel } from "../calendar/connect-panel"
import { SubmitSessionForm } from "./submit-form"

export const metadata: Metadata = {
  title: "Schedule",
  description:
    "Your assigned sessions and every alternative running at the same time.",
}

const FORMAT_NOTE: Record<string, string> = {
  arena: "Stadium talk, on headphones",
  suite: "Small suite session with a YC partner",
  symposium: "Poster session — talk to people directly",
}

/** Strips the "[Round 1] Arena Breakout:" prefix from YC invite titles. */
function displayName(s: ScheduleSession): string {
  if (s.speaker) return s.speaker
  return s.title
    .replace(/^\[round \d+\]\s*/i, "")
    .replace(/^arena breakout:\s*/i, "")
    .trim()
}

function subtitle(s: ScheduleSession): string {
  if (s.speaker_title) return s.speaker_title
  const m = s.title.match(/\(([^)]+)\)/)
  return m ? m[1] : ""
}

function roundName(sessions: ScheduleSession[]): string {
  const explicit = sessions.find((s) => s.round_label)?.round_label
  if (explicit) return explicit
  const fromTitle = sessions
    .map((s) => s.title.match(/\[(round \d+)\]/i)?.[1])
    .find(Boolean)
  return fromTitle ? fromTitle.replace(/^\w/, (c) => c.toUpperCase()) : ""
}

/**
 * One option within a round. Every option renders identically apart from the
 * marker, so the comparison is like-for-like rather than yours-then-the-rest.
 */
function Option({ s }: { s: ScheduleSession }) {
  const note = FORMAT_NOTE[s.session_type] ?? ""
  const sub = subtitle(s)

  return (
    <div
      className={`flex flex-col rounded-lg border p-4 ${
        s.mine
          ? "border-orange bg-orange-soft"
          : "border-line bg-bg hover:border-ink/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 text-[17px] leading-tight font-bold break-words">
          {displayName(s)}
        </h4>
        {s.mine && (
          <span className="shrink-0 rounded-full bg-orange px-2 py-0.5 text-[10px] font-bold tracking-[0.06em] text-white uppercase">
            Yours
          </span>
        )}
      </div>

      {sub && <p className="mt-1 text-[13px] leading-snug text-muted">{sub}</p>}

      <div className="mt-auto pt-3">
        {s.venue && (
          <p className="font-mono text-[11px] font-medium tracking-[0.06em] uppercase">
            {s.venue}
          </p>
        )}
        {note && <p className="mt-0.5 text-[12px] text-muted">{note}</p>}
      </div>
    </div>
  )
}

function Round({ sessions }: { sessions: ScheduleSession[] }) {
  const label = roundName(sessions)
  const mine = sessions.filter((s) => s.mine)
  const others = sessions.filter((s) => !s.mine)
  // Yours first, so the comparison starts from what you were given.
  const ordered = [...mine, ...others]

  const tradeOff = mine.some(
    (s) => s.session_type === "suite" || s.session_type === "symposium"
  )

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 text-[15px] font-bold">
          <span className="sq" aria-hidden />
          {label || displayName(sessions[0])}
        </h3>
        <span className="tnum font-mono text-[12px] text-muted">
          {timeRangeLabel(sessions[0].starts_at, sessions[0].ends_at)}
        </span>
      </div>

      <div
        className={`grid gap-3 ${
          ordered.length > 2
            ? "sm:grid-cols-3"
            : ordered.length === 2
              ? "sm:grid-cols-2"
              : ""
        }`}
      >
        {ordered.map((s) => (
          <Option key={s.id} s={s} />
        ))}
      </div>

      {tradeOff && others.length > 0 && (
        <p className="mt-2.5 border-l-2 border-orange pl-3 text-[13px] text-muted">
          Yours is capacity-limited — direct access to a YC partner and the
          people in the room. The alternatives are multi-thousand-person stadium
          talks.
        </p>
      )}
    </section>
  )
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const { user, profile } = await getCurrentUser()
  if (!isVerified(profile)) {
    return <Locked pending={profile?.status === "pending"} />
  }

  const params = await searchParams
  const admin = supabaseAdmin()

  const [all, { data: connection }] = await Promise.all([
    getSchedule(user?.id ?? null),
    admin
      .from("calendar_connections")
      .select("provider, google_email, last_synced_at, event_count")
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
  ])

  const sessions = all.filter((s) => !isLogistics(s))
  const logistics = all.filter((s) => isLogistics(s) && s.starts_at)
  const clusters = clusterByTime(sessions)

  const days = new Map<string, ScheduleSession[][]>()
  for (const c of clusters) {
    const key = dayLabel(c[0].starts_at!)
    if (!days.has(key)) days.set(key, [])
    days.get(key)!.push(c)
  }

  const logisticsByDay = new Map<string, ScheduleSession[]>()
  for (const l of logistics) {
    const key = dayLabel(l.starts_at!)
    if (!logisticsByDay.has(key)) logisticsByDay.set(key, [])
    logisticsByDay.get(key)!.push(l)
  }

  const mineCount = all.filter((s) => s.mine).length
  const withChoices = clusters.filter((c) => c.length > 1).length

  return (
    <div className="fade-up mx-auto max-w-4xl space-y-10 pt-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Your potential schedule
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Nobody checks your badge at the door. Each round shows what you were
          assigned alongside everything else running at that time, so you can
          pick rather than follow.
          {withChoices > 0 && (
            <>
              {" "}
              <strong className="text-ink">
                {withChoices} {withChoices === 1 ? "round has" : "rounds have"}{" "}
                alternatives.
              </strong>
            </>
          )}
        </p>
      </header>

      <ConnectPanel
        connection={connection ?? null}
        googleEnabled={googleConfigured()}
        justConnected={params.connected ?? null}
        error={params.error ?? null}
        compact={mineCount > 0}
      />

      {days.size === 0 && (
        <p className="text-muted">
          Nothing scheduled yet. Connect your calendar above, or add a session
          at the bottom of this page.
        </p>
      )}

      {[...days.entries()].map(([day, rounds]) => (
        <div key={day} className="space-y-6">
          <h2 className="border-b border-line pb-2 text-xl font-bold tracking-tight">
            {day}
          </h2>
          {rounds.map((cluster, i) => (
            <Round key={i} sessions={cluster} />
          ))}

          {(logisticsByDay.get(day) ?? []).length > 0 && (
            <details className="rounded-lg border border-line px-4 py-3">
              <summary className="cursor-pointer font-mono text-[12px] tracking-[0.08em] text-muted uppercase">
                Timings and breaks ({(logisticsByDay.get(day) ?? []).length})
              </summary>
              <ul className="mt-3 space-y-1.5">
                {(logisticsByDay.get(day) ?? []).map((l) => (
                  <li key={l.id} className="flex gap-3 text-[14px]">
                    <span className="tnum w-20 shrink-0 font-mono text-[12px] text-muted">
                      {clockTime(l.starts_at!)}
                    </span>
                    <span className="text-muted">{l.title}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}

      <section className="border-t border-line pt-8">
        <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="sq" aria-hidden />
          Found a session we&apos;re missing?
        </h2>
        <SubmitSessionForm />
      </section>
    </div>
  )
}
