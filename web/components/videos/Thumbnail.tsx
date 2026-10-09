import type { PublicVideo } from "@shared/video";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";

const PLACEHOLDER: Record<PublicVideo["status"], string> = {
  uploading: "Uploading…",
  queued: "Queued…",
  processing: "Processing…",
  ready: "",
  failed: "Failed",
};

/** 16:9 thumbnail in black and white (design rule), or a striped placeholder until ready. */
export function Thumbnail({ video, showDuration = true, className }: { video: PublicVideo; showDuration?: boolean; className?: string }) {
  return (
    <div className={cn("relative aspect-video overflow-hidden bg-neutral-200", className)}>
      {video.thumbnailUrl ? (
        // A plain <img>: thumbnails come from our own storage (Garage or R2), whose URL is
        // only known at runtime from S3_PUBLIC_URL, so next/image's host allow-list doesn't fit.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnailUrl} alt="" loading="lazy" className="bw size-full object-cover" />
      ) : (
        <Skeleton label={PLACEHOLDER[video.status]} className="size-full" />
      )}
      {showDuration && video.duration != null && (
        <span className="absolute right-2 bottom-2 bg-text px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-bg">
          {formatDuration(video.duration)}
        </span>
      )}
    </div>
  );
}
