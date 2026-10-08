import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";
import type { SignableRequest } from "./sign-rules";

// One S3 client for Garage locally and Cloudflare R2 in production. Only env vars differ.
let client: S3Client | undefined;

export function s3(): S3Client {
  client ??= new S3Client({
    endpoint: env().S3_ENDPOINT,
    region: env().S3_REGION,
    forcePathStyle: env().S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env().S3_ACCESS_KEY, secretAccessKey: env().S3_SECRET_KEY },
    // Newer AWS SDKs add CRC32 checksums to every request by default. Presigned upload
    // URLs would then demand a checksum the browser never sends, and S3-compatible
    // services (Garage, R2) can reject them. Only add checksums when S3 requires one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

/** How long a presigned URL stays valid. Uppy asks for a fresh one per request. */
export const PRESIGN_SECONDS = 15 * 60;

/**
 * Turn an (already validated) Uppy request into a presigned URL for the private bucket.
 * A presigned URL is a normal S3 URL plus a signature in the query string. Anyone holding
 * it can do exactly that one operation, on that one key, until it expires.
 */
export async function presign(request: SignableRequest): Promise<string> {
  const Bucket = env().S3_BUCKET;
  const { key: Key } = request;

  const options = { expiresIn: PRESIGN_SECONDS };

  switch (request.kind) {
    case "create":
      return getSignedUrl(s3(), new CreateMultipartUploadCommand({ Bucket, Key }), options);
    case "uploadPart":
      return getSignedUrl(
        s3(),
        new UploadPartCommand({ Bucket, Key, UploadId: request.uploadId, PartNumber: request.partNumber }),
        options,
      );
    case "complete":
      return getSignedUrl(s3(), new CompleteMultipartUploadCommand({ Bucket, Key, UploadId: request.uploadId }), options);
    case "abort":
      return getSignedUrl(s3(), new AbortMultipartUploadCommand({ Bucket, Key, UploadId: request.uploadId }), options);
    case "listParts":
      return getSignedUrl(s3(), new ListPartsCommand({ Bucket, Key, UploadId: request.uploadId }), options);
  }
}

/** Size in bytes of an object in the private bucket, or null if it doesn't exist. */
export async function originalSize(key: string): Promise<number | null> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
    return head.ContentLength ?? 0;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}
