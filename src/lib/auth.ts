import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server"

export type Role = "founder" | "student" | "admin"
export type Status = "pending" | "approved" | "rejected"

export interface Profile {
  id: string
  role: Role
  status: Status
  full_name: string
  startup_name: string
  one_liner: string
  bio: string
  looking_for: string
  location: string
  linkedin_url: string
}

export async function getCurrentUser() {
  if (!supabaseConfigured()) return { user: null, profile: null }

  try {
    const supabase = await supabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { user: null, profile: null }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    return { user, profile: profile as Profile | null }
  } catch {
    // Unreachable database or bad credentials: render signed-out rather than
    // failing the whole page.
    return { user: null, profile: null }
  }
}

export function isVerified(profile: Profile | null): boolean {
  return (
    profile !== null &&
    (profile.role === "admin" ||
      (profile.status === "approved" &&
        (profile.role === "founder" || profile.role === "student")))
  )
}

// Founders must sign up with a company email, not a free provider.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com",
  "mail.com", "gmx.com", "yandex.com", "zoho.com", "duck.com", "pm.me",
  "fastmail.com", "hey.com", "qq.com", "163.com", "126.com",
])

export function isCompanyEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1]
  if (!domain || !domain.includes(".")) return false
  return !FREE_EMAIL_DOMAINS.has(domain)
}
