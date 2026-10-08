import "server-only";
import { z } from "zod";

// All server-side configuration, read from the repo-root .env (see next.config.ts).
// `import "server-only"` makes the build fail if a browser component ever imports
// this file, so secrets can't leak into client JavaScript by accident.
//
// zod checks every variable once, on first use. A missing or malformed value fails
// with a clear message naming the variable, instead of a confusing error later.

const schema = z.object({
  APP_ORIGIN: z.url(),

  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).transform((v) => v === "true"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_PUBLIC_BUCKET: z.string().min(1),
  S3_PUBLIC_URL: z.url(),

  REDIS_URL: z.string().startsWith("redis"),

  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_", "SUPABASE_SECRET_KEY should start with sb_secret_"),

  NEXT_PUBLIC_MAX_UPLOAD_MB: z.coerce.number().positive(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables (check the repo-root .env):\n${problems}`);
  }
  cached = parsed.data;
  return cached;
}
