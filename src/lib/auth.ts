import { auth, currentUser } from "@clerk/nextjs/server"

import { supabaseAdmin } from "@/lib/supabase/server"

export type Role = "founder" | "student" | "admin"
export type Status = "pending" | "approved" | "rejected"

export interface Profile {
  id: string
  role: Role
  status: Status
  email: string
  full_name: string
  startup_name: string
  one_liner: string
  bio: string
  looking_for: string
  location: string
  linkedin_url: string
}

export interface CurrentUser {
  id: string
  email: string
}

/**
 * Resolves the signed-in Clerk user and their profile row, creating the row on
 * first sign-in.
 *
 * Clerk owns identity; Supabase is only the database. Profiles are keyed on the
 * Clerk user id, and a profile written before the migration off Supabase Auth
 * is claimed by matching email, so an existing account keeps its role and its
 * connected calendar instead of being orphaned behind a new id.
 */
export async function getCurrentUser(): Promise<{
  user: CurrentUser | null
  profile: Profile | null
}> {
  const { userId } = await auth()
  if (!userId) return { user: null, profile: null }

  const admin = supabaseAdmin()

  const { data: existing } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()

  if (existing) {
    return {
      user: { id: userId, email: (existing as Profile).email },
      profile: existing as Profile,
    }
  }

  // No row under the Clerk id yet: this is either a brand-new member or an
  // account that predates the move to Clerk.
  const clerkUser = await currentUser()
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    ""
  const user: CurrentUser = { id: userId, email }

  if (email) {
    const claimed = await claimLegacyProfile(userId, email)
    if (claimed) return { user, profile: claimed }
  }

  const fullName = [clerkUser?.firstName, clerkUser?.lastName]
    .filter(Boolean)
    .join(" ")

  const { data: created } = await admin
    .from("profiles")
    .insert({
      id: userId,
      email,
      role: "student",
      status: "pending",
      full_name: fullName,
    })
    .select("*")
    .single()

  return { user, profile: (created as Profile) ?? null }
}

/**
 * Re-points a pre-Clerk profile (and everything keyed to it) at the Clerk id.
 * Runs at most once per account: afterwards the profile is found by id.
 */
async function claimLegacyProfile(
  clerkId: string,
  email: string
): Promise<Profile | null> {
  const admin = supabaseAdmin()

  const { data: legacy } = await admin
    .from("profiles")
    .select("*")
    .eq("email", email)
    .neq("id", clerkId)
    .maybeSingle()

  if (!legacy) return null
  const oldId = (legacy as Profile).id

  // Move dependants first so nothing is left pointing at a row that no longer
  // exists if a later statement fails.
  await Promise.all([
    admin.from("calendar_events").update({ user_id: clerkId }).eq("user_id", oldId),
    admin.from("calendar_connections").update({ user_id: clerkId }).eq("user_id", oldId),
    admin.from("verifications").update({ user_id: clerkId }).eq("user_id", oldId),
    admin.from("school_sessions").update({ submitted_by: clerkId }).eq("submitted_by", oldId),
  ])

  const { data: moved } = await admin
    .from("profiles")
    .update({ id: clerkId })
    .eq("id", oldId)
    .select("*")
    .single()

  return (moved as Profile) ?? null
}

export function isVerified(profile: Profile | null): boolean {
  return (
    profile !== null &&
    (profile.role === "admin" ||
      (profile.status === "approved" &&
        (profile.role === "founder" || profile.role === "student")))
  )
}

// Founders join with a company email, not a free provider.
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
