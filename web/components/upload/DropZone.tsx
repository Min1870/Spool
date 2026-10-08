"use client";

import { ArrowUp } from "lucide-react";
import { useState, type DragEvent } from "react";
import { cn } from "@/lib/cn";

// The Spool drop zone (docs/design/README.md, screen 2): a big <label> around a hidden
// file input, so clicking anywhere opens the file picker, plus drag-and-drop.

type DropZoneProps = {
  maxSizeLabel: string;
  onFile: (file: File) => void;
};

export function DropZone({ maxSizeLabel, onFile }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const specs = [
    { k: "Formats", v: "MP4 · MOV · WebM" },
    { k: "Max size", v: maxSizeLabel },
    { k: "Output", v: "HLS · 480p + 720p" },
  ];

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault(); // required, or the browser opens the file instead of dropping it
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "grid min-h-[360px] cursor-pointer grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] border-2 transition-colors duration-150",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
        dragging ? "border-accent bg-accent-100" : "border-divider bg-surface",
      )}
    >
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = ""; // allow choosing the same file again later
        }}
      />
      <div className="flex flex-col justify-between gap-8 p-8">
        <div className="flex size-16 items-center justify-center bg-accent text-bg">
          <ArrowUp size={30} strokeWidth={2.5} strokeLinecap="square" />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-[clamp(28px,4vw,40px)]">{dragging ? "Release to upload" : "Drag a video here"}</h2>
          <p className="text-[16px]">or click anywhere here to choose a file.</p>
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-divider">
        {specs.map((s) => (
          <div key={s.k} className="flex flex-1 flex-col justify-center gap-0.5 border-b border-divider px-6 py-4 last:border-b-0">
            <div className="text-[11px] uppercase tracking-[0.1em] text-neutral-700">{s.k}</div>
            <div className="text-[17px] font-semibold">{s.v}</div>
          </div>
        ))}
      </div>
    </label>
  );
}
