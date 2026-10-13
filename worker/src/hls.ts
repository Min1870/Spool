import path from "node:path";

// Pure helpers: they only build values, with no network, disk or env access, so they're
// easy to unit-test (see hls.test.ts).

/** The video track, as ffprobe describes it. */
export type VideoInfo = {
  codec: string; // e.g. "h264", "hevc"
  profile: string; // e.g. "High", "High 10"
  pixFmt: string; // e.g. "yuv420p" (8-bit), "yuv420p10le" (10-bit)
  width: number;
  height: number;
  /** Degrees the player must rotate the picture (phone videos often say 90 or -90). */
  rotation: number;
  /** Video bitrate in kbit/s, if the file says. */
  bitRateKbps: number | null;
};

/** What ffprobe tells us about the uploaded file. */
export type ProbeResult = {
  /** Seconds. */
  duration: number;
  video: VideoInfo;
  /** First audio track, or null for silent videos. */
  audio: { codec: string } | null;
};

export const SEGMENT_SECONDS = 6;

// ── Planning: copy or encode? ───────────────────────────────────────────────
//
// Re-encoding a 2-hour movie takes hours. But if the file is ALREADY in a format every
// browser can play (H.264 video, 8-bit, upright), we don't have to re-encode it: we can
// COPY the video into HLS segments ("remux"), which takes minutes and keeps the original
// quality. We then add one small 480p encode so slow connections still get a smooth stream.
//
// If the file isn't browser-friendly (H.265, 10-bit/HDR, rotated phone video, 4K, huge
// bitrate), we fall back to encoding everything: 480p + 720p.

/** Copying is only safe up to this size and bitrate (bigger would stutter for many viewers). */
const MAX_COPY_SHORT_SIDE = 1080;
const MAX_COPY_KBPS = 12_000;
/** Only add a 480p version when the original is noticeably bigger than 480p... */
const ADD_480P_ABOVE = 540;
/** ...and noticeably heavier: a 480p copy is capped at 1400 kbit/s, so below this it saves nothing. */
const ADD_480P_ABOVE_KBPS = 2000;

/**
 * "Resolution" means the SHORT side, so portrait phone videos work too: a 1080x1920 video
 * is "1080p", and its 480p version is 480x854 (not a tiny 270x480).
 */
export const shortSide = (v: Pick<VideoInfo, "width" | "height">) => Math.min(v.width, v.height);

/**
 * FFmpeg scale filter that makes the SHORT side `size` pixels and keeps the aspect ratio.
 * -2 means "whatever keeps the aspect ratio, rounded to an even number" (H.264 needs even sizes).
 */
export const scaleShortSide = (size: number) => `scale=w='if(gt(iw,ih),-2,${size})':h='if(gt(iw,ih),${size},-2)'`;

export type AudioPlan = "copy" | "aac" | "none";

export type HlsPlan =
  | {
      mode: "copy";
      /** Rendition name for the copied original, e.g. "1080p" (also its folder). */
      topName: string;
      /** Also encode a 480p version (when the original is bigger than ~540p). */
      add480: boolean;
      audio: AudioPlan;
    }
  | {
      mode: "encode";
      /** Why copying wasn't possible (logged, so you can see the worker's decision). */
      reasons: string[];
      audio: Exclude<AudioPlan, "copy">;
    };

/** Reasons the video can't simply be copied. Empty list = copying is fine. */
export function copyBlockers(v: VideoInfo): string[] {
  const reasons: string[] = [];
  if (v.codec !== "h264") reasons.push(`video codec is ${v.codec}, not H.264`);
  if (!["yuv420p", "yuvj420p"].includes(v.pixFmt)) reasons.push(`pixel format ${v.pixFmt} (not 8-bit 4:2:0)`);
  if (/10|422|444/.test(v.profile)) reasons.push(`H.264 profile "${v.profile}" isn't widely supported`);
  if (v.rotation % 360 !== 0) reasons.push(`video is rotated ${v.rotation}° (copying would play it sideways)`);
  if (shortSide(v) > MAX_COPY_SHORT_SIDE) reasons.push(`${shortSide(v)}p is bigger than ${MAX_COPY_SHORT_SIDE}p`);
  if (v.bitRateKbps !== null && v.bitRateKbps > MAX_COPY_KBPS) reasons.push(`bitrate ${v.bitRateKbps} kbit/s is too high to stream as-is`);
  return reasons;
}

