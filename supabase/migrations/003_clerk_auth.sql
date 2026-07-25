-- Move user identity from Supabase Auth to Clerk.
--
-- Clerk issues string ids ("user_2ab..."), not uuids, so every column that
-- holds a user id becomes text. Supabase stays as the database; it just no
-- longer owns authentication.
--
-- Safe to re-run: each step is guarded.

-- profiles.email lets a Clerk sign-in claim the row that Supabase Auth created,
-- so existing profiles and their calendar data survive the switch.
alter table profiles add column if not exists email text not null default '';

-- The generated fts column depends on nothing here, but the id type change
-- needs the RLS policies dropped first (they reference auth.uid()).
drop policy if exists "own profile read" on profiles;
drop policy if exists "own profile update" on profiles;
drop policy if exists "own verifications" on verifications;
drop policy if exists "own connection" on calendar_connections;
drop policy if exists "own calendar events" on calendar_events;
drop policy if exists "users upload own screenshots" on storage.objects;

-- match_students returns profiles.id, so it must be dropped before the retype.
drop function if exists match_students(vector, int);

alter table profiles          alter column id           type text using id::text;
alter table profiles          alter column id           drop default;
alter table verifications     alter column user_id      type text using user_id::text;
alter table school_sessions   alter column submitted_by type text using submitted_by::text;
alter table calendar_connections alter column user_id   type text using user_id::text;
alter table calendar_events   alter column user_id      type text using user_id::text;

create or replace function match_students (
  query_embedding vector(1024),
  match_count int default 8
) returns table (
  id text, full_name text, startup_name text, one_liner text, bio text,
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

-- Every read and write goes through the service-role key, which bypasses RLS.
-- Keep RLS enabled so nothing is reachable with the publishable key, but drop
-- the auth.uid() policies: that function belongs to the auth system we just left.
alter table profiles enable row level security;
alter table verifications enable row level security;
alter table calendar_connections enable row level security;
alter table calendar_events enable row level security;

-- The shared schedule stays publicly readable.
drop policy if exists "approved sessions readable" on school_sessions;
create policy "approved sessions readable" on school_sessions
  for select using (approved = true);

notify pgrst, 'reload schema';
