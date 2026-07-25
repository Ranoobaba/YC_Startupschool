"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

interface Connection {
  provider: string
  google_email: string
  last_synced_at: string | null
  event_count: number
}

const ERRORS: Record<string, string> = {
  google_unconfigured:
    "Google Calendar isn't set up on this deployment yet — upload a .ics export instead.",
  declined: "You declined the Google permission, so nothing was read.",
  bad_state: "That sign-in link expired. Try connecting again.",
  missing_calendar_scope:
    "Google didn't grant calendar access. On the permission screen, tick the box for seeing your calendar events — it isn't checked by default — then connect again.",
  token_exchange: "Google wouldn't complete the connection. Try again.",
  not_verified: "Verified members only.",
}

export function ConnectPanel({
  connection,
  googleEnabled,
  justConnected,
  error,
  compact = false,
}: {
  connection: Connection | null
  googleEnabled: boolean
  justConnected: string | null
  error: string | null
  /** Already contributing sessions: shrink to a status bar so the schedule leads. */
  compact?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState(
    justConnected ? `Connected — found ${justConnected} Startup School events.` : ""
  )
  const [problem, setProblem] = useState(error ? (ERRORS[error] ?? "Something went wrong.") : "")

  async function uploadIcs(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy("upload")
    setProblem("")
    setMessage("")

    const form = new FormData()
    form.set("calendar", file)
    const res = await fetch("/api/calendar/ics", { method: "POST", body: form })
    const data = await res.json()
    setBusy("")

    if (!res.ok) {
      setProblem(data.error ?? "Upload failed.")
      return
    }
    setMessage(
      `Read ${data.scanned} events, kept ${data.kept} Startup School ones. ${data.discovered} more sessions are waiting below.`
    )
    router.refresh()
  }

  async function post(path: string, label: string) {
    setBusy(label)
    setProblem("")
    setMessage("")
    const res = await fetch(path, { method: "POST" })
    const data = await res.json()
    setBusy("")
    if (!res.ok) {
      setProblem(data.error ?? "That didn't work.")
      return
    }
    if (label === "sync") {
      setMessage(`Synced — ${data.kept} Startup School events on your calendar.`)
    }
    router.refresh()
  }

  if (connection) {
    return (
      <div
        className={
          compact
            ? "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-bg-warm px-4 py-2.5"
            : "card"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={compact ? "text-sm font-medium" : "font-semibold"}>
              {connection.provider === "google"
                ? `Google Calendar connected${connection.google_email ? ` · ${connection.google_email}` : ""}`
                : "Calendar file uploaded"}
            </p>
            <p
              className={`mt-0.5 text-muted ${compact ? "text-[13px]" : "text-sm"}`}
            >
              {connection.event_count} Startup School events
              {connection.last_synced_at &&
                ` · updated ${new Date(connection.last_synced_at).toLocaleDateString()}`}
            </p>
          </div>
          <div className="flex gap-2">
            {connection.provider === "google" && (
              <button
                onClick={() => post("/api/calendar/sync", "sync")}
                disabled={busy !== ""}
                className="btn btn-outline px-4 py-1.5 text-sm"
              >
                {busy === "sync" ? "Syncing…" : "Sync now"}
              </button>
            )}
            <button
              onClick={() => post("/api/calendar/disconnect", "disconnect")}
              disabled={busy !== ""}
              className="btn btn-outline px-4 py-1.5 text-sm"
            >
              Disconnect
            </button>
          </div>
        </div>
        {message && (
          <p aria-live="polite" className="mt-3 text-sm text-green-700">{message}</p>
        )}
        {problem && (
          <p role="alert" aria-live="polite" className="mt-3 text-sm text-red-600">{problem}</p>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-xl font-bold tracking-tight">
        Upload your schedule to see the possibilities.
      </h2>
      <p className="mt-2 text-[15px] text-muted">
        We read <strong>only</strong> your Startup School events — everything
        personal is ignored and never stored. What you share is anonymous: other
        students see that a session exists, never that it&apos;s on your
        calendar. Disconnect any time and your events are deleted.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {googleEnabled && (
          <a href="/api/calendar/google/start" className="btn">
            Upload your schedule
          </a>
        )}
        <label className={googleEnabled ? "btn btn-outline" : "btn"}>
          {busy === "upload"
            ? "Reading…"
            : googleEnabled
              ? "or upload a .ics file"
              : "Upload your schedule (.ics)"}
          <input
            type="file"
            accept=".ics,text/calendar"
            onChange={uploadIcs}
            disabled={busy !== ""}
            className="hidden"
          />
        </label>
      </div>

      {!googleEnabled && (
        <p className="mt-3 text-sm text-muted">
          In Google Calendar: Settings → Import &amp; export → Export, then
          upload the .ics file from inside the .zip.
        </p>
      )}
      {message && (
          <p aria-live="polite" className="mt-3 text-sm text-green-700">{message}</p>
        )}
      {problem && (
          <p role="alert" aria-live="polite" className="mt-3 text-sm text-red-600">{problem}</p>
        )}
    </div>
  )
}
