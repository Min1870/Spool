-- 0002_auth_policies.sql: Row Level Security policies, now that users can sign in.
--
-- How to apply: Supabase dashboard → SQL Editor → New query → paste this file → Run.
-- Safe to run again (each policy is dropped first if it exists).
--
-- Reminder: our server code (API routes, worker) uses the SECRET key, which bypasses
-- these rules entirely. Policies protect the table from the browser-safe PUBLISHABLE key,
-- which anyone can see in the page source. They're a second lock on the door: even if a
-- future feature queries Supabase straight from the browser, people only see what they may.
--
-- Rules:
--   * Anyone (signed in or not) can read videos that are ready, since watch pages are public.
--   * Signed-in users can also read their OWN videos in any status (e.g. still processing).
--   * Nobody can insert/update/delete with the publishable key. Only our server does that.
--     (No insert/update/delete policies = denied.)

drop policy if exists "Ready videos are public" on public.videos;
create policy "Ready videos are public"
  on public.videos for select
  using (status = 'ready');

drop policy if exists "Owners can read their own videos" on public.videos;
create policy "Owners can read their own videos"
  on public.videos for select
  to authenticated
  -- auth.uid() = the id of the signed-in user making the request.
  using (auth.uid() = user_id);

-- "My videos" filters by owner; this index keeps that fast as the table grows.
create index if not exists videos_user_id_created_at_idx on public.videos (user_id, created_at desc);
