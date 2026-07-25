import Link from "next/link"

const FEATURES = [
  {
    title: "The schedule builds itself",
    body: "YC drops sessions onto your Google Calendar automatically — but only the ones you were invited to. Connect yours and every student's invites combine into one schedule, so you see the sessions you were never told about.",
    href: "/calendar",
    cta: "Upload your schedule",
  },
  {
    title: "Student directory",
    body: "Every verified student and what they're building. Find a co-founder, a design partner, or the three other people in your city going through the program right now.",
    href: "/directory",
    cta: "Meet students",
  },
  {
    title: "Ask the community",
    body: "Ask in plain English — \"who's building in fintech?\", \"who needs a technical co-founder?\" — and get an answer sourced from real student profiles.",
    href: "/ask",
    cta: "Ask a question",
  },
]

const FAQ = [
  {
    q: "What is YC Startup School?",
    a: "Y Combinator's free online program for founders: a video curriculum from YC partners, weekly group sessions with other founders, and a path to applying to the YC batch. It's the best free education for starting a startup — this hub exists to help you get the most out of it.",
  },
  {
    q: "What is this site, then?",
    a: "An independent community hub built by a student, for students. Startup School gives you the curriculum; this gives you the people and the schedule around it. It is not run by, endorsed by, or affiliated with Y Combinator.",
  },
  {
    q: "Why is it gated?",
    a: "The directory and schedule are only useful if everyone in them is actually in the program. Students verify with their acceptance screenshot; founders join with their company email.",
  },
  {
    q: "What are “hidden sessions”?",
    a: "Sessions that don't show up on the default schedule everyone sees: extra office hours, regional meetups, themed group sessions, and application deadline windows. Curated by us, submitted by students, reviewed before publishing.",
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
          The full session schedule — including the hidden ones — plus a
          verified directory of the students going through the program with
          you, and a way to ask who&apos;s building what.
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
