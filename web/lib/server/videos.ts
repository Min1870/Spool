import "server-only";
import { tmdbPosterUrl, type PublicVideo, type TmdbType, type Video } from "@shared/video";
import { env } from "./env";
import { supabaseAdmin } from "./supabase";
import { getMovie } from "./tmdb";

// Reading videos for pages and the API. The database stores storage KEYS
// (hls/{id}/master.m3u8). Here they become full public URLs using S3_PUBLIC_URL, so
// switching Garage → R2 (a different URL) needs no database changes.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (id: string) => UUID.test(id);

/** Full public URL for a key in the public bucket. */
export function publicUrl(key: string | null): string | null {
  return key ? `${env().S3_PUBLIC_URL.replace(/\/+$/, "")}/${key}` : null;
}

export function toPublicVideo(v: Video): PublicVideo {
  return {
    id: v.id,
    title: v.title,
    status: v.status,
    error: v.status === "failed" ? v.error : null,
    duration: v.duration,
    createdAt: v.created_at,
    // Only hand out playback URLs once the video is really ready.
    hlsUrl: v.status === "ready" ? publicUrl(v.hls_key) : null,
    thumbnailUrl: v.status === "ready" ? publicUrl(v.thumbnail_key) : null,
    watchUrl: appUrl(`/watch/${v.id}`),
    embedUrl: appUrl(`/embed/${v.id}`),
    tmdb:
      v.tmdb_type && v.tmdb_id
        ? {
            type: v.tmdb_type,
            id: v.tmdb_id,
            title: v.tmdb_title,
            year: v.tmdb_year,
            posterUrl: tmdbPosterUrl(v.tmdb_poster_path, "w342"),
          }
        : null,
  };
}

/** Full URL of a page on our own site (APP_ORIGIN), for links other websites use. */
export function appUrl(path: string): string {
  return `${env().APP_ORIGIN.replace(/\/+$/, "")}${path}`;
}

/** The HTML snippet other websites paste to embed a video. */
export function embedSnippet(video: Pick<PublicVideo, "embedUrl" | "title">): string {
  const title = video.title.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<iframe src="${video.embedUrl}" title="${title}" width="640" height="360" style="border:0" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>`;
}

/** One video, or null if the id is malformed or unknown. */
export async function getPublicVideo(id: string): Promise<PublicVideo | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await supabaseAdmin().from("videos").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Couldn't load video: ${error.message}`);
  return data ? toPublicVideo(data as Video) : null;
}

/** Who uploaded a video (null if unknown). Used for "only the owner may edit" checks. */
export async function getVideoOwnerId(id: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const { data } = await supabaseAdmin().from("videos").select("user_id").eq("id", id).maybeSingle();
  return (data?.user_id as string | null | undefined) ?? null;
}

type ListOptions = {
  limit?: number;
  onlyReady?: boolean;
  /** One user's videos ("My videos"). */
  ownerId?: string;
  /** Only videos linked to this TMDB entry ("do you have movie 27205?"). */
  tmdb?: { type: TmdbType; id: number };
  /** true = only videos linked to TMDB; false = only unlinked ones. */
  linked?: boolean;
};

/** Newest first. */
export async function listPublicVideos({ limit = 60, onlyReady = false, ownerId, tmdb, linked }: ListOptions = {}): Promise<PublicVideo[]> {
  let query = supabaseAdmin().from("videos").select("*").order("created_at", { ascending: false }).limit(limit);
  if (onlyReady) query = query.eq("status", "ready");
  if (ownerId) query = query.eq("user_id", ownerId);
  if (tmdb) query = query.eq("tmdb_type", tmdb.type).eq("tmdb_id", tmdb.id);
  if (linked === true) query = query.not("tmdb_id", "is", null);
  if (linked === false) query = query.is("tmdb_id", null);
  const { data, error } = await query;
  if (error) throw new Error(`Couldn't load videos: ${error.message}`);
  return (data as Video[]).map(toPublicVideo);
}

/**
 * Database fields for linking a video to a TMDB movie (or unlinking with null).
 * The title/year/poster are fetched from TMDB here, so we never store what a browser claims.
 * Throws TmdbError if TMDB is off or the movie doesn't exist.
 */
export async function tmdbLinkFields(tmdbId: number | null): Promise<Pick<Video, "tmdb_type" | "tmdb_id" | "tmdb_title" | "tmdb_year" | "tmdb_poster_path">> {
  if (tmdbId === null) {
    return { tmdb_type: null, tmdb_id: null, tmdb_title: null, tmdb_year: null, tmdb_poster_path: null };
  }
  const movie = await getMovie(tmdbId);
  return { tmdb_type: "movie", tmdb_id: movie.id, tmdb_title: movie.title, tmdb_year: movie.year, tmdb_poster_path: movie.posterPath };
}
