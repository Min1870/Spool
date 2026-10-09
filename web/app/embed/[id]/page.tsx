import type { Metadata } from "next";
import { EmbedView } from "@/components/videos/EmbedView";
import { getPublicVideo } from "@/lib/server/videos";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const video = await getPublicVideo((await params).id);
  // Embeds shouldn't show up in search results as separate pages.
  return { title: video?.title ?? "Video not found", robots: { index: false } };
}

// /embed/<id>: the page other websites put in an <iframe>. It's outside app/(site), so
// there's no Spool nav or footer, only the player. next.config.ts allows THIS page (and
// only this page) to be framed by any website.
export default async function EmbedPage({ params }: Props) {
  const { id } = await params;
  const video = await getPublicVideo(id);

  if (!video) {
    return (
      <div className="stripes-dark flex h-dvh items-end p-4">
        <p className="bg-neutral-900/90 px-3 py-2 text-[13px] font-semibold text-bg">Video not found.</p>
      </div>
    );
  }
  return <EmbedView initial={video} />;
}
