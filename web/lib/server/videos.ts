import "server-only";
import type { PublicVideo, Video } from "@shared/video";
import { env } from "./env";
import { supabaseAdmin } from "./supabase";

// Reading videos for pages and the API. The database stores storage KEYS
// (hls/{id}/master.m3u8). Here they become full public URLs using S3_PUBLIC_URL, so
// switching Garage → R2 (a different URL) needs no database changes.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  };
}

/** One video, or null if the id is malformed or unknown. */
export async function getPublicVideo(id: string): Promise<PublicVideo | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabaseAdmin().from("videos").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Couldn't load video: ${error.message}`);
  return data ? toPublicVideo(data as Video) : null;
}

/** Newest first. `ownerId` limits the list to one user's videos ("My videos"). */
export async function listPublicVideos({
  limit = 60,
  onlyReady = false,
  ownerId,
}: { limit?: number; onlyReady?: boolean; ownerId?: string } = {}): Promise<PublicVideo[]> {
  let query = supabaseAdmin().from("videos").select("*").order("created_at", { ascending: false }).limit(limit);
  if (onlyReady) query = query.eq("status", "ready");
  if (ownerId) query = query.eq("user_id", ownerId);
  const { data, error } = await query;
  if (error) throw new Error(`Couldn't load videos: ${error.message}`);
  return (data as Video[]).map(toPublicVideo);
}
