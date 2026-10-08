import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, serverError } from "@/lib/server/http";
import { supabaseAdmin } from "@/lib/server/supabase";

// POST /api/uploads/cancel: the user cancelled. Uppy has already told storage to
// throw away the uploaded parts (a signed "abort" request). We just record it.

const bodySchema = z.object({ videoId: z.uuid() });

export async function POST(request: Request) {
  const { data, response } = await readJson(request, bodySchema);
  if (response) return response;

  const { error } = await supabaseAdmin()
    .from("videos")
    .update({ status: "failed", error: "Upload cancelled." })
    .eq("id", data.videoId)
    // Only an in-progress upload can be cancelled; a finished one is left alone.
    .eq("status", "uploading");
  if (error) return serverError("cancel upload", error);

  return NextResponse.json({ videoId: data.videoId, status: "failed" });
}
