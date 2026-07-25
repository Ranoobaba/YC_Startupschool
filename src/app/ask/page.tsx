import type { Metadata } from "next"

import { Locked } from "@/components/locked"
import { getCurrentUser, isVerified } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase/server"

import { AskForm } from "./ask-form"

export const metadata: Metadata = {
  title: "People",
  description:
    "Everyone in the community, and a way to ask who's building what.",
}

interface DirectoryProfile {
  id: string
  full_name: string
  startup_name: string
  one_liner: string
  looking_for: string
  location: string
  linkedin_url: string
}

export default async function PeoplePage() {
  const { profile } = await getCurrentUser()
  if (!isVerified(profile)) {
    return <Locked pending={profile?.status === "pending"} />
  }

  const admin = supabaseAdmin()
  const { data } = await admin
    .from("profiles")
    .select(
      "id, full_name, startup_name, one_liner, looking_for, location, linkedin_url"
    )
    .neq("full_name", "")
    .order("created_at", { ascending: false })

  const people = (data ?? []) as DirectoryProfile[]

  return (
    <div className="fade-up pt-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">People</h1>
        <p className="mt-2 max-w-2xl text-muted">
          {people.length} {people.length === 1 ? "person" : "people"} in the
          community. Ask a question, or scroll to browse everyone.
        </p>
      </header>

      <AskForm />

      <section className="mt-12">
        <h2 className="mb-4 flex items-center gap-2.5 font-mono text-[12px] font-medium tracking-[0.1em] text-muted uppercase">
          <span className="sq" aria-hidden />
          Everyone
        </h2>

        {people.length === 0 ? (
          <p className="text-muted">No profiles yet — you could be the first.</p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <li key={p.id} className="card flex flex-col">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-bold">{p.full_name}</h3>
                  {p.location && (
                    <span className="font-mono text-[12px] text-muted">
                      {p.location}
                    </span>
                  )}
                </div>
                {p.startup_name && (
                  <p className="mt-0.5 text-sm font-semibold text-orange-dark">
                    {p.startup_name}
                  </p>
                )}
                {p.one_liner && (
                  <p className="mt-2 flex-1 text-[15px] text-muted">
                    {p.one_liner}
                  </p>
                )}
                {p.looking_for && (
                  <p className="mt-3 text-[13px]">
                    <span className="font-mono tracking-wide text-muted uppercase">
                      Looking for:
                    </span>{" "}
                    {p.looking_for}
                  </p>
                )}
                {p.linkedin_url && (
                  <a
                    href={p.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 text-[14px] font-semibold text-orange-dark hover:underline"
                  >
                    LinkedIn ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
