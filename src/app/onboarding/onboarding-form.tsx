"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import type { Profile } from "@/lib/auth"

export function OnboardingForm({
  role,
  initial,
}: {
  role: "founder" | "student" | "admin"
  initial?: Partial<Profile>
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    full_name: initial?.full_name ?? "",
    startup_name: initial?.startup_name ?? "",
    one_liner: initial?.one_liner ?? "",
    bio: initial?.bio ?? "",
    looking_for: initial?.looking_for ?? "",
    location: initial?.location ?? "",
    linkedin_url: initial?.linkedin_url ?? "",
  })

  function set(key: keyof typeof form) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role }),
    })
    const data = await res.json()
    if (!res.ok) {
      setSaving(false)
      setError(data.error ?? "Something went wrong")
      return
    }
    if (data.role === "student" && data.status !== "approved") {
      router.push("/verify")
    } else if (data.status === "approved") {
      router.push("/schedule")
    } else {
      router.push("/verify")
    }
  }

  return (
    <form onSubmit={save} className="card mt-8 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="full_name">Name</label>
          <input id="full_name" required autoComplete="name" className="field" value={form.full_name} onChange={set("full_name")} />
        </div>
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input id="location" autoComplete="address-level2" className="field" placeholder="Berkeley, CA" value={form.location} onChange={set("location")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="startup_name">Startup / project</label>
          <input id="startup_name" autoComplete="organization" className="field" value={form.startup_name} onChange={set("startup_name")} />
        </div>
        <div>
          <label className="label" htmlFor="linkedin_url">LinkedIn (optional)</label>
          <input id="linkedin_url" type="url" inputMode="url" spellCheck={false} autoComplete="url" className="field" placeholder="https://linkedin.com/in/…" value={form.linkedin_url} onChange={set("linkedin_url")} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="one_liner">One-liner</label>
        <input id="one_liner" className="field" placeholder="What are you building, in a sentence?…" value={form.one_liner} onChange={set("one_liner")} />
      </div>
      <div>
        <label className="label" htmlFor="bio">About you</label>
        <textarea id="bio" rows={4} className="field" placeholder="Background, what stage you're at, anything a fellow founder should know." value={form.bio} onChange={set("bio")} />
      </div>
      <div>
        <label className="label" htmlFor="looking_for">Looking for</label>
        <input id="looking_for" className="field" placeholder="Co-founder, design partner, users in healthcare…" value={form.looking_for} onChange={set("looking_for")} />
      </div>
      <button type="submit" disabled={saving} className="btn w-full">
        {saving ? "Saving…" : role === "student" ? "Save and verify" : "Save profile"}
      </button>
      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  )
}
