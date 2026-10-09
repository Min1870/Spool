import { NextResponse } from "next/server";
import { errorResponse, serverError } from "@/lib/server/http";
import { getPublicVideo } from "@/lib/server/videos";

// GET /api/videos/[id]: a video's status and, once ready, its playback URLs.
// The watch page polls this every few seconds while a video is being processed.
// (Phase 7 opens it up to other websites with CORS headers.)

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const video = await getPublicVideo(id);
    if (!video) return errorResponse(404, "Video not found.");
    return NextResponse.json(video, {
      // Status changes while processing, so never cache this response.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return serverError("get video", err);
  }
}
