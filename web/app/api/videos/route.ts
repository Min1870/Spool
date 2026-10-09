import { NextResponse } from "next/server";
import { PUBLIC_CORS_HEADERS } from "@/lib/server/cors";
import { serverError } from "@/lib/server/http";
import { listPublicVideos } from "@/lib/server/videos";

// GET /api/videos?limit=20: the PUBLIC list of videos, newest first, for other sites
// (e.g. the MSW client site) to show a catalogue. Only READY videos are listed: nothing
// half-processed or failed, and no information about who uploaded what.
//
//   curl.exe "http://localhost:3000/api/videos?limit=5"

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : DEFAULT_LIMIT;

  try {
    const videos = await listPublicVideos({ onlyReady: true, limit });
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
