import { z } from "zod";

// The worker's configuration. In Docker, docker-compose passes the repo-root .env into
// the container (and points S3_ENDPOINT / REDIS_URL at the other containers).
// zod checks everything at startup, so a missing value stops the worker immediately
// with a clear message, instead of failing halfway through a job.

const schema = z.object({
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).transform((v) => v === "true"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_PUBLIC_BUCKET: z.string().min(1),

  REDIS_URL: z.string().startsWith("redis"),

  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`[worker] Invalid environment variables:\n${problems}`);
  process.exit(1);
}

export const env = parsed.data;
