"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isFinalStatus, type PublicVideo } from "@shared/video";
import { Button, Kicker, Skeleton } from "@/components/ui";
import { formatDuration, formatWhen } from "@/lib/format";
import { Player } from "./Player";
import { StatusTag } from "./StatusTag";
import { Thumbnail } from "./Thumbnail";

const POLL_MS = 3000;

const WAITING: Record<Exclude<PublicVideo["status"], "ready" | "failed">, { heading: string; hint: string }> = {
  uploading: { heading: "Uploading", hint: "The file is still being uploaded." },
  queued: { heading: "Queued", hint: "Waiting for the worker to pick it up." },
  processing: { heading: "Processing", hint: "Transcoding to 480p and 720p. This page updates by itself." },
};

/**
 * The watch page body. Starts with the video as the server saw it, then, while it's
 * still being processed, asks GET /api/videos/[id] every 3 seconds until it's
 * ready (show the player) or failed (show the error).
 */
export function WatchView({ initial, upNext }: { initial: PublicVideo; upNext: PublicVideo[] }) {
  const [video, setVideo] = useState(initial);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isFinalStatus(video.status)) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/videos/${video.id}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setVideo((await res.json()) as PublicVideo);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [video.id, video.status]);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6 py-[clamp(24px,4vw,40px)]">
      {video.status === "ready" && video.hlsUrl ? (
        <Player src={video.hlsUrl} poster={video.thumbnailUrl} title={video.title} />
      ) : (
        <StatusScreen video={video} />
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] border-t-2 border-divider md:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-4 py-6 md:pr-8">
          <h1 className="text-[clamp(32px,4vw,42px)] tracking-[-0.02em]">{video.title}</h1>
          <div className="flex items-center gap-2 text-[13px] text-neutral-700">
            <StatusTag status={video.status} />
            <span>
              {video.duration != null && `${formatDuration(video.duration)} · `}
              {formatWhen(video.createdAt)}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => void copyLink()}>
              {copied ? "Copied ✓" : "Copy link"}
            </Button>
            <Button variant="secondary" href="/upload">
              Upload another
            </Button>
          </div>
        </section>

        <aside className="flex flex-col gap-3 border-divider py-6 md:border-l-2 md:pl-8">
          <h6 className="text-neutral-700">Up next</h6>
          {upNext.length === 0 && <p className="text-[13px] text-neutral-700">No other videos yet.</p>}
          {upNext.map((v) => (
            <Link
              key={v.id}
              href={`/watch/${v.id}`}
              className="grid grid-cols-[120px_1fr] gap-3 border-b border-divider pb-3 text-text no-underline last:border-b-0 hover:text-accent"
            >
              <Thumbnail video={v} showDuration={false} />
              <span className="flex flex-col gap-1">
                <span className="line-clamp-2 text-[14px] leading-tight font-semibold">{v.title}</span>
                <span className="text-[12px] text-neutral-700">{formatDuration(v.duration)}</span>
              </span>
            </Link>
          ))}
        </aside>
      </div>
    </div>
  );
}

/** Shown instead of the player while the video is uploading, queued, processing or failed. */
function StatusScreen({ video }: { video: PublicVideo }) {
  if (video.status === "failed") {
    return (
      <div className="grid aspect-video max-h-[72vh] w-full grid-cols-1 bg-neutral-900 text-bg">
        <div className="flex flex-col justify-end gap-3 p-8">
          <Kicker className="text-accent-400">Processing failed</Kicker>
          <h2 className="text-[clamp(28px,4vw,40px)]">This video couldn&apos;t be processed.</h2>
          <p role="alert" className="max-w-[640px] font-mono text-[12px] whitespace-pre-wrap text-neutral-300">
            {video.error ?? "Unknown error."}
          </p>
          <div>
            <Button variant="inverse" href="/upload">
              Try another file →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { heading, hint } = WAITING[video.status as keyof typeof WAITING] ?? WAITING.processing;
  return (
    <div className="relative aspect-video max-h-[72vh] w-full">
      <Skeleton tone="dark" className="absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-neutral-900/90 p-6 text-bg" aria-live="polite">
        <div className="flex items-baseline justify-between gap-4">
          <h4>{heading}</h4>
          <span className="text-[13px] text-neutral-300">{hint}</span>
        </div>
        {/* No percentage for processing, so an "in progress" bar that pulses. */}
        <div className="h-2 bg-neutral-700">
          <div className="h-full w-1/3 animate-pulse bg-accent" />
        </div>
      </div>
    </div>
  );
}
