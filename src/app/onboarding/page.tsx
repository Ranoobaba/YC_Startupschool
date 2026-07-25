import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"

import { OnboardingForm } from "./onboarding-form"

export const metadata: Metadata = {
  title: "Your profile",
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  const { user, profile } = await getCurrentUser()
  if (!user) redirect("/login")

  const params = await searchParams
  const role =
    params.role === "founder"
      ? "founder"
      : params.role === "student"
        ? "student"
        : (profile?.role ?? "student")

  return (
    <div className="fade-up mx-auto max-w-xl pt-8">
      <p className="mb-4 flex items-center gap-2.5 font-mono text-[13px] font-medium tracking-[0.1em] text-muted uppercase">
        <span className="sq" aria-hidden />
        Step 1 of {role === "student" ? "2" : "1"} · your profile
      </p>
      <h1 className="text-3xl font-bold tracking-tight">
        Tell the community who you are.
      </h1>
      <p className="mt-2 text-muted">
        This is what other verified members see in the directory, and what the
        Ask feature searches over.
      </p>
      <OnboardingForm
        role={role}
        initial={
          profile ?? undefined
        }
      />
    </div>
  )
}
