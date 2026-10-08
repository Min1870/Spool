import path from "node:path";

// Pure helpers: they only build values, with no network, disk or env access, so they're
// easy to unit-test (see hls.test.ts).

/** What ffprobe tells us about the uploaded file. */
export type ProbeResult = {
  /** Seconds. */
  duration: number;
  hasAudio: boolean;
};

export const SEGMENT_SECONDS = 6;

/**
 * The two renditions from the spec. `maxrate` caps the video bitrate (kbit/s): quality is
 * still set by CRF 23, but busy scenes can't spike above the cap. It also gives FFmpeg a
 * real number to write as BANDWIDTH in master.m3u8, which hls.js uses to pick a quality
 * for the viewer's connection. (Without a cap, both renditions get the same bogus value.)
 */
export const RENDITIONS = [
  { name: "480p", height: 480, maxrate: 1400 },
  { name: "720p", height: 720, maxrate: 2800 },
] as const;

/**
 * FFmpeg arguments that turn one input video into HLS at 480p and 720p, in ONE pass
 * (the input is decoded once and fed to both encoders).
 *
 * Output layout inside `outDir`:
 *   master.m3u8          ← the playlist players open; lists both renditions
 *   480p/index.m3u8      ← the list of 480p segments
 *   480p/seg_000.ts ...  ← 6-second chunks of video
 *   720p/index.m3u8, 720p/seg_000.ts ...
 */
export function buildHlsArgs(input: string, outDir: string, probe: ProbeResult): string[] {
  // "split" the decoded video into two copies, then scale each one.
  // scale=-2:480 → height 480, width chosen to keep the aspect ratio (and even, which H.264 needs).
  const filter =
    `[0:v]split=${RENDITIONS.length}` +
    RENDITIONS.map((_, i) => `[v${i}]`).join("") +
    ";" +
    RENDITIONS.map((r, i) => `[v${i}]scale=-2:${r.height}[v${r.name}]`).join(";");

  const args = ["-hide_banner", "-y", "-i", input, "-filter_complex", filter];

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

  // Audio: the same AAC track for each rendition (HLS wants audio inside each variant).
  if (probe.hasAudio) {
    for (const _ of RENDITIONS) args.push("-map", "0:a:0");
    args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");
  }

  // Pair video i with audio i, and name each rendition (the name becomes the folder: %v).
  const streamMap = RENDITIONS.map((r, i) => (probe.hasAudio ? `v:${i},a:${i},name:${r.name}` : `v:${i},name:${r.name}`)).join(" ");

  args.push(
    "-f", "hls",
    "-hls_time", String(SEGMENT_SECONDS),
    "-hls_playlist_type", "vod", // the whole video is known up front (not a live stream)
    "-hls_flags", "independent_segments",
    "-hls_segment_filename", path.posix.join(outDir, "%v", "seg_%03d.ts"),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", streamMap,
    path.posix.join(outDir, "%v", "index.m3u8"),
  );
  return args;
}

/** Where to grab the thumbnail: 10% into the video (skips black intros), at most 10s in. */
export function thumbnailSeconds(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration * 0.1, 10);
}

/** FFmpeg arguments for one 720p JPEG frame. -ss before -i = fast seek. */
export function buildThumbnailArgs(input: string, output: string, atSeconds: number): string[] {
  return ["-hide_banner", "-y", "-ss", atSeconds.toFixed(2), "-i", input, "-frames:v", "1", "-vf", "scale=-2:720", "-q:v", "3", output];
}

/** Parse `ffprobe -print_format json -show_format -show_streams` output. */
export function parseProbe(json: string): ProbeResult {
  const data = JSON.parse(json) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; duration?: string }>;
  };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error("This file has no video track.");
  const duration = Number(data.format?.duration ?? video.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Couldn't read the video's duration.");
  return { duration, hasAudio: streams.some((s) => s.codec_type === "audio") };
}

/** Last few lines of FFmpeg's log: where the actual error message is. */
export function stderrTail(stderr: string, lines = 6): string {
  return stderr.trim().split(/\r?\n/).slice(-lines).join("\n");
}

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
