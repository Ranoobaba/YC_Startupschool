-- YC Startup School student hub — run this in the Supabase SQL editor.
-- Requires: a Supabase project. Optional: enable the "vector" extension for
-- embedding-based retrieval (the app falls back to full-text search without it).

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Profiles: one row per user. role decides the login flow that created them;
-- status decides gated access. Admins are promoted by hand (see bottom).
-- ---------------------------------------------------------------------------
create type user_role as enum ('founder', 'student', 'admin');
create type verification_status as enum ('pending', 'approved', 'rejected');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'student',
  status verification_status not null default 'pending',
  full_name text not null default '',
  startup_name text not null default '',
  one_liner text not null default '',
  bio text not null default '',
  looking_for text not null default '',
  location text not null default '',
  linkedin_url text not null default '',
  -- Rows the admin team adds by hand before the student signs up themselves.
  -- They have no auth.users row yet, so id is generated and claimed later.
  manually_added boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('english',
      full_name || ' ' || startup_name || ' ' || one_liner || ' ' ||
      bio || ' ' || looking_for || ' ' || location)
  ) stored,
  embedding vector(1024)
);

-- Manually-added students have no auth user; relax the FK by using a separate
-- table would complicate queries — instead store them here with a random id.
alter table profiles drop constraint profiles_id_fkey;
alter table profiles alter column id set default gen_random_uuid();

create index profiles_fts_idx on profiles using gin (fts);
create index profiles_embedding_idx on profiles
  using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- ---------------------------------------------------------------------------
-- Verifications: audit trail for student acceptance screenshots.
-- ---------------------------------------------------------------------------
create table verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  screenshot_path text not null,
  decision verification_status not null,
  model text not null default '',
  confidence numeric,
  reasoning text not null default '',
  created_at timestamptz not null default now()
);

create index verifications_user_idx on verifications (user_id);

-- ---------------------------------------------------------------------------
-- Sessions: the schedule. Curated rows come from admins; community rows from
-- verified students and require admin approval before they appear.
-- ---------------------------------------------------------------------------
create type session_source as enum ('curated', 'community', 'calendar');
create type session_track as enum ('standard', 'hidden');

create table school_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  track session_track not null default 'standard',
  source session_source not null default 'curated',
  approved boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  recurrence text not null default '',
  link text not null default '',
  submitted_by uuid,
  -- Set for sessions discovered from student calendars. Stable across every
  -- student who has the same invite, so it is the dedup key.
  calendar_key text,
  -- How many distinct students have this on their calendar. Internal only:
  -- the UI never exposes it, it exists to drive the auto-publish threshold.
  attendee_count int not null default 0,
  created_at timestamptz not null default now()
);

create unique index school_sessions_calendar_key_idx
  on school_sessions (calendar_key) where calendar_key is not null;

-- ---------------------------------------------------------------------------
-- Vector retrieval helper for the RAG endpoint (used when embeddings exist).
-- ---------------------------------------------------------------------------
create or replace function match_students (
  query_embedding vector(1024),
  match_count int default 8
) returns table (
  id uuid, full_name text, startup_name text, one_liner text, bio text,
  looking_for text, location text, similarity float
) language sql stable as $$
  select p.id, p.full_name, p.startup_name, p.one_liner, p.bio,
         p.looking_for, p.location,
         1 - (p.embedding <=> query_embedding) as similarity
  from profiles p
  where p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row level security. The app's server routes use the service-role key for
-- privileged operations; these policies cover direct client access.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table verifications enable row level security;
alter table school_sessions enable row level security;

create policy "own profile read" on profiles
  for select using (auth.uid() = id);
create policy "own profile update" on profiles
  for update using (auth.uid() = id);
create policy "own verifications" on verifications
  for select using (auth.uid() = user_id);
create policy "approved sessions readable" on school_sessions
  for select using (approved = true);

-- ---------------------------------------------------------------------------
-- Storage bucket for acceptance screenshots (private).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('screenshots', 'screenshots', false);

create policy "users upload own screenshots" on storage.objects
  for insert with check (
    bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- To promote yourself to admin after signing up, run:
--   update profiles set role = 'admin', status = 'approved' where id = '<your-user-uuid>';
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Calendar sync. Students connect Google Calendar (or upload a .ics export);
-- we extract ONLY Startup School events and drop everything personal.
--
-- Privacy model: aggregation is anonymous. calendar_events is per-student and
-- readable only by that student; the public schedule shows that a session
-- exists, never who has it on their calendar.
-- ---------------------------------------------------------------------------
create table calendar_connections (
  user_id uuid primary key,
  provider text not null check (provider in ('google', 'ics')),
  google_email text not null default '',
  refresh_token text,
  last_synced_at timestamptz,
  event_count int not null default 0,
  created_at timestamptz not null default now()
);

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- iCalUID where available: identical across every attendee's copy of the
  -- same invite, which is what makes cross-student corroboration work.
  calendar_key text not null,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  recurrence text not null default '',
  link text not null default '',
  organizer text not null default '',
  provider text not null,
  created_at timestamptz not null default now(),
  unique (user_id, calendar_key)
);

create index calendar_events_key_idx on calendar_events (calendar_key);
create index calendar_events_user_idx on calendar_events (user_id);

alter table calendar_connections enable row level security;
alter table calendar_events enable row level security;

create policy "own connection" on calendar_connections
  for select using (auth.uid() = user_id);
create policy "own calendar events" on calendar_events
  for select using (auth.uid() = user_id);

-- Rolls per-student calendar rows up into the shared schedule. A session
-- publishes automatically once two independent students have it; a single
-- sighting stays unapproved and waits in the admin queue.
create or replace function publish_calendar_sessions()
returns void language plpgsql security definer as $$
begin
  insert into school_sessions (
    title, description, track, source, approved,
    starts_at, ends_at, recurrence, link, calendar_key, attendee_count
  )
  select
    (array_agg(e.title order by e.created_at))[1],
    coalesce((array_agg(nullif(e.description, '') order by e.created_at))[1], ''),
    'hidden'::session_track,
    'calendar'::session_source,
    count(distinct e.user_id) >= 2,
    min(e.starts_at),
    min(e.ends_at),
    coalesce((array_agg(nullif(e.recurrence, '') order by e.created_at))[1], ''),
    coalesce((array_agg(nullif(e.link, '') order by e.created_at))[1], ''),
    e.calendar_key,
    count(distinct e.user_id)
  from calendar_events e
  group by e.calendar_key
  on conflict (calendar_key) where calendar_key is not null do update set
    attendee_count = excluded.attendee_count,
    -- Never un-publish: an admin approval or an earlier threshold hit sticks.
    approved = school_sessions.approved or excluded.approved,
    starts_at = coalesce(school_sessions.starts_at, excluded.starts_at);
end;
$$;
