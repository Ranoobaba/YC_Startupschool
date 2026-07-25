# Startup School Hub

A community hub for YC Startup School participants: the full session schedule (including the hidden sessions students usually miss), a verified student directory, and a RAG-powered "Ask" that answers questions from real student profiles.

**Made by Syed Rayyan Ali. Not affiliated with Y Combinator or Startup School.**

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
3. **Auth redirect**: in Supabase → Authentication → URL Configuration, add your site URL (and `http://localhost:3000` for dev) to the redirect allowlist.
4. **Make yourself admin**: sign up through the site once, then in the SQL editor:
   ```sql
   update profiles set role = 'admin', status = 'approved' where id = '<your-user-uuid>';
   ```
5. **Run it**:
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
| `/schedule` | Standard + hidden sessions, community submissions (gated) |
| `/directory` | Verified student directory (gated) |
| `/ask` | RAG Q&A over student profiles (gated) |
| `/admin` | Verification queue, session approvals, manual student adds |
| `src/app/api/verify` | Claude vision check of acceptance screenshots |
| `src/app/api/ask` | Retrieval (pgvector or FTS) + Claude answer |
| `supabase/schema.sql` | Full database schema — run once |
