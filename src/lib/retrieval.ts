import { supabaseAdmin } from "@/lib/supabase/server"

export interface StudentMatch {
  id: string
  full_name: string
  startup_name: string
  one_liner: string
  bio: string
  looking_for: string
  location: string
}

// Optional vector path: Voyage AI embeddings + pgvector. Without a
// VOYAGE_API_KEY the app retrieves with Postgres full-text search instead.
export async function embed(text: string): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "voyage-3.5", input: [text] }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.data?.[0]?.embedding ?? null
}

export async function retrieveStudents(
  question: string,
  limit = 8
): Promise<StudentMatch[]> {
  const admin = supabaseAdmin()

  const queryEmbedding = await embed(question)
  if (queryEmbedding) {
    const { data } = await admin.rpc("match_students", {
      query_embedding: queryEmbedding,
      match_count: limit,
    })
    if (data && data.length > 0) return data as StudentMatch[]
  }

  const columns =
    "id, full_name, startup_name, one_liner, bio, looking_for, location"

  // Full-text search; OR the terms so partial matches still surface people.
  const terms = question
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .join(" | ")

  if (terms) {
    const { data } = await admin
      .from("profiles")
      .select(columns)
      .textSearch("fts", terms)
      .limit(limit)
    if (data && data.length > 0) return data as StudentMatch[]
  }

  // Last resort: recent profiles, so broad questions still get an answer.
  const { data } = await admin
    .from("profiles")
    .select(columns)
    .order("created_at", { ascending: false })
    .limit(limit)
  return (data ?? []) as StudentMatch[]
}
