import { isFinalStatus } from "@shared/video";
import { PageHeader } from "@/components/PageHeader";
import { Button, Skeleton } from "@/components/ui";
import { AutoRefresh } from "@/components/videos/AutoRefresh";
import { VideoCard } from "@/components/videos/VideoCard";
import { listPublicVideos } from "@/lib/server/videos";

export const metadata = { title: "My videos" };
// Always read fresh data from the database (never serve a cached copy of this page).
export const dynamic = "force-dynamic";

// The library (docs/design/README.md, screen 5). A Server Component: it reads the
// database on the server and sends finished HTML to the browser. No API call needed.
// Until auth arrives in phase 6, "My videos" shows every video.
export default async function VideosPage() {
  const videos = await listPublicVideos();
  const stillWorking = videos.some((v) => !isFinalStatus(v.status));

  return (
    <div className="flex flex-col gap-6 py-[clamp(32px,5vw,56px)]">
      <PageHeader
        kicker={`${videos.length} ${videos.length === 1 ? "video" : "videos"}`}
        title="My videos"
        actions={
          <Button href="/upload" variant="primary">
            New upload →
          </Button>
        }
      />

      {videos.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] border-2 border-divider">
          <div className="flex flex-col items-start gap-4 p-8">
            <h2 className="text-[clamp(28px,4vw,40px)]">No videos yet.</h2>
            <p className="text-[16px]">Upload your first one. It plays here as soon as it&apos;s processed.</p>
            <Button href="/upload" variant="primary" size="lg" spread className="min-w-[220px]">
              Upload a video <span aria-hidden>→</span>
            </Button>
          </div>
          <Skeleton label="Your videos appear here" className="min-h-[240px] border-l-2 border-divider" />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-6 gap-y-8">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}

      <AutoRefresh active={stillWorking} />
    </div>
  );
}
