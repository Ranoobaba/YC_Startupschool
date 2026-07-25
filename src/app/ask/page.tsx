import type { Metadata } from "next"

import { Locked } from "@/components/locked"
import { getCurrentUser, isVerified } from "@/lib/auth"

import { AskForm } from "./ask-form"

export const metadata: Metadata = {
  title: "Ask",
}

export default async function AskPage() {
  const { profile } = await getCurrentUser()
  if (!isVerified(profile)) {
    return <Locked pending={profile?.status === "pending"} />
  }

  return (
    <div className="fade-up mx-auto max-w-2xl pt-4">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Ask the community.
      </h1>
      <p className="mt-2 text-muted">
        Questions are answered from real student profiles — try &ldquo;who&apos;s
        building AI dev tools?&rdquo; or &ldquo;who&apos;s looking for a
        technical co-founder in the Bay Area?&rdquo;
      </p>
      <AskForm />
    </div>
  )
}
