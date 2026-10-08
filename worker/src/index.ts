import { readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Queue, QueueEvents, Worker } from "bullmq";
import { TRANSCODE_QUEUE, type TranscodeJobData } from "../../web/shared/video";
import { markFailed } from "./db";
import { env } from "./env";
import { transcodeVideo } from "./transcode";

// The worker process: takes "transcode" jobs from Redis, one (or WORKER_CONCURRENCY)
// at a time, and runs them.
//
// How failures are handled:
//   - transcodeVideo throws (bad file, FFmpeg error, storage down...) → BullMQ retries
//     after 15s, then 30s. After the 3rd failed attempt the video is marked "failed".
//   - The worker process crashes or is killed mid-job → the job's "lock" in Redis
//     expires (nobody renews it), BullMQ notices the job "stalled" and puts it back in
//     the queue. The restarted worker picks it up again. After 2 stalls it's failed.

const connection = { url: env.REDIS_URL };

// Each job cleans up its scratch folder in a `finally` block. But if the process is
// killed mid-job, `finally` never runs and a half-finished folder (hundreds of MB) is left
// behind. At startup no job is running yet, so any spool-* folder in /tmp is such a leftover.
async function removeLeftoverTempDirs() {
  const tmp = os.tmpdir();
  const leftovers = (await readdir(tmp)).filter((name) => name.startsWith("spool-"));
  await Promise.all(leftovers.map((name) => rm(path.join(tmp, name), { recursive: true, force: true })));
  if (leftovers.length) console.log(`[worker] Removed ${leftovers.length} leftover temp folder(s) from a previous crash.`);
}
await removeLeftoverTempDirs();

const worker = new Worker<TranscodeJobData>(
  TRANSCODE_QUEUE,
  async (job) => {
    const log = (msg: string) => console.log(`[job ${job.id} attempt ${job.attemptsMade + 1}] ${msg}`);
    log(`Start (video ${job.data.videoId})`);
    await transcodeVideo(job.data.videoId, log);
    log("Done ✓");
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY,
    // Recover a job from a crashed worker up to 2 times before giving up.
    maxStalledCount: 2,
  },
);

// Every failed ATTEMPT emits "failed". We only mark the video failed when there are no
// attempts left: then the job's state is "failed" (with retries left it's "delayed").
// QueueEvents (not worker.on) also catches jobs failed by the stalled-job checker.
const queue = new Queue<TranscodeJobData>(TRANSCODE_QUEUE, { connection });
const events = new QueueEvents(TRANSCODE_QUEUE, { connection });

events.on("failed", async ({ jobId, failedReason }) => {
  try {
    const job = await queue.getJob(jobId);
    const state = job ? await job.getState() : "unknown";
    if (state === "failed" && job) {
      console.error(`[job ${jobId}] FAILED for good: ${failedReason}`);
      await markFailed(job.data.videoId, failedReason);
    } else {
      console.warn(`[job ${jobId}] attempt failed, will retry: ${failedReason.split("\n")[0]}`);
    }
  } catch (err) {
    console.error(`[job ${jobId}] couldn't record the failure:`, err);
  }
});

worker.on("ready", () => console.log(`[worker] Ready. Waiting for "${TRANSCODE_QUEUE}" jobs (concurrency ${env.WORKER_CONCURRENCY}).`));
worker.on("error", (err) => console.error("[worker] Error:", err.message));
events.on("stalled", ({ jobId }) => console.warn(`[job ${jobId}] stalled (worker crashed?), back in the queue`));

// Graceful shutdown: `docker compose stop` sends SIGTERM. worker.close() stops taking new
// jobs and waits for the current one. If Docker loses patience and kills us anyway, the
// job simply stalls and is retried.
async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, finishing the current job and shutting down…`);
  await worker.close();
  await events.close();
  await queue.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
