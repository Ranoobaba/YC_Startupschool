import type { Metadata } from "next"

import { Locked } from "@/components/locked"
import { getCurrentUser, isVerified } from "@/lib/auth"
import { googleConfigured } from "@/lib/calendar/google"
import { supabaseAdmin } from "@/lib/supabase/server"

import { ConnectPanel } from "./connect-panel"

export const metadata: Metadata = {
  title: "Your schedule",
  description:
    "Connect your calendar to see every Startup School session the community knows about — including the ones you weren't invited to.",
}

interface SessionRow {
  id: string
  title: string
  description: string
  starts_at: string | null
  recurrence: string
  link: string
  calendar_key: string | null
}

function when(session: SessionRow): string {
  if (session.recurrence) return session.recurrence
  if (!session.starts_at) return "Time TBA"
  return new Date(session.starts_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function SessionRows({ sessions }: { sessions: SessionRow[] }) {
  return (
    <ul className="space-y-3">
      {sessions.map((s) => (
        <li key={s.id} className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold">{s.title}</h3>
            <span className="font-mono text-[12px] tracking-wide text-muted uppercase">
              {when(s)}
            </span>
          </div>
          {s.description && (
            <p className="mt-1.5 line-clamp-2 text-[15px] text-muted">{s.description}</p>
          )}
          {s.link && (
            <a
              href={s.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-semibold text-orange-dark hover:underline"
            >
              Open ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const { user, profile } = await getCurrentUser()
  if (!user || !isVerified(profile)) {
    return <Locked pending={profile?.status === "pending"} />
  }

  const params = await searchParams
  const admin = supabaseAdmin()

  const [{ data: connection }, { data: mine }, { data: published }] = await Promise.all([
    admin
      .from("calendar_connections")
      .select("provider, google_email, last_synced_at, event_count")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin.from("calendar_events").select("calendar_key").eq("user_id", user.id),
    admin
      .from("school_sessions")
      .select("id, title, description, starts_at, recurrence, link, calendar_key")
      .eq("approved", true)
      .not("calendar_key", "is", null)
      .order("starts_at", { ascending: true, nullsFirst: false }),
  ])

  const myKeys = new Set((mine ?? []).map((row) => row.calendar_key))
  const all = (published ?? []) as SessionRow[]
  const onMyCalendar = all.filter((s) => s.calendar_key && myKeys.has(s.calendar_key))
  const missing = all.filter((s) => s.calendar_key && !myKeys.has(s.calendar_key))

  return (
    <div className="fade-up mx-auto max-w-3xl space-y-12 pt-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Your schedule, and everything around it.
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          YC drops Startup School sessions straight onto your Google Calendar —
          but only the ones you were invited to. Connect yours and you&apos;ll
          see every session the community collectively knows about.
        </p>
      </header>

      <ConnectPanel
        connection={connection ?? null}
        googleEnabled={googleConfigured()}
        justConnected={params.connected ?? null}
        error={params.error ?? null}
      />

      {connection && (
        <>
          <section>
            <h2 className="mb-1 flex items-center gap-2.5 text-xl font-bold tracking-tight">
              <span className="sq" aria-hidden />
              Sessions you&apos;re missing ({missing.length})
            </h2>
            <p className="mb-4 text-sm text-muted">
              On other students&apos; calendars, not on yours. This is the part
              you&apos;d never have found out about.
            </p>
            {missing.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing yet — you&apos;re on everything the community has found
                so far. Check back as more students connect.
              </p>
            ) : (
              <SessionRows sessions={missing} />
            )}
          </section>

          <section>
            <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
              <span className="sq" aria-hidden />
              Already on your calendar ({onMyCalendar.length})
            </h2>
            {onMyCalendar.length === 0 ? (
              <p className="text-sm text-muted">
                No Startup School events found in your calendar yet.
              </p>
            ) : (
              <SessionRows sessions={onMyCalendar} />
            )}
          </section>
        </>
      )}
    </div>
  )
}
