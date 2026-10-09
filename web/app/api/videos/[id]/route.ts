import { NextResponse } from "next/server";
import { PUBLIC_CORS_HEADERS } from "@/lib/server/cors";
import { serverError } from "@/lib/server/http";
import { getPublicVideo } from "@/lib/server/videos";

// GET /api/videos/[id]: the PUBLIC video API.
//
// Returns a video's status and, once ready, everything needed to show it elsewhere:
// the HLS playlist, thumbnail, watch page and embed URLs. Used by our own watch page
// (polling while processing) and by other websites. That's why it sends CORS headers.
//
//   curl.exe http://localhost:3000/api/videos/<id>

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const video = await getPublicVideo(id);
    if (!video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404, headers: PUBLIC_CORS_HEADERS });
    }
    return NextResponse.json(video, {
      headers: {
        ...PUBLIC_CORS_HEADERS,
        // Status changes while processing, so never cache this response.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const res = serverError("get video", err);
    for (const [k, v] of Object.entries(PUBLIC_CORS_HEADERS)) res.headers.set(k, v);
    return res;
  }
}

/**
 * The CORS "preflight": before some cross-site requests, browsers first send OPTIONS to
 * ask "may I?". A plain GET doesn't need it, but answering keeps every client happy.
 */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}
