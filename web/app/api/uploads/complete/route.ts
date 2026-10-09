import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/server/env";
import { errorResponse, readJson, serverError } from "@/lib/server/http";
import { transcodeQueue } from "@/lib/server/queue";
import { requireUser } from "@/lib/server/require-user";
import { originalSize } from "@/lib/server/s3";
import { supabaseAdmin } from "@/lib/server/supabase";

// POST /api/uploads/complete: the browser says "my upload finished".
// We don't just believe it: we ask storage whether the file really exists (and isn't
// over the size limit). Then we mark the video "queued" and add a transcode job.

const bodySchema = z.object({ videoId: z.uuid() });

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const { data, response } = await readJson(request, bodySchema);
  if (response) return response;
  const { videoId } = data;

  try {
    const db = supabaseAdmin();
    const { data: video, error } = await db
      .from("videos")
      .select("status, original_key, user_id")
      .eq("id", videoId)
      .maybeSingle();
    if (error) return serverError("load video", error);
    if (!video) return errorResponse(404, "Video not found.");
    if (video.user_id !== auth.user.id) return errorResponse(403, "This upload belongs to someone else.");

    // Calling "complete" twice (e.g. a double click or a retry) is harmless.
    if (video.status !== "uploading") return NextResponse.json({ videoId, status: video.status });
    if (!video.original_key) return errorResponse(409, "This video has no upload.");

    // 1. Does the file actually exist in storage?
    const size = await originalSize(video.original_key);
    if (size === null) return errorResponse(409, "The upload isn't in storage yet. Please retry.");
    if (size > env().NEXT_PUBLIC_MAX_UPLOAD_MB * 1024 * 1024) {
      await db.from("videos").update({ status: "failed", error: "File is over the size limit." }).eq("id", videoId);
      return errorResponse(413, "That file is too big.");
    }

    // 2. Mark it queued BEFORE adding the job. The other order has a race: a fast
    //    worker could set "processing" and then we'd overwrite it with "queued".
    //    The .eq("status", "uploading") makes this a no-op if something else already moved it on.
    const { error: queuedError } = await db
      .from("videos")
      .update({ status: "queued" })
      .eq("id", videoId)
      .eq("status", "uploading");
    if (queuedError) return serverError("mark queued", queuedError);

    // 3. Add the job. jobId = videoId, so BullMQ ignores a second job for the same video.
    try {
      await transcodeQueue().add("transcode", { videoId }, { jobId: videoId });
    } catch (err) {
      // Redis is down or unreachable: don't leave the video stuck in "queued" forever.
      await db.from("videos").update({ status: "failed", error: "Couldn't queue the video for processing." }).eq("id", videoId);
      return serverError("add transcode job", err);
    }

    return NextResponse.json({ videoId, status: "queued" });
  } catch (err) {
    return serverError("complete upload", err);
  }
}
