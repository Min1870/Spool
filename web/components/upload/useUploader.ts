"use client";

import AwsS3, { type AwsBody } from "@uppy/aws-s3";
import Uppy from "@uppy/core";
import { useEffect, useRef, useState } from "react";
import { ALLOWED_VIDEO_TYPES } from "@shared/video";
import { titleFromFilename } from "@/lib/format";

// The upload flow, as a React hook. Uppy runs "headless" (no Uppy UI): it does the
// hard parts, and our own Spool-styled components show the state.
//
//   1. POST /api/uploads            → our server creates the video row and picks the storage key
//   2. Uppy uploads the file to storage in chunks (a "multipart upload"). Before EVERY
//      request to storage it asks POST /api/uploads/sign for a presigned URL.
//      Uppy retries failed chunks by itself, and resumes after the network drops.
//   3. POST /api/uploads/complete   → server checks the file is really there, then queues it
//
// Cancel: Uppy sends a signed "abort" to storage (deletes the parts), then we tell the server.

export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10240);

type FileMeta = { videoId: string; key: string };

export type UploadState =
  | { phase: "idle" }
  | { phase: "preparing" | "finishing"; file: File }
  | { phase: "uploading"; file: File; bytesUploaded: number }
  | { phase: "done"; file: File; videoId: string }
  | { phase: "error"; file: File | null; message: string; canRetry: boolean };

/** POST JSON to one of our API routes; throws with the server's error message. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function useUploader() {
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  // The upload in progress. Refs (not state) because Uppy's callbacks need the
  // current value immediately, without waiting for a re-render.
  const videoIdRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);

  // One Uppy instance for the lifetime of the page.
  const [uppy] = useState(() =>
    new Uppy<FileMeta, AwsBody>({
      autoProceed: false,
      restrictions: {
        maxNumberOfFiles: 1,
        maxFileSize: MAX_UPLOAD_MB * 1024 * 1024,
        allowedFileTypes: [...ALLOWED_VIDEO_TYPES],
      },
    }).use(AwsS3<FileMeta, AwsBody>, {
      // Always multipart: parts are uploaded (and retried) independently, so a dropped
      // connection only costs the part in flight, not the whole file.
      shouldUseMultipart: true,
      // Upload to the exact key our server assigned in step 1.
      generateObjectKey: (file) => file.meta.key,
      // Don't send Uppy's file metadata as S3 headers: they wouldn't be covered by our signature.
      allowedMetaFields: false,
      // Ask our server to sign each storage request (it checks the rules first).
      // The video id is read from the key (originals/{videoId}/...), not from state, so a
      // late "abort" after Cancel still knows which upload it belongs to.
      signRequest: async (request) => {
        const videoId = request.key.split("/")[1];
        if (!videoId) throw new Error("Unexpected storage key.");
        return postJson<{ url: string }>("/api/uploads/sign", { videoId, request });
      },
    }),
  );

  useEffect(() => {
    const onProgress = (_file: unknown, progress: { bytesUploaded: number }) => {
      const file = fileRef.current;
      if (file) setState({ phase: "uploading", file, bytesUploaded: progress.bytesUploaded });
    };

    const onSuccess = () => {
      void finish();
    };

    const onError = (_file: unknown, error: { message: string }) => {
      setState({
        phase: "error",
        file: fileRef.current,
        message: `${error.message}. Check your connection, then press Retry to continue where it stopped.`,
        canRetry: true,
      });
    };

    uppy.on("upload-progress", onProgress);
    uppy.on("upload-success", onSuccess);
    uppy.on("upload-error", onError);
    return () => {
      uppy.off("upload-progress", onProgress);
      uppy.off("upload-success", onSuccess);
      uppy.off("upload-error", onError);
    };
  }, [uppy]);

  // Leaving the page stops any upload (Uppy aborts it in storage). Not uppy.destroy():
  // in development React runs effects twice, and a destroyed instance can't be reused.
  useEffect(() => () => uppy.cancelAll(), [uppy]);

  /** Step 3: tell the server the upload finished. */
  async function finish() {
    const file = fileRef.current;
    const videoId = videoIdRef.current;
    if (!file || !videoId) return;
    setState({ phase: "finishing", file });
    try {
      await postJson("/api/uploads/complete", { videoId });
      setState({ phase: "done", file, videoId });
    } catch (err) {
      setState({ phase: "error", file, message: (err as Error).message, canRetry: true });
    }
  }

  /** Steps 1 + 2: start uploading a file. */
  async function start(file: File, title: string) {
    fileRef.current = file;
    videoIdRef.current = null;

    // Quick checks here for a friendly message; the server checks again.
    if (!(ALLOWED_VIDEO_TYPES as readonly string[]).includes(file.type)) {
      setState({ phase: "error", file, message: "Only MP4, MOV and WebM videos are supported.", canRetry: false });
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setState({ phase: "error", file, message: `That file is too big. The limit is ${MAX_UPLOAD_MB} MB.`, canRetry: false });
      return;
    }

    setState({ phase: "preparing", file });
    try {
      const { videoId, key } = await postJson<{ videoId: string; key: string }>("/api/uploads", {
        title: title.trim() || titleFromFilename(file.name) || "Untitled",
        filename: file.name,
        size: file.size,
        contentType: file.type,
      });
      videoIdRef.current = videoId;

      uppy.clear();
      uppy.addFile({ name: file.name, type: file.type, data: file, meta: { videoId, key } });
      setState({ phase: "uploading", file, bytesUploaded: 0 });
      await uppy.upload();
    } catch (err) {
      setState({ phase: "error", file, message: (err as Error).message, canRetry: false });
    }
  }

  /** Retry after an error: re-send failed parts, or re-try the final "complete" call. */
  async function retry() {
    const file = fileRef.current;
    if (!file || !videoIdRef.current) return;
    if (uppy.getFiles().some((f) => f.progress.uploadComplete)) {
      await finish();
    } else {
      setState({ phase: "uploading", file, bytesUploaded: 0 });
      await uppy.retryAll();
    }
  }

  /** Cancel: abort in storage, record it on the server, and go back to the drop zone. */
  async function cancel() {
    const videoId = videoIdRef.current;
    uppy.cancelAll();
    reset();
    if (videoId) await postJson("/api/uploads/cancel", { videoId }).catch(() => undefined);
  }

  /** Back to the empty drop zone (after done, error or cancel). */
  function reset() {
    fileRef.current = null;
    videoIdRef.current = null;
    if (!uppy.getFiles().some((f) => f.progress.uploadStarted && !f.progress.uploadComplete)) uppy.clear();
    setState({ phase: "idle" });
  }

  return { state, start, retry, cancel, reset };
}
