import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WatchView } from "@/components/videos/WatchView";
import { embedSnippet, getPublicVideo, listPublicVideos } from "@/lib/server/videos";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// The browser tab title (and link previews) show the video's title.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const video = await getPublicVideo((await params).id);
  return { title: video?.title ?? "Video not found" };
}

// The watch page (docs/design/README.md, screen 7). The server loads the video and a few
// others for "Up next"; WatchView takes over in the browser (polling, the player).
export default async function WatchPage({ params }: Props) {
  const { id } = await params;
  const video = await getPublicVideo(id);
  if (!video) notFound();

  const upNext = (await listPublicVideos({ onlyReady: true, limit: 5 })).filter((v) => v.id !== id).slice(0, 4);

  // key: remount when navigating between videos, so the player starts fresh.
  return <WatchView key={video.id} initial={video} upNext={upNext} embedCode={embedSnippet(video)} />;
}
