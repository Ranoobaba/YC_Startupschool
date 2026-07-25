import Link from "next/link"

export function Locked({ pending }: { pending: boolean }) {
  return (
    <div className="fade-up mx-auto max-w-md pt-16 text-center">
      <span className="sq mx-auto mb-4 block" aria-hidden />
      <h1 className="text-3xl font-bold tracking-tight">
        {pending ? "Almost in." : "Members only."}
      </h1>
      <p className="mt-2 text-muted">
        {pending
          ? "Your verification is being reviewed. You'll get access as soon as it's approved — usually quickly."
          : "This part of the hub is for verified Startup School students and founders."}
      </p>
      {!pending && (
        <Link href="/join" className="btn mt-6">
          Join the community
        </Link>
      )}
      {pending && (
        <Link href="/verify" className="btn btn-outline mt-6">
          Check verification status
        </Link>
      )}
    </div>
  )
}
