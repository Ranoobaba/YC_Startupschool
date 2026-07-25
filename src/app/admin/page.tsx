import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase/server"

import { addStudent, reviewSession, reviewVerification } from "./actions"

export const metadata: Metadata = {
  title: "Admin",
}

export default async function AdminPage() {
  const { profile } = await getCurrentUser()
  if (profile?.role !== "admin") redirect("/")

  const admin = supabaseAdmin()

  const [{ data: pendingVerifications }, { data: pendingSessions }, { count: memberCount }] =
    await Promise.all([
      admin
        .from("verifications")
        .select("id, user_id, decision, confidence, reasoning, screenshot_path, created_at")
        .eq("decision", "pending")
        .order("created_at", { ascending: true }),
      admin
        .from("school_sessions")
        .select("id, title, description, track, recurrence, link, created_at")
        .eq("approved", false)
        .order("created_at", { ascending: true }),
      admin.from("profiles").select("id", { count: "exact", head: true }),
    ])

  // Signed URLs so admins can view the private screenshots.
  const verifications = await Promise.all(
    (pendingVerifications ?? []).map(async (v) => {
      const { data } = await admin.storage
        .from("screenshots")
        .createSignedUrl(v.screenshot_path, 3600)
      return { ...v, url: data?.signedUrl ?? "" }
    })
  )

  return (
    <div className="fade-up mx-auto max-w-3xl space-y-14 pt-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Admin</h1>
        <p className="mt-2 text-muted">{memberCount ?? 0} profiles in the database.</p>
      </header>

      <section>
        <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="sq" aria-hidden />
          Verifications awaiting review ({verifications.length})
        </h2>
        {verifications.length === 0 ? (
          <p className="text-sm text-muted">Queue is empty.</p>
        ) : (
          <ul className="space-y-4">
            {verifications.map((v) => (
              <li key={v.id} className="card">
                <p className="text-sm">
                  <span className="font-mono text-[12px] text-muted">
                    user {v.user_id.slice(0, 8)} · confidence{" "}
                    {v.confidence != null ? Number(v.confidence).toFixed(2) : "n/a"}
                  </span>
                </p>
                <p className="mt-1 text-[15px]">{v.reasoning}</p>
                {v.url && (
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm font-semibold text-orange-dark hover:underline"
                  >
                    View screenshot ↗
                  </a>
                )}
                <form action={reviewVerification} className="mt-3 flex gap-2">
                  <input type="hidden" name="verification_id" value={v.id} />
                  <input type="hidden" name="user_id" value={v.user_id} />
                  <button name="decision" value="approve" className="btn px-4 py-1.5 text-sm">
                    Approve
                  </button>
                  <button name="decision" value="reject" className="btn btn-outline px-4 py-1.5 text-sm">
                    Reject
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="sq" aria-hidden />
          Session submissions ({(pendingSessions ?? []).length})
        </h2>
        {(pendingSessions ?? []).length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting.</p>
        ) : (
          <ul className="space-y-4">
            {(pendingSessions ?? []).map((s) => (
              <li key={s.id} className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-bold">{s.title}</h3>
                  <span className="font-mono text-[12px] text-muted uppercase">
                    {s.track} · {s.recurrence || "time TBA"}
                  </span>
                </div>
                {s.description && (
                  <p className="mt-1 line-clamp-2 text-[15px] text-muted">
                    {s.description}
                  </p>
                )}
                {s.link && (
                  // Calendar invite URLs run to hundreds of characters with no
                  // break opportunities, so show a label rather than the URL.
                  <a
                    href={s.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-sm font-medium text-orange-dark hover:underline"
                  >
                    Open link ↗
                  </a>
                )}
                <form action={reviewSession} className="mt-3 flex gap-2">
                  <input type="hidden" name="session_id" value={s.id} />
                  <button name="decision" value="approve" className="btn px-4 py-1.5 text-sm">
                    Publish
                  </button>
                  <button name="decision" value="reject" className="btn btn-outline px-4 py-1.5 text-sm">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="sq" aria-hidden />
          Add a student manually
        </h2>
        <p className="mb-4 text-sm text-muted">
          For the seeding phase — adds an approved profile straight to the
          directory (no login attached).
        </p>
        <form action={addStudent} className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="a-name">Name</label>
              <input id="a-name" name="full_name" required className="field" />
            </div>
            <div>
              <label className="label" htmlFor="a-location">Location</label>
              <input id="a-location" name="location" className="field" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="a-startup">Startup</label>
              <input id="a-startup" name="startup_name" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="a-linkedin">LinkedIn</label>
              <input id="a-linkedin" name="linkedin_url" className="field" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="a-oneliner">One-liner</label>
            <input id="a-oneliner" name="one_liner" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="a-bio">About</label>
            <textarea id="a-bio" name="bio" rows={2} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="a-looking">Looking for</label>
            <input id="a-looking" name="looking_for" className="field" />
          </div>
          <button type="submit" className="btn">Add student</button>
        </form>
      </section>
    </div>
  )
}
