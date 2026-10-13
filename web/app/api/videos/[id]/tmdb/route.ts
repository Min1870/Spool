import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readJson, serverError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/require-user";
import { supabaseAdmin } from "@/lib/server/supabase";
import { TmdbError } from "@/lib/server/tmdb";
import { getVideoOwnerId, tmdbLinkFields } from "@/lib/server/videos";

// PUT /api/videos/[id]/tmdb  { "tmdbId": 27205 }  → link this video to a TMDB movie
// PUT /api/videos/[id]/tmdb  { "tmdbId": null }   → remove the link
// Only the video's owner may change it.

const bodySchema = z.object({ tmdbId: z.number().int().positive().nullable() });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const { data, response } = await readJson(request, bodySchema);
  if (response) return response;

  const owner = await getVideoOwnerId(id);
  if (!owner) return errorResponse(404, "Video not found.");
  if (owner !== auth.user.id) return errorResponse(403, "Only the uploader can change this video.");

  try {
    const fields = await tmdbLinkFields(data.tmdbId);
    const { error } = await supabaseAdmin().from("videos").update(fields).eq("id", id);
    if (error) return serverError("save tmdb link", error);
    return NextResponse.json({ videoId: id, tmdb: fields.tmdb_id ? { id: fields.tmdb_id, title: fields.tmdb_title, year: fields.tmdb_year } : null });
  } catch (err) {
    if (err instanceof TmdbError) return errorResponse(err.status, err.message);
    return serverError("link tmdb", err);
  }
}
