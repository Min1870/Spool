import "server-only";
import { Queue } from "bullmq";
import { TRANSCODE_QUEUE, type TranscodeJobData } from "@shared/video";
import { env } from "./env";

// The BullMQ queue the web app ADDS jobs to (the worker, phase 4, takes them out).
// A job is just { videoId }: the worker looks everything else up in the database.
//
// In development, Next.js re-runs modules on every code change. Keeping the queue on
// globalThis means we reuse one Redis connection instead of opening a new one each time.
const globalForQueue = globalThis as unknown as { transcodeQueue?: Queue<TranscodeJobData> };

export function transcodeQueue(): Queue<TranscodeJobData> {
  globalForQueue.transcodeQueue ??= new Queue<TranscodeJobData>(TRANSCODE_QUEUE, {
    connection: { url: env().REDIS_URL },
    defaultJobOptions: {
      // 1 try + 2 retries. If FFmpeg fails or the worker crashes, the job runs again.
      attempts: 3,
      // Wait 15s before the 1st retry, 30s before the 2nd (doubles each time).
      backoff: { type: "exponential", delay: 15_000 },
      // Don't keep finished jobs in Redis forever.
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  return globalForQueue.transcodeQueue;
}
