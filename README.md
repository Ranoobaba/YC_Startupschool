# Startup School Hub

A community hub for YC Startup School participants: the full session schedule (including the hidden sessions students usually miss), a verified student directory, and a RAG-powered "Ask" that answers questions from real student profiles.

**Made by Syed Rayyan Ali. Not affiliated with Y Combinator or Startup School.**

## The calendar trick

YC puts Startup School sessions on your Google Calendar automatically — but only the ones you were invited to. So the schedule builds itself: when students connect their calendars, one person's invite becomes everyone's discovery. Two independent students having the same session is enough to publish it; a single sighting waits in the admin queue.

- **Only Startup School events are read.** The filter matches a `ycombinator.com` / `startupschool.org` organizer or a YC name in the title — never free text in a description. Personal events are dropped before anything is stored.
- **Aggregation is anonymous.** Other students see that a session exists, never whose calendar it came from.
- **Disconnecting deletes your events.** Sessions already published stay (they're anonymous and others rely on them); nothing remains linked to you.

Two ways in: one-click Google OAuth, or upload a `.ics` export. The `.ics` path needs no Google Cloud setup and has no user cap, so it works before verification and as a fallback after.

## How access works

- **Founders** sign in with a **company email** (free providers are rejected) via magic link — the domain is the verification.
- **Students** sign in with any email, then upload a screenshot of their Startup School acceptance. Claude (vision) checks it automatically; clear passes are approved instantly, everything else lands in the admin review queue. Every screenshot + decision is stored as an audit trail.
- **Admins** review borderline verifications, approve community-submitted sessions, and manually add students during the seeding phase.

## Stack

Next.js (App Router) · Tailwind CSS v4 · Supabase (auth, Postgres + pgvector, storage) · Claude API (`claude-opus-5` for screenshot verification and RAG answers) · Vercel

## Setup

1. **Supabase**: create a project at [supabase.com](https://supabase.com), open the SQL editor, and run `supabase/schema.sql`. This creates the tables, RLS policies, the private `screenshots` bucket, and the pgvector match function.
2. **Env vars**: copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API)
   - `ANTHROPIC_API_KEY` ([platform.claude.com](https://platform.claude.com))
   - `VOYAGE_API_KEY` (optional — enables vector retrieval; without it the Ask feature uses Postgres full-text search)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional — enables one-click calendar connect; without them the `.ics` upload path still works)
3. **Auth redirect**: in Supabase → Authentication → URL Configuration, add your site URL (and `http://localhost:3000` for dev) to the redirect allowlist.
4. **Make yourself admin**: sign up through the site once, then in the SQL editor:
   ```sql
   update profiles set role = 'admin', status = 'approved' where id = '<your-user-uuid>';
   ```
5. **Google Calendar** (optional, for one-click connect): at [console.cloud.google.com](https://console.cloud.google.com) create a project → enable the **Google Calendar API** → OAuth consent screen (External, add scope `.../auth/calendar.events.readonly`, add testers under Test users) → Credentials → OAuth client ID (Web application) with redirect URIs:
   ```
   http://localhost:3000/api/calendar/google/callback
   https://<your-domain>/api/calendar/google/callback
   ```
   Calendar read is a **sensitive scope**: until Google verifies the app you're capped at 100 test users and their connections expire every 7 days. Verification needs a privacy policy, a demo video, and a scope justification — no security audit or fee (those apply to Gmail-tier scopes). The `.ics` upload path has neither limit, so ship with both.
6. **Run it**:
   ```bash
   pnpm install
   pnpm dev
   ```

## Deploy

Import the repo on [Vercel](https://vercel.com/new), set the same env vars, deploy. Update `SITE_URL` in `src/config/site.ts` to the assigned domain.

## Map

| Path | What |
| --- | --- |
| `/` | Public: what Startup School is, what the hub does |
| `/join`, `/login` | The two sign-up flows (magic link) |
| `/onboarding`, `/verify` | Profile form → student screenshot verification |
| `/calendar` | Connect a calendar, then see the sessions you're missing (gated) |
| `/schedule` | Standard + hidden sessions, community submissions (gated) |
| `/directory` | Verified student directory (gated) |
| `/ask` | RAG Q&A over student profiles (gated) |
| `/admin` | Verification queue, session approvals, manual student adds |
| `src/app/api/calendar/*` | Google OAuth, `.ics` upload, re-sync, disconnect |
| `src/lib/calendar/*` | YC event filter, `.ics` parser, Google client, ingestion |
| `src/app/api/verify` | Claude vision check of acceptance screenshots |
| `src/app/api/ask` | Retrieval (pgvector or FTS) + Claude answer |
| `supabase/schema.sql` | Full database schema — run once |
