import { PageHeader } from "@/components/PageHeader";
import { Uploader } from "@/components/upload/Uploader";

export const metadata = { title: "Upload a video" };

export default function UploadPage() {
  return (
    <div className="flex flex-col gap-6 py-[clamp(32px,5vw,56px)]">
      <PageHeader kicker="New upload" title="Upload a video" />
      <Uploader />
    </div>
  );
}
