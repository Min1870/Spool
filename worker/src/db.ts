import { createClient } from "@supabase/supabase-js";
import type { Video } from "../../web/shared/video";
import { env } from "./env";

// Database access for the worker. Uses the SECRET key (server-side only), which
// bypasses Row Level Security.
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function getVideo(id: string): Promise<Video | null> {
  const { data, error } = await db.from("videos").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Couldn't load video ${id}: ${error.message}`);
  return data as Video | null;
}

async function update(id: string, fields: Partial<Video>) {
  const { error } = await db.from("videos").update(fields).eq("id", id);
  if (error) throw new Error(`Couldn't update video ${id}: ${error.message}`);
}

export const markProcessing = (id: string) => update(id, { status: "processing", error: null });

export const markReady = (id: string, fields: Pick<Video, "hls_key" | "thumbnail_key" | "duration">) =>
  update(id, { status: "ready", error: null, ...fields });

export const markFailed = (id: string, error: string) =>
  // Keep error messages a reasonable size for the database and the UI.
  update(id, { status: "failed", error: error.slice(0, 2000) });
