"use client"

import { useState } from "react"

interface Source {
  name: string
  startup: string
  one_liner: string
}

export function AskForm() {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [sources, setSources] = useState<Source[]>([])
  const [state, setState] = useState<"idle" | "thinking" | "done" | "error">("idle")
  const [error, setError] = useState("")

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    setState("thinking")
    setAnswer("")
    setSources([])
    setError("")

    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    })
    const data = await res.json()
    if (!res.ok) {
      setState("error")
      setError(data.error ?? "Something went wrong")
      return
    }
    setAnswer(data.answer)
    setSources(data.sources ?? [])
    setState("done")
  }

  return (
    <div className="mt-8 space-y-6">
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Who's building in fintech?"
          className="field flex-1"
          aria-label="Your question"
        />
        <button type="submit" disabled={state === "thinking"} className="btn shrink-0">
          {state === "thinking" ? "Thinking…" : "Ask"}
        </button>
      </form>

      {state === "error" && <p className="text-sm text-red-600">{error}</p>}

      {answer && (
        <div className="card">
          <p className="whitespace-pre-wrap">{answer}</p>
        </div>
      )}

      {sources.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2.5 font-mono text-[12px] font-medium tracking-[0.1em] text-muted uppercase">
            <span className="sq" aria-hidden />
            Profiles consulted
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {sources.map((s, i) => (
              <li key={i} className="rounded-lg border border-line px-3.5 py-2.5 text-sm">
                <span className="font-semibold">{s.name}</span>
                {s.startup && <span className="text-orange-dark"> · {s.startup}</span>}
                {s.one_liner && <p className="mt-0.5 text-[13px] text-muted">{s.one_liner}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
