-- 0003_tmdb_link.sql: link a video to a movie on TMDB (themoviedb.org).
--
-- How to apply: Supabase dashboard → SQL Editor → New query → paste this file → Run.
-- Safe to run again.
--
-- A linked video is "the actual movie" for that TMDB entry. Client sites (MSW) look it up by
-- TMDB id and play it instead of the trailer, while title, poster and overview come from TMDB.
--
-- tmdb_type + tmdb_id identify the TMDB entry ('movie' for now; 'tv' is allowed for later).
-- tmdb_title / tmdb_year / tmdb_poster_path are a small copy of TMDB's data, saved when the
-- link is made, so the admin can show "Inception (2010)" without calling TMDB on every page.

alter table public.videos
  add column if not exists tmdb_type text check (tmdb_type in ('movie', 'tv')),
  add column if not exists tmdb_id integer check (tmdb_id > 0),
  add column if not exists tmdb_title text,
  add column if not exists tmdb_year integer,
  add column if not exists tmdb_poster_path text;

-- Either fully linked (type + id) or not linked at all.
alter table public.videos drop constraint if exists videos_tmdb_link_complete;
alter table public.videos add constraint videos_tmdb_link_complete
  check ((tmdb_type is null) = (tmdb_id is null));

-- "Do you have TMDB movie 27205?" is the question client sites ask most. This index answers it fast.
create index if not exists videos_tmdb_idx on public.videos (tmdb_type, tmdb_id) where tmdb_id is not null;
