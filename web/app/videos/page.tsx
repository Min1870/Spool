import { PageHeader } from "@/components/PageHeader";
import { Button, Skeleton } from "@/components/ui";

export const metadata = { title: "My videos" };

// Placeholder: the real list (thumbnails, status, durations) arrives in phase 5.
export default function VideosPage() {
  return (
    <div className="flex flex-col gap-6 py-[clamp(32px,5vw,56px)]">
      <PageHeader
        kicker="Library"
        title="My videos"
        actions={
          <Button href="/upload" variant="primary">
            New upload →
          </Button>
        }
      />
      <Skeleton label="Video list — coming in phase 5" className="min-h-[300px]" />
    </div>
  );
}
