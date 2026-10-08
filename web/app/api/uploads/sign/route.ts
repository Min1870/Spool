import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readJson, serverError } from "@/lib/server/http";
import { presign } from "@/lib/server/s3";
import { decideSign, uppyRequestSchema } from "@/lib/server/sign-rules";
import { supabaseAdmin } from "@/lib/server/supabase";

// POST /api/uploads/sign: called by Uppy for EVERY request it sends to storage
// (start the multipart upload, upload part 1, 2, 3..., complete, or abort).
// We check the request against the rules in sign-rules.ts and, if it's allowed,
// return a presigned URL that's valid for 15 minutes.

const bodySchema = z.object({
  videoId: z.uuid(),
  request: uppyRequestSchema,
});

export async function POST(request: Request) {
  const { data, response } = await readJson(request, bodySchema);
  if (response) return response;

  try {
    const { data: video, error } = await supabaseAdmin()
      .from("videos")
      .select("status, original_key")
      .eq("id", data.videoId)
      .maybeSingle();
    if (error) return serverError("load video for signing", error);

    const decision = decideSign(video, data.request);
    if (!decision.ok) return errorResponse(decision.status, decision.error);

    const url = await presign(decision.request);
    return NextResponse.json({ url });
  } catch (err) {
    return serverError("sign request", err);
  }
}
