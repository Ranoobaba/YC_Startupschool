"use client"

import { useState } from "react"

import { supabaseBrowser } from "@/lib/supabase/client"

const FREE_DOMAINS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "proton.me", "protonmail.com", "live.com",
]

export function LoginForm({ role }: { role: "founder" | "student" | null }) {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [message, setMessage] = useState("")

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    const domain = trimmed.split("@")[1] ?? ""

    if (role === "founder" && FREE_DOMAINS.includes(domain)) {
      setState("error")
      setMessage(
        "Founders join with a company email — that domain is a free provider. If you don't have a company email yet, join as a student instead."
      )
      return
    }

    setState("sending")
    const supabase = supabaseBrowser()
    const next = role ? `/onboarding?role=${role}` : "/onboarding"
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    })

    if (error) {
      setState("error")
      setMessage(error.message)
    } else {
      setState("sent")
      setMessage("Check your inbox — we sent you a sign-in link.")
    }
  }

  return (
    <form onSubmit={sendLink} className="card mt-8">
      <label htmlFor="email" className="label">
        {role === "founder" ? "Company email" : "Email"}
      </label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={role === "founder" ? "you@yourstartup.com" : "you@example.com"}
        className="field"
      />
      <button type="submit" disabled={state === "sending" || state === "sent"} className="btn mt-4 w-full">
        {state === "sending" ? "Sending…" : state === "sent" ? "Link sent" : "Send sign-in link"}
      </button>
      {message && (
        <p
          className={`mt-3 text-sm ${state === "error" ? "text-red-600" : "text-muted"}`}
          role="status"
        >
          {message}
        </p>
      )}
    </form>
  )
}
