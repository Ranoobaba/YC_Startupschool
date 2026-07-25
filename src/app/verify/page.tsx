import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"

import { VerifyForm } from "./verify-form"

export const metadata: Metadata = {
  title: "Verify",
}

export default async function VerifyPage() {
  const { user, profile } = await getCurrentUser()
  if (!user) redirect("/login")
  if (!profile) redirect("/onboarding?role=student")

  if (profile.status === "approved") {
    return (
      <div className="fade-up mx-auto max-w-md pt-12 text-center">
        <span className="sq mx-auto mb-4 block" aria-hidden />
        <h1 className="text-3xl font-bold tracking-tight">You&apos;re verified.</h1>
        <p className="mt-2 text-muted">Full access is unlocked.</p>
        <Link href="/schedule" className="btn mt-6">
          Go to the schedule
        </Link>
      </div>
    )
  }

  return (
    <div className="fade-up mx-auto max-w-xl pt-8">
      <p className="mb-4 flex items-center gap-2.5 font-mono text-[13px] font-medium tracking-[0.1em] text-muted uppercase">
        <span className="sq" aria-hidden />
        Step 2 of 2 · verification
      </p>
      <h1 className="text-3xl font-bold tracking-tight">
        Show us your acceptance.
      </h1>
      <p className="mt-2 text-muted">
        Upload a screenshot of your Startup School acceptance email or your
        enrolled dashboard. It&apos;s checked automatically, stored privately,
        and reviewed by an admin if the check is unsure.
      </p>
      <VerifyForm />
    </div>
  )
}