export function planHls(probe: ProbeResult): HlsPlan {
  const reasons = copyBlockers(probe.video);
  if (reasons.length) return { mode: "encode", reasons, audio: probe.audio ? "aac" : "none" };
  const { bitRateKbps } = probe.video;
  return {
    mode: "copy",
    topName: `${shortSide(probe.video)}p`,
    // A smaller version only helps if it's actually smaller: bigger picture AND heavier stream.
    // (Unknown bitrate: assume it's worth it.)
    add480: shortSide(probe.video) > ADD_480P_ABOVE && (bitRateKbps === null || bitRateKbps > ADD_480P_ABOVE_KBPS),
    // AAC audio plays everywhere, so copy it too; anything else (AC3, DTS, Opus...) is
    // converted. That's cheap: audio is tiny next to video.
    audio: !probe.audio ? "none" : probe.audio.codec === "aac" ? "copy" : "aac",
  };
}

/** One-line summary for the logs, e.g. "copy 1080p + encode 480p, audio copy". */
export function describePlan(plan: HlsPlan): string {
  return plan.mode === "copy"
    ? `copy ${plan.topName}${plan.add480 ? " + encode 480p" : ""}, audio ${plan.audio}`
    : `encode 480p + 720p (${plan.reasons.join("; ")}), audio ${plan.audio}`;
}

// ── FFmpeg arguments ────────────────────────────────────────────────────────

/** Renditions for the full ENCODE fallback. maxrate caps the bitrate (kbit/s) at CRF 23. */
export const RENDITIONS = [
  { name: "480p", height: 480, maxrate: 1400 },
  { name: "720p", height: 720, maxrate: 2800 },
] as const;

const P480 = RENDITIONS[0];

/** -c:a ... for the chosen audio plan. */
function audioCodecArgs(audio: AudioPlan): string[] {
  if (audio === "copy") return ["-c:a", "copy"];
  if (audio === "aac") return ["-c:a", "aac", "-b:a", "128k", "-ac", "2"];
  return [];
}

/** The HLS muxer settings shared by both plans. */
function hlsOutputArgs(outDir: string, names: string[], hasAudio: boolean): string[] {
  // Pair video i with audio i, and name each rendition (the name becomes the folder: %v).
  const streamMap = names.map((name, i) => (hasAudio ? `v:${i},a:${i},name:${name}` : `v:${i},name:${name}`)).join(" ");
  return [
    "-f", "hls",
    "-hls_time", String(SEGMENT_SECONDS),
    "-hls_playlist_type", "vod", // the whole video is known up front (not a live stream)
    "-hls_flags", "independent_segments",
    "-hls_segment_filename", path.posix.join(outDir, "%v", "seg_%03d.ts"),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", streamMap,
    path.posix.join(outDir, "%v", "index.m3u8"),
  ];
}

/**
 * FFmpeg arguments that turn one input video into HLS, following the plan, in ONE pass.
 *
 * Output layout inside `outDir`:
 *   master.m3u8          ← the playlist players open; lists every rendition
 *   <name>/index.m3u8    ← one per rendition (e.g. 1080p/, 480p/)
 *   <name>/seg_000.ts …  ← chunks of video
 */
