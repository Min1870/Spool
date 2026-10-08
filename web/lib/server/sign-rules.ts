import { z } from "zod";
import type { Video } from "@shared/video";

// The rules for which upload requests our server is willing to sign.
//
// Uppy (in the browser) talks to storage directly, but every request it makes must
// carry a signature from us. This is where we say yes or no. Without these checks,
// anyone could ask us to sign "upload to originals/someone-elses-video/..." or
// "delete this object". We only sign the multipart-upload steps, only for the exact
// storage key we assigned to the video, and only while that video is still uploading.

/** What Uppy sends to signRequest (see @uppy/aws-s3 PresignableRequest). */
export const uppyRequestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  key: z.string().min(1),
  uploadId: z.string().min(1).optional(),
  partNumber: z.number().int().optional(),
});
export type UppyRequest = z.infer<typeof uppyRequestSchema>;

/** The five multipart steps we allow, in a shape that's easy to presign. */
export type SignableRequest =
  | { kind: "create"; key: string }
  | { kind: "uploadPart"; key: string; uploadId: string; partNumber: number }
  | { kind: "complete"; key: string; uploadId: string }
  | { kind: "abort"; key: string; uploadId: string }
  | { kind: "listParts"; key: string; uploadId: string };

/** S3 allows at most 10,000 parts per multipart upload. */
const MAX_PARTS = 10_000;

export type SignDecision = { ok: true; request: SignableRequest } | { ok: false; status: number; error: string };

export function decideSign(video: Pick<Video, "status" | "original_key"> | null, req: UppyRequest): SignDecision {
  if (!video) return { ok: false, status: 404, error: "Video not found." };
  if (!video.original_key || req.key !== video.original_key) {
    return { ok: false, status: 403, error: "That storage key doesn't belong to this upload." };
  }

  const { method, key, uploadId, partNumber } = req;

  // Aborting only throws away this upload's parts, so it's allowed even after the video
  // was marked failed (cancel can reach our server before Uppy's abort request does).
  if (method === "DELETE" && uploadId && (video.status === "uploading" || video.status === "failed")) {
    return { ok: true, request: { kind: "abort", key, uploadId } };
  }
  if (video.status !== "uploading") {
    return { ok: false, status: 409, error: `This video is ${video.status}, not uploading.` };
  }

  // Starting a multipart upload is the only step without an uploadId.
  if (!uploadId) {
    if (method === "POST") return { ok: true, request: { kind: "create", key } };
    // A single-request PUT or a plain DELETE would bypass multipart. Not allowed.
    return { ok: false, status: 400, error: "Only multipart uploads are allowed." };
  }

  switch (method) {
    case "PUT":
      if (partNumber === undefined || partNumber < 1 || partNumber > MAX_PARTS) {
        return { ok: false, status: 400, error: "Invalid part number." };
      }
      return { ok: true, request: { kind: "uploadPart", key, uploadId, partNumber } };
    case "POST":
      return { ok: true, request: { kind: "complete", key, uploadId } };
    case "DELETE":
      return { ok: true, request: { kind: "abort", key, uploadId } };
    case "GET":
      return { ok: true, request: { kind: "listParts", key, uploadId } };
  }
}
