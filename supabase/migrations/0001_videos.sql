-- 0001_videos.sql: the `videos` table.
--
-- How to apply: Supabase dashboard → SQL Editor → New query → paste this file → Run.
-- Running it twice is safe (everything uses "if not exists").
--
-- One row per uploaded video. The row moves through these statuses:
--
--   uploading  → the browser is sending the original file to storage
--   queued     → upload finished; a transcode job is waiting in the BullMQ queue
--   processing → the worker is running FFmpeg on it
--   ready      → HLS + thumbnail are in the public bucket; it can be played
--   failed     → something went wrong; see the `error` column
--
-- (The same list lives in TypeScript as `VideoStatus`. Keep the two in sync.)

create table if not exists public.videos (
  -- gen_random_uuid() creates the id in the database, e.g. "3f6c...". The API reads it
  -- back right after inserting and uses it in storage paths: originals/{id}/...
  id uuid primary key default gen_random_uuid(),

  -- Who uploaded it. Nullable for now: auth arrives in phase 6.
  -- auth.users is Supabase's built-in users table. "on delete set null" keeps the
  -- video if the account is deleted (change to "cascade" to delete videos too).
  user_id uuid references auth.users (id) on delete set null,

  title text not null check (char_length(title) between 1 and 200),

  status text not null default 'uploading'
    check (status in ('uploading', 'queued', 'processing', 'ready', 'failed')),

  -- Storage keys (paths inside a bucket), not full URLs, so moving from Garage to R2
  -- never requires rewriting rows. The app builds URLs from S3_PUBLIC_URL + key.
  original_key  text,   -- in S3_BUCKET (private),      e.g. originals/{id}/my-video.mp4
  hls_key       text,   -- in S3_PUBLIC_BUCKET (public), e.g. hls/{id}/master.m3u8
  thumbnail_key text,   -- in S3_PUBLIC_BUCKET (public), e.g. hls/{id}/thumbnail.jpg

  -- Length in seconds, measured by ffprobe in the worker. Null until processed.
  duration double precision check (duration is null or duration >= 0),

  -- Human-readable reason when status = 'failed' (e.g. the end of FFmpeg's output).
  error text,

  created_at timestamptz not null default now()
);

-- The video list page shows the newest videos first. This index lets Postgres read
-- them in that order directly, instead of sorting the whole table every time.
create index if not exists videos_created_at_idx on public.videos (created_at desc);

-- Row Level Security (RLS): with RLS on and no policies, the browser-safe
-- "publishable" key can neither read nor write this table. That's what we want for now:
-- every read and write goes through our own server code (Next.js API routes and the
-- worker), which uses the secret key, and the secret key bypasses RLS.
-- Phase 6 adds policies, e.g. "anyone can read ready videos".
alter table public.videos enable row level security;
