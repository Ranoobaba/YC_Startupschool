import type { Metadata } from "next"

import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: "Sign in",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  const params = await searchParams
  const role =
    params.role === "founder" || params.role === "student" ? params.role : null

  return (
    <div className="fade-up mx-auto max-w-md pt-10">
      <p className="mb-4 flex items-center gap-2.5 font-mono text-[13px] font-medium tracking-[0.1em] text-muted uppercase">
        <span className="sq" aria-hidden />
        {role === "founder"
          ? "Founder sign-in"
          : role === "student"
            ? "Student sign-in"
            : "Sign in"}
      </p>
      <h1 className="text-3xl font-bold tracking-tight">
        {role === "founder" ? "Use your company email." : "Welcome."}
      </h1>
      <p className="mt-2 text-muted">
        No passwords — we&apos;ll email you a magic link.
        {role === "student" &&
          " After signing in you'll upload your acceptance screenshot."}
      </p>
      <LoginForm role={role} />
    </div>
  )
}
