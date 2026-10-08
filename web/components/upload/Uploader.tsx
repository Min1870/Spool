"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Button, Field, Input, Rule } from "@/components/ui";
import { formatBytes } from "@/lib/format";
import { DropZone } from "./DropZone";
import { MAX_UPLOAD_MB, useUploader, type UploadState } from "./useUploader";

export function Uploader() {
  const { state, start, retry, cancel, reset } = useUploader();
  const [title, setTitle] = useState("");
  const maxLabel = MAX_UPLOAD_MB >= 1024 ? `${+(MAX_UPLOAD_MB / 1024).toFixed(1)} GB` : `${MAX_UPLOAD_MB} MB`;

  return (
    <div className="flex flex-col gap-6">
      <Field label="Title" htmlFor="title" hint="Optional. If you leave it empty, the file name is used.">
        <Input
          id="title"
          size="lg"
          maxLength={200}
          value={title}
          disabled={state.phase !== "idle" && state.phase !== "error"}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My video"
        />
      </Field>

      {state.phase === "idle" ? (
        <DropZone maxSizeLabel={maxLabel} onFile={(file) => void start(file, title)} />
      ) : (
        <StatusPanel
          state={state}
          onRetry={() => void retry()}
          onCancel={() => void cancel()}
          onReset={() => {
            reset();
            setTitle("");
          }}
        />
      )}
    </div>
  );
}

/** Progress / error / done panel, styled like the Spool details screen's status column. */
function StatusPanel({
  state,
  onRetry,
  onCancel,
  onReset,
}: {
  state: Exclude<UploadState, { phase: "idle" }>;
  onRetry: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const file = state.file;
  const percent =
    state.phase === "uploading" && file
      ? Math.min(100, Math.floor((state.bytesUploaded / file.size) * 100))
      : state.phase === "finishing" || state.phase === "done"
        ? 100
        : 0;

  const heading = {
    preparing: "Preparing",
    uploading: "Uploading",
    finishing: "Finishing",
    done: "Uploaded",
    error: "Upload failed",
  }[state.phase];

  return (
    <section className="flex flex-col gap-4 border-2 border-divider bg-surface p-8" aria-live="polite">
      {file && (
        <div className="font-mono text-[13px] text-neutral-700">
          {file.name} · {formatBytes(file.size)}
        </div>
      )}

      <div className="flex items-baseline justify-between gap-4">
        <h4 className="flex items-center gap-2">
          {state.phase === "done" && (
            <span className="flex size-6 items-center justify-center bg-accent text-bg">
              <Check size={16} strokeWidth={3} strokeLinecap="square" />
            </span>
          )}
          {heading}
        </h4>
        {state.phase !== "error" && (
          <span className="text-[28px] leading-none font-extrabold tabular-nums text-accent">{percent}%</span>
        )}
      </div>

      {state.phase !== "error" && (
        <div className="h-2 bg-neutral-300" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      )}

      <p className="text-[13px] text-neutral-700">
        {state.phase === "preparing" && "Getting an upload slot…"}
        {state.phase === "uploading" && "Keep this tab open until the upload finishes. It resumes if your connection blinks."}
        {state.phase === "finishing" && "Checking the file and queueing it for processing…"}
        {state.phase === "done" && "Queued for processing. The worker is turning it into 480p and 720p HLS."}
      </p>

      {state.phase === "error" && (
        <p role="alert" className="text-[13px] font-semibold text-accent-700">
          {state.message}
        </p>
      )}

      {state.phase === "done" && (
        <div className="font-mono text-[12px] text-neutral-700">Video id: {state.videoId}</div>
      )}

      <Rule weight={1} />

      <div className="flex flex-wrap gap-3">
        {(state.phase === "preparing" || state.phase === "uploading") && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {state.phase === "error" && state.canRetry && (
          <Button variant="primary" onClick={onRetry}>
            Retry
          </Button>
        )}
        {state.phase === "error" && (
          <Button variant="secondary" onClick={state.canRetry ? onCancel : onReset}>
            {state.canRetry ? "Cancel upload" : "Choose another file"}
          </Button>
        )}
        {state.phase === "done" && (
          <>
            <Button variant="primary" onClick={onReset}>
              Upload another
            </Button>
            <Button variant="ghost" href="/videos">
              My videos →
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
