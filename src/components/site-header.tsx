import Link from "next/link"

import { getCurrentUser, isVerified } from "@/lib/auth"

export async function SiteHeader() {
  const { user, profile } = await getCurrentUser()
  const verified = isVerified(profile)

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
          <span className="sq" aria-hidden />
          Startup School Hub
        </Link>
        <nav className="flex items-center gap-5 text-[15px] font-medium">
          <Link href="/schedule" className="text-muted transition-colors hover:text-ink">
            Schedule
          </Link>
          <Link href="/directory" className="text-muted transition-colors hover:text-ink">
            Directory
          </Link>
          <Link href="/ask" className="text-muted transition-colors hover:text-ink">
            Ask
          </Link>
          {profile?.role === "admin" && (
            <Link href="/admin" className="text-muted transition-colors hover:text-ink">
              Admin
            </Link>
          )}
          {user ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[13px] text-muted sm:inline-flex">
              <span
                className={`inline-block h-2 w-2 rounded-full ${verified ? "bg-green-600" : "bg-amber-500"}`}
                aria-hidden
              />
              {verified ? "Verified" : "Pending"}
            </span>
          ) : (
            <Link href="/join" className="btn px-4 py-1.5 text-sm">
              Join
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
