"use client"

import { useState } from "react"

export function SubmitSessionForm() {
  const [form, setForm] = useState({
    title: "",
    description: "",
    track: "hidden",
    recurrence: "",
    link: "",
  })
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [message, setMessage] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState("sending")
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      setState("error")
      setMessage(data.error ?? "Something went wrong")
      return
    }
    setState("done")
    setMessage(data.message)
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="s-title">Session title</label>
          <input id="s-title" required className="field" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="s-when">When (free text)</label>
          <input id="s-when" className="field" placeholder="Thursdays 5pm PT"
            value={form.recurrence}
            onChange={(e) => setForm({ ...form, recurrence: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="s-desc">What is it?</label>
        <textarea id="s-desc" rows={2} className="field" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="s-link">Link (optional)</label>
          <input id="s-link" className="field" placeholder="https://…" value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="s-track">Track</label>
          <select id="s-track" className="field" value={form.track}
            onChange={(e) => setForm({ ...form, track: e.target.value })}>
            <option value="hidden">Hidden session</option>
            <option value="standard">Standard session</option>
          </select>
        </div>
      </div>
      <button type="submit" disabled={state === "sending" || state === "done"} className="btn">
        {state === "sending" ? "Submitting…" : state === "done" ? "Submitted" : "Submit for review"}
      </button>
      {message && (
        <p role="status" className={`text-sm ${state === "error" ? "text-red-600" : "text-muted"}`}>
          {message}
        </p>
      )}
    </form>
  )
}
