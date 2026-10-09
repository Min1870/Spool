import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readJson, serverError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/require-user";
import { supabaseAdmin } from "@/lib/server/supabase";

// POST /api/uploads/cancel: the user cancelled. Uppy has already told storage to
// throw away the uploaded parts (a signed "abort" request). We just record it.

const bodySchema = z.object({ videoId: z.uuid() });

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const { data, response } = await readJson(request, bodySchema);
  if (response) return response;

  const { data: changed, error } = await supabaseAdmin()
    .from("videos")
    .update({ status: "failed", error: "Upload cancelled." })
    .eq("id", data.videoId)
    // Only your own upload: for someone else's id this matches no row and changes nothing.
    .eq("user_id", auth.user.id)
    // Only an in-progress upload can be cancelled; a finished one is left alone.
    .eq("status", "uploading")
    .select("id"); // return the rows that were actually changed
  if (error) return serverError("cancel upload", error);
  if (!changed.length) return errorResponse(404, "No upload of yours in progress with that id.");

  return NextResponse.json({ videoId: data.videoId, status: "failed" });
}
