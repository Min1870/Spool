// Shared between the web app (web/) and the worker (worker/, which imports it from
// ../web/shared). The single place where the shape of a video, its statuses, the queue
// name and the storage paths live.
// Keep it dependency-free: plain types, constants and tiny pure functions.

/** Must match the check constraint in supabase/migrations/0001_videos.sql. */
export const VIDEO_STATUSES = ["uploading", "queued", "processing", "ready", "failed"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** A row of the `videos` table, exactly as Supabase returns it. */
export type Video = {
  id: string;
  user_id: string | null;
  title: string;
  status: VideoStatus;
  original_key: string | null;
  hls_key: string | null;
  thumbnail_key: string | null;
  /** Seconds. */
  duration: number | null;
  error: string | null;
  /** ISO timestamp. */
  created_at: string;
};

/**
 * A video as the browser sees it (pages and GET /api/videos/[id]). Storage keys are
 * turned into full URLs on the server, and internal fields (original_key, user_id) are left out.
 */
export type PublicVideo = {
  id: string;
  title: string;
  status: VideoStatus;
  /** Why processing failed, when status is "failed". */
  error: string | null;
  /** Seconds, once processed. */
  duration: number | null;
  createdAt: string;
  /** The HLS master playlist, once ready. */
  hlsUrl: string | null;
  thumbnailUrl: string | null;
  /** The Spool watch page for this video. */
  watchUrl: string;
  /** The chrome-less player page, for <iframe src="...">. */
  embedUrl: string;
};

/** Statuses where the video won't change any more (no need to keep polling). */
export function isFinalStatus(status: VideoStatus): boolean {
  return status === "ready" || status === "failed";
}

/** File types we accept: MP4, MOV and WebM (matches the design's "MP4 · MOV · WebM"). */
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

// ── Queue ────────────────────────────────────────────────────────────────────
/** BullMQ queue name. The web app adds jobs to it; the worker consumes them. */
export const TRANSCODE_QUEUE = "transcode";
/** What a transcode job carries. Just the id: the worker reads everything else from the DB. */
export type TranscodeJobData = { videoId: string };

// ── Storage keys (paths inside a bucket) ─────────────────────────────────────
/**
 * Where the original upload goes, in the PRIVATE bucket: originals/{videoId}/{filename}.
 * The filename is reduced to safe characters, so odd names can't create odd paths.
 */
export function originalKey(videoId: string, filename: string): string {
  const safe =
    filename
      .normalize("NFKD") // "é" → "e" + an accent mark...
      .replace(/[̀-ͯ]/g, "") // ...then drop the accent marks
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 100) || "video";
  return `originals/${videoId}/${safe}`;
}

/** Folder for the HLS output + thumbnail, in the PUBLIC bucket: hls/{videoId}/ */
export function hlsFolder(videoId: string): string {
  return `hls/${videoId}/`;
}

/** The HLS "master playlist" that players open: hls/{videoId}/master.m3u8 */
export function hlsMasterKey(videoId: string): string {
  return `${hlsFolder(videoId)}master.m3u8`;
}

/** The thumbnail image: hls/{videoId}/thumbnail.jpg */
export function thumbnailKey(videoId: string): string {
  return `${hlsFolder(videoId)}thumbnail.jpg`;
}