export function buildHlsArgs(input: string, outDir: string, plan: HlsPlan): string[] {
  const args = ["-hide_banner", "-y", "-i", input];
  const hasAudio = plan.audio !== "none";

  if (plan.mode === "copy") {
    const names = [plan.topName];
    if (plan.add480) args.push("-filter_complex", `[0:v]${scaleShortSide(P480.height)}[v480p]`);

    // Rendition 0: the original video, copied as-is. No decoding, no quality loss.
    args.push("-map", "0:v:0", "-c:v:0", "copy");

    if (plan.add480) {
      names.push(P480.name);
      // Rendition 1: a small H.264 encode for slow connections. Keyframes are placed
      // exactly where the original has them ("source"), so both renditions' segments
      // start at the same moments and the player can switch between them cleanly.
      args.push(
        "-map", "[v480p]",
        "-c:v:1", "libx264",
        "-crf:v:1", "23",
        "-maxrate:v:1", `${P480.maxrate}k`,
        "-bufsize:v:1", `${P480.maxrate * 2}k`,
        "-preset:v:1", "veryfast",
        "-pix_fmt:v:1", "yuv420p",
        "-force_key_frames:v:1", "source",
        "-sc_threshold:v:1", "0",
      );
    }

    if (hasAudio) for (const _ of names) args.push("-map", "0:a:0");
    args.push(...audioCodecArgs(plan.audio));
    args.push(...hlsOutputArgs(outDir, names, hasAudio));
    return args;
  }

  // ENCODE fallback: decode once, "split" the picture into two copies, scale each one
  // so its short side is 480 / 720 (works for landscape and portrait videos).
  const filter =
    `[0:v]split=${RENDITIONS.length}` +
    RENDITIONS.map((_, i) => `[v${i}]`).join("") +
    ";" +
    RENDITIONS.map((r, i) => `[v${i}]${scaleShortSide(r.height)}[v${r.name}]`).join(";");
  args.push("-filter_complex", filter);

  // One video output per rendition: H.264, quality-based (-crf 23, lower = better/bigger),
  // capped at maxrate. bufsize (2× maxrate) is how much the bitrate may vary around the cap.
  RENDITIONS.forEach((r, i) => {
    args.push(
      "-map", `[v${r.name}]`,
      `-c:v:${i}`, "libx264",
      `-crf:v:${i}`, "23",
      `-maxrate:v:${i}`, `${r.maxrate}k`,
      `-bufsize:v:${i}`, `${r.maxrate * 2}k`,
    );
  });
  args.push(
    "-preset", "veryfast", // encoding speed vs. file size; veryfast keeps laptops/small VPSs responsive
    "-pix_fmt", "yuv420p", // the colour format every browser and phone can decode
    // A keyframe exactly every 6 seconds, in both renditions, so segments line up and the
    // player can switch quality at any segment boundary.
    "-force_key_frames", `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    "-sc_threshold", "0",
  );

  if (hasAudio) for (const _ of RENDITIONS) args.push("-map", "0:a:0");
  args.push(...audioCodecArgs(plan.audio));
  args.push(...hlsOutputArgs(outDir, RENDITIONS.map((r) => r.name), hasAudio));
  return args;
}

// ── Thumbnail ───────────────────────────────────────────────────────────────

/** Where to grab the thumbnail: 10% into the video (skips black intros), at most 10s in. */
export function thumbnailSeconds(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration * 0.1, 10);
}

/** FFmpeg arguments for one 720p JPEG frame. -ss before -i = fast seek. */
export function buildThumbnailArgs(input: string, output: string, atSeconds: number): string[] {
  return ["-hide_banner", "-y", "-ss", atSeconds.toFixed(2), "-i", input, "-frames:v", "1", "-vf", "scale=-2:720", "-q:v", "3", output];
}

// ── Probing ─────────────────────────────────────────────────────────────────

type RawStream = {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  bit_rate?: string;
  duration?: string;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number }>;
};

/** Parse `ffprobe -print_format json -show_format -show_streams` output. */
export function parseProbe(json: string): ProbeResult {
  const data = JSON.parse(json) as { format?: { duration?: string; bit_rate?: string }; streams?: RawStream[] };
  const streams = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error("This file has no video track.");
  const a = streams.find((s) => s.codec_type === "audio");

  const duration = Number(data.format?.duration ?? v.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Couldn't read the video's duration.");

  // Rotation lives in "side data" (newer files) or a "rotate" tag (older ones).
  const rotation = Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0) || 0;
  const bitRate = Number(v.bit_rate ?? data.format?.bit_rate);

  return {
    duration,
    video: {
      codec: v.codec_name ?? "unknown",
      profile: v.profile ?? "",
      pixFmt: v.pix_fmt ?? "unknown",
      width: v.width ?? 0,
      height: v.height ?? 0,
      rotation,
      bitRateKbps: Number.isFinite(bitRate) && bitRate > 0 ? Math.round(bitRate / 1000) : null,
    },
    audio: a ? { codec: a.codec_name ?? "unknown" } : null,
  };
}

/** Last few lines of FFmpeg's log: where the actual error message is. */
export function stderrTail(stderr: string, lines = 6): string {
  return stderr.trim().split(/\r?\n/).slice(-lines).join("\n");
}

// ── Upload headers ──────────────────────────────────────────────────────────

/** Content-Type per file extension. Players rely on these to treat files correctly. */
export function contentTypeFor(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".m3u8":
      return "application/vnd.apple.mpegurl";
    case ".ts":
      return "video/mp2t";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

/**
 * How long browsers/CDNs may cache each file. Segments never change once written, so
 * they can be cached for a year. Playlists get a short cache, so a re-processed video
 * shows up quickly.
 */
export function cacheControlFor(file: string): string {
  return path.extname(file) === ".ts" ? "public, max-age=31536000, immutable" : "public, max-age=300";
}
