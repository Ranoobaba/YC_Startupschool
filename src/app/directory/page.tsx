import type { Metadata } from "next"
import Link from "next/link"

import { Locked } from "@/components/locked"
import { getCurrentUser, isVerified } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Directory",
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

export default async function DirectoryPage() {
  const { profile } = await getCurrentUser()
  if (!isVerified(profile)) {
    return <Locked pending={profile?.status === "pending"} />
  }

  const admin = supabaseAdmin()
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, startup_name, one_liner, looking_for, location, linkedin_url")
    .neq("full_name", "")
    .order("created_at", { ascending: false })

  const people = (data ?? []) as DirectoryProfile[]

  return (
    <div className="fade-up pt-4">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Directory</h1>
          <p className="mt-2 max-w-xl text-muted">
            {people.length} {people.length === 1 ? "person" : "people"} in the
            community. Want a smarter way to search?{" "}
            <Link href="/ask" className="text-orange-dark underline underline-offset-4">
              Ask a question
            </Link>
            .
          </p>
        </div>
      </header>

      {people.length === 0 ? (
        <p className="text-muted">No profiles yet — you could be the first.</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <li key={p.id} className="card flex flex-col">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-bold">{p.full_name}</h2>
                {p.location && (
                  <span className="font-mono text-[12px] text-muted">{p.location}</span>
                )}
              </div>
              {p.startup_name && (
                <p className="mt-0.5 text-sm font-semibold text-orange-dark">
                  {p.startup_name}
                </p>
              )}
              {p.one_liner && (
                <p className="mt-2 flex-1 text-[15px] text-muted">{p.one_liner}</p>
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
    </div>
  )
}
