import Link from "next/link";
import type { PublicVideo } from "@shared/video";
import { formatWhen } from "@/lib/format";
import { StatusTag } from "./StatusTag";
import { Thumbnail } from "./Thumbnail";

/** One item in the library grid (docs/design/README.md, screen 5). */
export function VideoCard({ video }: { video: PublicVideo }) {
  return (
    <Link
      href={`/watch/${video.id}`}
      className="group flex flex-col gap-3 border-b border-divider pb-4 text-text no-underline hover:text-accent"
    >
      <Thumbnail video={video} />
      <h3 className="line-clamp-2 text-[17px] leading-[1.2] font-extrabold">{video.title}</h3>
      <div className="flex items-center gap-2 text-[13px] text-neutral-700 group-hover:text-accent">
        {video.status !== "ready" && <StatusTag status={video.status} />}
        <span>{formatWhen(video.createdAt)}</span>
      </div>
    </Link>
  );
}
