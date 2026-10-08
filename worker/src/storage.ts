import { createReadStream, createWriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";
import { cacheControlFor, contentTypeFor } from "./hls";

// Storage access for the worker: download originals from the private bucket, upload
// HLS output to the public bucket. Same S3 code for Garage (local) and R2 (production).
const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  // Only add checksums when S3 requires them (S3-compatible services can reject the defaults).
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

/**
 * Stream an original from the private bucket into a local file. "Stream" means the
 * bytes flow straight to disk in small chunks, so a 5 GB video never has to fit in memory.
 */
export async function downloadOriginal(key: string, destination: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  if (!res.Body) throw new Error(`Original ${key} has no content.`);
  await pipeline(res.Body as Readable, createWriteStream(destination));
}

/** All files under a folder, as paths relative to it (e.g. "720p/seg_001.ts"). */
async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(dir, prefix), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => {
      const rel = path.posix.join(prefix, e.name);
      return e.isDirectory() ? listFiles(dir, rel) : Promise.resolve([rel]);
    }),
  );
  return nested.flat();
}

async function uploadFile(localPath: string, key: string): Promise<void> {
  const { size } = await stat(localPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_PUBLIC_BUCKET,
      Key: key,
      Body: createReadStream(localPath),
      ContentLength: size,
      ContentType: contentTypeFor(localPath),
      CacheControl: cacheControlFor(localPath),
    }),
  );
}

/**
 * Upload every file in `localDir` to the public bucket under `keyPrefix`.
 * The master playlist goes LAST: until it exists nothing points at the segments, so a
 * player can never open a half-uploaded video.
 */
export async function uploadFolder(localDir: string, keyPrefix: string, lastFile = "master.m3u8"): Promise<number> {
  const files = await listFiles(localDir);
  const first = files.filter((f) => f !== lastFile);

  // Upload 4 files at a time: faster than one by one, without flooding the network.
  for (let i = 0; i < first.length; i += 4) {
    await Promise.all(first.slice(i, i + 4).map((f) => uploadFile(path.join(localDir, f), keyPrefix + f)));
  }
  if (files.includes(lastFile)) await uploadFile(path.join(localDir, lastFile), keyPrefix + lastFile);
  return files.length;
}
