import { NextResponse } from "next/server";
import { PUBLIC_CORS_HEADERS } from "@/lib/server/cors";
import { serverError } from "@/lib/server/http";
import { listPublicVideos } from "@/lib/server/videos";

// GET /api/videos: the PUBLIC list of videos, newest first, for other sites (e.g. the MSW
// client site). Only READY videos are listed: nothing half-processed or failed, and no
// information about who uploaded what.
//
//   ?limit=20            how many (1-50)
//   ?tmdb=movie:27205    only videos linked to that TMDB movie ("do you have Inception?")
//   ?linked=true|false   only videos linked / not linked to TMDB
//
//   curl.exe "http://localhost:3000/api/videos?limit=5"

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const requested = Number(search.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : DEFAULT_LIMIT;

  // "movie:27205" → { type: "movie", id: 27205 }
  const tmdbMatch = /^(movie|tv):(\d{1,9})$/.exec(search.get("tmdb") ?? "");
  if (search.has("tmdb") && !tmdbMatch) {
    return NextResponse.json({ error: "tmdb must look like movie:27205" }, { status: 400, headers: PUBLIC_CORS_HEADERS });
  }
  const tmdb = tmdbMatch ? { type: tmdbMatch[1] as "movie" | "tv", id: Number(tmdbMatch[2]) } : undefined;
  const linkedParam = search.get("linked");
  const linked = linkedParam === "true" ? true : linkedParam === "false" ? false : undefined;

  try {
    const videos = await listPublicVideos({ onlyReady: true, limit, tmdb, linked });
    return NextResponse.json(
      { videos },
      {
        headers: {
          ...PUBLIC_CORS_HEADERS,
          // New uploads should show up within a minute; browsers/CDNs may reuse the list until then.
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  } catch (err) {
    const res = serverError("list videos", err);
    for (const [k, v] of Object.entries(PUBLIC_CORS_HEADERS)) res.headers.set(k, v);
    return res;
  }
}

/** CORS preflight (see app/api/videos/[id]/route.ts). */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}
