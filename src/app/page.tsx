import Link from "next/link"

const FEATURES = [
  {
    title: "See every alternative",
    body: "Your badge isn't checked at the door. Each round shows the session you were assigned next to everything else running at that exact time — so you decide, instead of following the itinerary.",
    href: "/schedule",
    cta: "See the rounds",
  },
  {
    title: "The schedule builds itself",
    body: "YC puts sessions on your Google Calendar automatically — but only the ones you were assigned. Connect yours and everyone's invites combine into one programme, including sessions you were never told about.",
    href: "/calendar",
    cta: "Upload your schedule",
  },
  {
    title: "The people",
    body: "Everyone here and what they're building. Browse them, or just ask — \"who's building in fintech?\", \"who needs a technical co-founder?\" Answers come from real profiles.",
    href: "/ask",
    cta: "Meet people",
  },
]

const FAQ = [
  {
    q: "What is YC Startup School?",
    a: "Y Combinator's free program for founders: a curriculum from YC partners, sessions with other founders, and a path to applying to the YC batch. It's the best free education for starting a startup — this hub exists to help you get the most out of it.",
  },
  {
    q: "What is this site, then?",
    a: "An independent community hub built by a student, for students. Startup School gives you the curriculum; this gives you the people and the schedule around it. It is not run by, endorsed by, or affiliated with Y Combinator.",
  },
  {
    q: "Why is it gated?",
    a: "The schedule and the people are only useful if everyone here is actually in the program. Students verify with their acceptance screenshot; founders join with their company email.",
  },
  {
    q: "Where do the alternatives come from?",
    a: "Everyone gets assigned different sessions, so when attendees connect their calendars the combined invites cover the whole programme. Your assigned session is marked; the rest of each round is what you could walk into instead.",
  },
]

export default function Home() {
  return (
    <div className="space-y-20">
      <section className="fade-up pt-8 sm:pt-14">
        <p className="mb-5 flex items-center gap-2.5 font-mono text-[13px] font-medium tracking-[0.1em] text-muted uppercase">
          <span className="sq" aria-hidden />
          For YC Startup School students
        </p>
        <h1 className="max-w-3xl text-4xl leading-[1.1] font-bold tracking-tight sm:text-6xl">
          Everything about Startup School.{" "}
          <span className="text-orange">Especially the parts you&apos;d miss.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Every round, the session you were assigned, and what else is running at
          the same time — plus the people going through the program with you.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/calendar" className="btn">
            Upload your schedule
          </Link>
          <Link href="/join" className="btn btn-outline">
            Join the community
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted">
          Connects to Google Calendar. Reads only your Startup School events —
          nothing personal, nothing shared with your name on it.
        </p>
      </section>

      <section className="grid gap-5 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card flex flex-col">
            <span className="sq mb-4" aria-hidden />
            <h2 className="text-lg font-bold tracking-tight">{f.title}</h2>
            <p className="mt-2 flex-1 text-[15px] text-muted">{f.body}</p>
            <Link
              href={f.href}
              className="mt-4 text-[15px] font-semibold text-orange-dark hover:underline"
            >
              {f.cta} →
            </Link>
          </div>
        ))}
      </section>

      <section className="rounded-xl bg-bg-warm p-6 sm:p-10">
        <h2 className="mb-6 flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <span className="sq" aria-hidden />
          Good questions
        </h2>
        <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-1.5 text-[15px] text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
