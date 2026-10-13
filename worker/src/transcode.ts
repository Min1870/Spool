import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { UnrecoverableError } from "bullmq";
import { hlsFolder, hlsMasterKey, thumbnailKey } from "../../web/shared/video";
import { getVideo, markProcessing, markReady } from "./db";
import { ffmpeg, probe } from "./ffmpeg";
import { buildHlsArgs, buildThumbnailArgs, describePlan, planHls, thumbnailSeconds } from "./hls";
import { clearPublicFolder, downloadOriginal, uploadFolder } from "./storage";

/**
 * Process one video: download → FFmpeg → upload → mark ready.
 *
 * If anything throws, BullMQ retries the job (3 attempts in total, see web/lib/server/queue.ts).
 * Marking the video "failed" after the LAST attempt happens in index.ts.
 */
export async function transcodeVideo(videoId: string, log: (msg: string) => void): Promise<void> {
  const video = await getVideo(videoId);
  // UnrecoverableError = "don't retry": retrying won't make a deleted row reappear.
  if (!video) throw new UnrecoverableError(`Video ${videoId} not found in the database.`);
  if (!video.original_key) throw new UnrecoverableError(`Video ${videoId} has no original file.`);
  if (video.status === "ready") {
    log("Already ready, nothing to do.");
    return; // e.g. a duplicate job: transcoding again would waste minutes of CPU
  }

  await markProcessing(videoId);

  // A private scratch folder for this job, e.g. /tmp/spool-a1b2c3/. Removed in `finally`,
  // on success AND on failure, so the disk doesn't fill up with half-finished videos.
  const workDir = await mkdtemp(path.join(os.tmpdir(), "spool-"));
  try {
    const input = path.join(workDir, "original" + path.extname(video.original_key));
    const outDir = path.join(workDir, "out");
    await mkdir(outDir);

    log(`Downloading ${video.original_key}`);
    await downloadOriginal(video.original_key, input);

    const info = await probe(input);
    const v = info.video;
    log(
      `Duration ${info.duration.toFixed(1)}s, video ${v.codec} ${v.width}x${v.height} ${v.pixFmt}` +
        `${v.rotation ? ` rotated ${v.rotation}°` : ""}${v.bitRateKbps ? ` ${v.bitRateKbps} kbit/s` : ""}, ` +
        `audio ${info.audio?.codec ?? "none"}`,
    );

    // Copy the original when it's already browser-friendly (minutes), otherwise re-encode (hours for a movie).
    const plan = planHls(info);
    log(`Plan: ${describePlan(plan)}`);
    const started = Date.now();
    await ffmpeg(buildHlsArgs(input, outDir, plan));
    log(`HLS ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);

    await ffmpeg(buildThumbnailArgs(input, path.join(outDir, "thumbnail.jpg"), thumbnailSeconds(info.duration)));

    // Remove any output from an earlier run of this video first (retries, re-processing).
    const stale = await clearPublicFolder(hlsFolder(videoId));
    if (stale) log(`Removed ${stale} old files from ${hlsFolder(videoId)}`);
    const count = await uploadFolder(outDir, hlsFolder(videoId));
    log(`Uploaded ${count} files to ${hlsFolder(videoId)}`);

    await markReady(videoId, {
      hls_key: hlsMasterKey(videoId),
      thumbnail_key: thumbnailKey(videoId),
      duration: Math.round(info.duration * 100) / 100,
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
