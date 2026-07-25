import type { Metadata } from "next"
import Link from "next/link"

import { Locked } from "@/components/locked"
import { getCurrentUser, isVerified } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase/server"

import { SubmitSessionForm } from "./submit-form"

export const metadata: Metadata = {
  title: "Schedule",
}

interface SchoolSession {
  id: string
  title: string
  description: string
  track: "standard" | "hidden"
  source: "curated" | "community" | "calendar"
  starts_at: string | null
  recurrence: string
  link: string
}

function formatWhen(s: SchoolSession): string {
  if (s.recurrence) return s.recurrence
  if (!s.starts_at) return "Time TBA"
  return new Date(s.starts_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
}

function SessionList({ sessions }: { sessions: SchoolSession[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted">Nothing here yet.</p>
  }
  return (
    <ul className="space-y-3">
      {sessions.map((s) => (
        <li key={s.id} className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold">{s.title}</h3>
            <span className="font-mono text-[12px] tracking-wide text-muted uppercase">
              {formatWhen(s)}
            </span>
          </div>
          {s.description && (
            <p className="mt-1.5 text-[15px] text-muted">{s.description}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-[13px]">
            {s.source === "community" && (
              <span className="rounded-full bg-orange-soft px-2.5 py-0.5 font-medium text-orange-dark">
                community find
              </span>
            )}
            {s.source === "calendar" && (
              <span className="rounded-full bg-orange-soft px-2.5 py-0.5 font-medium text-orange-dark">
                from calendars
              </span>
            )}
            {s.link && (
              <a
                href={s.link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-orange-dark hover:underline"
              >
                Details ↗
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export default async function SchedulePage() {
  const { profile } = await getCurrentUser()
  if (!isVerified(profile)) {
    return <Locked pending={profile?.status === "pending"} />
  }

  const admin = supabaseAdmin()
  const { data } = await admin
    .from("school_sessions")
    .select("id, title, description, track, source, starts_at, recurrence, link")
    .eq("approved", true)
    .order("starts_at", { ascending: true, nullsFirst: false })

  const sessions = (data ?? []) as SchoolSession[]
  const standard = sessions.filter((s) => s.track === "standard")
  const hidden = sessions.filter((s) => s.track === "hidden")

  return (
    <div className="fade-up mx-auto max-w-3xl space-y-12 pt-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Schedule</h1>
        <p className="mt-2 text-muted">
          The standard session tracks, plus the ones that don&apos;t show up on
          the default calendar. Found one we&apos;re missing? Add it below.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg bg-orange-soft px-4 py-3">
          <p className="flex-1 text-[15px]">
            Connect your Google Calendar and every student&apos;s YC invites
            merge into this schedule automatically.
          </p>
          <Link href="/calendar" className="btn px-4 py-1.5 text-sm">
            Upload your schedule
          </Link>
        </div>
      </header>

      <section>
        <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="sq" aria-hidden />
          Standard sessions
        </h2>
        <SessionList sessions={standard} />
      </section>

      <section>
        <h2 className="mb-1 flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="sq" aria-hidden />
          Hidden sessions
        </h2>
        <p className="mb-4 text-sm text-muted">
          Office hours, pop-up sessions, regional meetups, deadline windows —
          curated by us and submitted by students.
        </p>
        <SessionList sessions={hidden} />
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="sq" aria-hidden />
          Found a session?
        </h2>
        <SubmitSessionForm />
      </section>
    </div>
  )
}
