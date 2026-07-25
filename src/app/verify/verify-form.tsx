"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export function VerifyForm() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<"idle" | "checking" | "approved" | "pending" | "error">("idle")
  const [message, setMessage] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setState("checking")
    setMessage("")

    const form = new FormData()
    form.set("screenshot", file)
    const res = await fetch("/api/verify", { method: "POST", body: form })
    const data = await res.json()

    if (!res.ok) {
      setState("error")
      setMessage(data.error ?? "Something went wrong — try again.")
      return
    }
    setState(data.status === "approved" ? "approved" : "pending")
    setMessage(data.reasoning)
    if (data.status === "approved") {
      setTimeout(() => router.push("/schedule"), 1500)
    }
  }

  return (
    <form onSubmit={submit} className="card mt-8">
      <label className="label" htmlFor="screenshot">
        Acceptance screenshot (PNG or JPG, max 8 MB)
      </label>
      <input
        id="screenshot"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="field cursor-pointer file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-orange-soft file:px-3 file:py-1 file:font-medium file:text-orange-dark"
      />
      <button
        type="submit"
        disabled={!file || state === "checking" || state === "approved"}
        className="btn mt-4 w-full"
      >
        {state === "checking" ? "Checking…" : "Verify me"}
      </button>
      {message && (
        <p
          role="status"
          className={`mt-3 text-sm ${
            state === "approved"
              ? "text-green-700"
              : state === "error"
                ? "text-red-600"
                : "text-muted"
          }`}
        >
          {message}
        </p>
      )}
    </form>
  )
}
