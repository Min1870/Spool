import type { VideoStatus } from "@shared/video";
import { Tag, type TagVariant } from "@/components/ui";

// The design uses tags for visibility (Public/Unlisted/Private). We have no visibility,
// so the same tag styles show the processing status instead.
const STATUS: Record<VideoStatus, { label: string; variant: TagVariant }> = {
  uploading: { label: "Uploading", variant: "neutral" },
  queued: { label: "Queued", variant: "neutral" },
  processing: { label: "Processing…", variant: "outline" },
  ready: { label: "Ready", variant: "accent" },
  failed: { label: "Failed", variant: "accent" },
};

export function StatusTag({ status }: { status: VideoStatus }) {
  const { label, variant } = STATUS[status];
  return <Tag variant={variant}>{label}</Tag>;
}
