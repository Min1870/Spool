import { NextResponse } from "next/server";
import { errorResponse, serverError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/require-user";
import { searchMovies, TmdbError } from "@/lib/server/tmdb";

// GET /api/tmdb/search?q=inception: TMDB movie search for the admin's "Link to TMDB" box.
// Signed-in users only: it spends our TMDB quota, and only uploaders need it.

export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  if (q.length > 100) return errorResponse(400, "Search text is too long.");

  try {
    return NextResponse.json({ results: await searchMovies(q) });
  } catch (err) {
    if (err instanceof TmdbError) return errorResponse(err.status, err.message);
    return serverError("tmdb search", err);
  }
}
