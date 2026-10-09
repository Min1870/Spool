"use client";

import type Hls from "hls.js";
import { Maximize, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Button, Seg } from "@/components/ui";
import { formatDuration } from "@/lib/format";

// The video player (docs/design/README.md, screen 7) on top of hls.js.
//
// How HLS playback works: the browser loads master.m3u8, which lists the renditions
// (480p, 720p) and their bandwidth. hls.js measures how fast segments download and picks
// the best quality the connection can sustain ("Auto"), switching between 6-second
// segments. Chrome/Edge/Firefox need hls.js for this (via Media Source Extensions);
// Safari plays HLS natively, so there we just set the <video> src.

type Level = { index: number; height: number };

export function Player({ src, poster, title }: { src: string; poster?: string | null; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [levels, setLevels] = useState<Level[]>([]);
  const [quality, setQuality] = useState("auto"); // "auto" or a level index
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let hls: Hls | null = null;

    (async () => {
      // Load hls.js only in the browser, and only on pages that play video.
      const { default: HlsClass } = await import("hls.js");
      if (cancelled) return;

      if (HlsClass.isSupported()) {
        hls = new HlsClass();
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(HlsClass.Events.MANIFEST_PARSED, (_e, data) => {
          setLevels(data.levels.map((l, index) => ({ index, height: l.height })).sort((a, b) => a.height - b.height));
        });
        hls.on(HlsClass.Events.LEVEL_SWITCHED, (_e, data) => {
          setActiveHeight(hls?.levels[data.level]?.height ?? null);
        });
        hls.on(HlsClass.Events.ERROR, (_e, data) => {
          if (!data.fatal) return; // hls.js retries small hiccups by itself
          if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
            hls?.startLoad(); // e.g. Wi-Fi dropped: try loading again
          } else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError(); // e.g. a corrupt segment: reset the decoder
          } else {
            setError("This video couldn't be played.");
            hls?.destroy();
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src; // Safari (and iOS): native HLS, quality is chosen automatically
      } else {
        setError("This browser can't play HLS video.");
      }
    })();

    return () => {
      cancelled = true;
      hls?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setError("Playback was blocked. Click play again."));
    else video.pause();
  }

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (video && duration) video.currentTime = Math.min(Math.max(seconds, 0), duration);
  }

  function onScrubberClick(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * duration);
  }

  function onScrubberKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") seekTo(time + 5);
    else if (e.key === "ArrowLeft") seekTo(time - 5);
    else return;
    e.preventDefault();
  }

  function chooseQuality(value: string) {
    setQuality(value);
    // -1 = automatic. A level index = lock to that quality (takes effect at the next segment).
    if (hlsRef.current) hlsRef.current.currentLevel = value === "auto" ? -1 : Number(value);
  }

  const progress = duration ? (time / duration) * 100 : 0;
  const qualityOptions = [
    { value: "auto", label: quality === "auto" && activeHeight ? `Auto · ${activeHeight}p` : "Auto" },
    ...levels.map((l) => ({ value: String(l.index), label: `${l.height}p` })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="relative aspect-video max-h-[72vh] w-full bg-neutral-900">
        <video
          ref={videoRef}
          poster={poster ?? undefined}
          playsInline
          aria-label={title}
          // absolute: the video fills the 16:9 box instead of sizing it. Otherwise a portrait
          // video's own height would stretch the box on narrow screens.
          className="absolute inset-0 size-full cursor-pointer object-contain"
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        />

        {error && (
          <div role="alert" className="absolute inset-x-0 top-0 bg-accent-700 px-4 py-2 text-[13px] font-semibold text-bg">
            {error}
          </div>
        )}

        {/* 80px red play/pause square, bottom left */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="absolute bottom-8 left-6 flex size-20 items-center justify-center bg-accent text-bg hover:bg-accent-600"
        >
          {playing ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}
        </button>

        {/* 6px scrubber along the bottom edge: click (or arrow keys) to seek */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${formatDuration(time)} of ${formatDuration(duration)}`}
          onClick={onScrubberClick}
          onKeyDown={onScrubberKey}
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-pointer bg-bg/30"
        >
          <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] tabular-nums">
          {formatDuration(time)} / {formatDuration(duration)}
        </span>
        <div className="flex items-center gap-3">
          {levels.length > 0 && (
            <Seg name="quality" label="Quality" size="sm" value={quality} options={qualityOptions} onChange={chooseQuality} />
          )}
          <Button variant="secondary" onClick={() => void containerRef.current?.requestFullscreen()} aria-label="Full screen">
            <Maximize size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
