import { NextResponse } from "next/server";
import { z } from "zod";
import { ALLOWED_VIDEO_TYPES, originalKey } from "@shared/video";
import { env } from "@/lib/server/env";
import { errorResponse, readJson, serverError } from "@/lib/server/http";
import { supabaseAdmin } from "@/lib/server/supabase";

// POST /api/uploads: step 1 of an upload.
// The browser says "I want to upload this file". We check the type and size, create
// the `videos` row (status "uploading") and decide where in storage the file will go.
// No video bytes come through here, just this small JSON request.

const bodySchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  filename: z.string().min(1).max(255),
  size: z.number().int().positive("The file is empty."),
  contentType: z.string(),
});

export async function POST(request: Request) {
  const { data, response } = await readJson(request, bodySchema);
  if (response) return response;

  // Validate type and size BEFORE issuing any upload permission (also checked in the
  // browser, but the browser can't be trusted: anyone can call this API directly).
  if (!(ALLOWED_VIDEO_TYPES as readonly string[]).includes(data.contentType)) {
    return errorResponse(415, "Only MP4, MOV and WebM videos are supported.");
  }
  const maxBytes = env().NEXT_PUBLIC_MAX_UPLOAD_MB * 1024 * 1024;
  if (data.size > maxBytes) {
    return errorResponse(413, `That file is too big. The limit is ${env().NEXT_PUBLIC_MAX_UPLOAD_MB} MB.`);
  }

  try {
    const db = supabaseAdmin();

    // 1. Insert the row. Postgres generates the id, and we read it back.
    const { data: row, error } = await db
      .from("videos")
      .insert({ title: data.title, status: "uploading" })
      .select("id")
      .single();
    if (error) return serverError("insert video", error);

    // 2. Now that we know the id, store where the original will live.
    const key = originalKey(row.id, data.filename);
    const { error: updateError } = await db.from("videos").update({ original_key: key }).eq("id", row.id);
    if (updateError) return serverError("save original_key", updateError);

    return NextResponse.json({ videoId: row.id as string, key }, { status: 201 });
  } catch (err) {
    return serverError("create upload", err);
  }
}
