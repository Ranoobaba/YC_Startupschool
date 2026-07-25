"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/auth"
import { embed } from "@/lib/retrieval"
import { supabaseAdmin } from "@/lib/supabase/server"

async function requireAdmin() {
  const { profile } = await getCurrentUser()
  if (profile?.role !== "admin") throw new Error("Admins only")
}

export async function addStudent(formData: FormData) {
  await requireAdmin()
  const admin = supabaseAdmin()

  const fields = {
    full_name: String(formData.get("full_name") ?? "").slice(0, 120).trim(),
    startup_name: String(formData.get("startup_name") ?? "").slice(0, 120).trim(),
    one_liner: String(formData.get("one_liner") ?? "").slice(0, 200).trim(),
    bio: String(formData.get("bio") ?? "").slice(0, 2000).trim(),
    looking_for: String(formData.get("looking_for") ?? "").slice(0, 500).trim(),
    location: String(formData.get("location") ?? "").slice(0, 120).trim(),
    linkedin_url: String(formData.get("linkedin_url") ?? "").slice(0, 300).trim(),
  }
  if (!fields.full_name) return

  const embedding = await embed(
    `${fields.full_name}. ${fields.startup_name}: ${fields.one_liner}. ${fields.bio}. Looking for: ${fields.looking_for}. Location: ${fields.location}`
  )

  await admin.from("profiles").insert({
    role: "student",
    status: "approved",
    manually_added: true,
    ...fields,
    ...(embedding ? { embedding } : {}),
  })
  revalidatePath("/admin")
  revalidatePath("/directory")
}

export async function reviewVerification(formData: FormData) {
  await requireAdmin()
  const admin = supabaseAdmin()

  const userId = String(formData.get("user_id") ?? "")
  const verificationId = String(formData.get("verification_id") ?? "")
  const decision = formData.get("decision") === "approve" ? "approved" : "rejected"
  if (!userId || !verificationId) return

  await admin.from("verifications").update({ decision }).eq("id", verificationId)
  await admin.from("profiles").update({ status: decision }).eq("id", userId)
  revalidatePath("/admin")
}

export async function reviewSession(formData: FormData) {
  await requireAdmin()
  const admin = supabaseAdmin()

  const id = String(formData.get("session_id") ?? "")
  if (!id) return

  if (formData.get("decision") === "approve") {
    await admin.from("school_sessions").update({ approved: true }).eq("id", id)
  } else {
    await admin.from("school_sessions").delete().eq("id", id)
  }
  revalidatePath("/admin")
  revalidatePath("/schedule")
}
