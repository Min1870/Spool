"use client";

import { useEffect, useState } from "react";
import { isFinalStatus, type PublicVideo } from "@shared/video";
import { Player } from "./Player";

const POLL_MS = 5000;

const MESSAGE: Record<Exclude<PublicVideo["status"], "ready">, string> = {
  uploading: "This video is still uploading.",
  queued: "This video is being prepared…",
  processing: "This video is being prepared…",
  failed: "This video isn't available.",
};

/**
 * What an <iframe src="/embed/<id>"> shows: just the player, filling the frame. If the
 * video isn't ready yet, a small notice that checks again every few seconds.
 */
export function EmbedView({ initial }: { initial: PublicVideo }) {
  const [video, setVideo] = useState(initial);

  useEffect(() => {
    if (isFinalStatus(video.status)) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/videos/${video.id}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setVideo((await res.json()) as PublicVideo);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [video.id, video.status]);

  if (video.status === "ready" && video.hlsUrl) {
    return <Player variant="embed" src={video.hlsUrl} poster={video.thumbnailUrl} title={video.title} watchUrl={video.watchUrl} />;
  }

  return (
    <div className="stripes-dark flex h-dvh items-end p-4">
      <p className="bg-neutral-900/90 px-3 py-2 text-[13px] font-semibold text-bg" aria-live="polite">
        {MESSAGE[video.status as Exclude<PublicVideo["status"], "ready">]}
      </p>
    </div>
  );
}
