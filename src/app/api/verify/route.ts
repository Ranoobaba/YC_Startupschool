import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"

import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED_TYPES = new Map<string, "image/png" | "image/jpeg" | "image/webp" | "image/gif">([
  ["image/png", "image/png"],
  ["image/jpeg", "image/jpeg"],
  ["image/webp", "image/webp"],
  ["image/gif", "image/gif"],
])

const MODEL = "claude-opus-5"

const VERDICT_SCHEMA = {
  type: "object" as const,
  properties: {
    is_acceptance: {
      type: "boolean" as const,
      description:
        "True only if the screenshot convincingly shows a YC Startup School acceptance/welcome email or dashboard for this person",
    },
    confidence: {
      type: "number" as const,
      description: "0 to 1 confidence in the verdict",
    },
    reasoning: {
      type: "string" as const,
      description: "One short paragraph explaining the decision",
    },
  },
  required: ["is_acceptance", "confidence", "reasoning"],
  additionalProperties: false,
}

export async function POST(request: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const form = await request.formData()
  const file = form.get("screenshot")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing screenshot" }, { status: 400 })
  }
  const mediaType = ALLOWED_TYPES.get(file.type)
  if (!mediaType) {
    return NextResponse.json(
      { error: "Upload a PNG, JPEG, WebP, or GIF image" },
      { status: 400 }
    )
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large (max 8 MB)" }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const admin = supabaseAdmin()

  // Store the screenshot first - it is the audit trail either way.
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`
  const { error: uploadError } = await admin.storage
    .from("screenshots")
    .upload(path, bytes, { contentType: file.type })
  if (uploadError) {
    return NextResponse.json({ error: "Failed to store screenshot" }, { status: 500 })
  }

  // Every stored screenshot needs a verifications row: an upload with no row is
  // an audit trail nobody can review. Any path that fails to reach a verdict
  // parks the screenshot for an admin rather than dropping it on the floor.
  const userId = user.id
  async function parkForReview(reason: string) {
    await admin.from("verifications").insert({
      user_id: userId,
      screenshot_path: path,
      decision: "pending",
      model: MODEL,
      confidence: null,
      reasoning: reason,
    })
    return NextResponse.json({
      status: "pending",
      reasoning:
        "We couldn't automatically verify this screenshot. An admin will review it shortly.",
    })
  }

  // Retry transient overloads in-process; maxDuration gives us room for it.
  const anthropic = new Anthropic({ maxRetries: 3 })
  let response: Anthropic.Message
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system:
        "You verify screenshots for a YC Startup School community site. " +
        "Genuine acceptance evidence: an email from Y Combinator / Startup School " +
        "(startupschool.org, ycombinator.com senders) welcoming the person to the " +
        "current Startup School cohort, or a screenshot of the Startup School " +
        "dashboard showing enrollment. Be skeptical: generic YC marketing emails, " +
        "newsletter subscriptions, rejection emails, or obviously edited images do " +
        "not count. When genuinely uncertain, set is_acceptance false with " +
        "confidence below 0.5 so a human reviews it.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: bytes.toString("base64"),
              },
            },
            {
              type: "text",
              text: "Does this screenshot show a genuine YC Startup School acceptance?",
            },
          ],
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: VERDICT_SCHEMA },
      },
    })
  } catch (err) {
    // Missing credentials, an overloaded API, a timeout: without this the throw
    // escapes the route and Next returns a bodyless 500 the client can't parse.
    return parkForReview(
      `Verification error: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (response.stop_reason === "refusal") {
    return parkForReview("Model declined to evaluate the screenshot.")
  }

  const textBlock = response.content.find((b) => b.type === "text")
  if (textBlock?.type !== "text") {
    return parkForReview(
      `No verdict returned (stop_reason: ${response.stop_reason}).`
    )
  }

  let verdict: { is_acceptance: boolean; confidence: number; reasoning: string }
  try {
    verdict = JSON.parse(textBlock.text)
  } catch {
    return parkForReview("Model returned a verdict that could not be parsed.")
  }

  const approved = verdict.is_acceptance && verdict.confidence >= 0.5
  const decision = approved ? "approved" : "pending"

  await admin.from("verifications").insert({
    user_id: user.id,
    screenshot_path: path,
    decision,
    model: response.model,
    confidence: verdict.confidence,
    reasoning: verdict.reasoning,
  })

  // Only upgrade status; never downgrade an already-approved profile here.
  if (approved) {
    await admin
      .from("profiles")
      .update({ status: "approved" })
      .eq("id", user.id)
      .neq("status", "approved")
  }

  return NextResponse.json({
    status: decision,
    reasoning: approved
      ? "Verified - welcome to the community."
      : "We couldn't automatically verify this screenshot. An admin will review it shortly.",
  })
}
