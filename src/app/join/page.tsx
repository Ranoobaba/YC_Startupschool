import type { Metadata } from "next"
import { SignInButton, SignUpButton } from "@clerk/nextjs"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Join",
  description:
    "Two ways in: founders with a company email, students with their acceptance screenshot.",
}

export default function JoinPage() {
  return (
    <div className="fade-up mx-auto max-w-3xl pt-8">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Two ways in.
      </h1>
      <p className="mt-3 text-muted">
        Access is gated so everyone inside is actually part of the Startup
        School world. Sign in with Google, then pick the route that fits you.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <div className="card flex flex-col">
          <span className="sq mb-4" aria-hidden />
          <h2 className="text-xl font-bold">I&apos;m a founder</h2>
          <p className="mt-2 flex-1 text-[15px] text-muted">
            Sign in with your <strong>company email</strong>. Free providers
            (gmail, outlook, …) won&apos;t verify you automatically — the domain
            is the proof.
          </p>
          <SignUpButton mode="modal">
            <button className="btn mt-5 w-full">Continue as a founder</button>
          </SignUpButton>
        </div>

        <div className="card flex flex-col">
          <span className="sq mb-4" aria-hidden />
          <h2 className="text-xl font-bold">
            I&apos;m a Startup School student
          </h2>
          <p className="mt-2 flex-1 text-[15px] text-muted">
            Sign in with any account, then upload a screenshot of your{" "}
            <strong>Startup School acceptance</strong>. It&apos;s checked
            automatically and kept on file.
          </p>
          <SignUpButton mode="modal">
            <button className="btn mt-5 w-full">Continue as a student</button>
          </SignUpButton>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted">
        Already joined?{" "}
        <SignInButton mode="modal">
          <button className="text-orange-dark underline underline-offset-4">
            Sign in
          </button>
        </SignInButton>{" "}
        · or{" "}
        <Link href="/" className="underline underline-offset-4">
          back home
        </Link>
      </p>
    </div>
  )
}
