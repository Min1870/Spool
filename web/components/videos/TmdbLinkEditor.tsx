"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TmdbLink } from "@shared/video";
import { TmdbPicker, type TmdbChoice } from "./TmdbPicker";

/**
 * The watch page's "TMDB" box. Everyone sees which movie this video is; the uploader can
 * link, change or remove it (PUT /api/videos/[id]/tmdb).
 */
export function TmdbLinkEditor({ videoId, initial, canEdit }: { videoId: string; initial: TmdbLink | null; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<TmdbChoice | null>(
    initial ? { id: initial.id, title: initial.title ?? `TMDB #${initial.id}`, year: initial.year, posterUrl: initial.posterUrl } : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!canEdit && !value) return null;

  async function save(next: TmdbChoice | null) {
    const previous = value;
    setValue(next); // show the choice right away...
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/videos/${videoId}/tmdb`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: next?.id ?? null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      setSaved(true);
      router.refresh(); // re-read server data (e.g. the title shown elsewhere)
    } catch (err) {
      setValue(previous); // ...and undo it if saving failed
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 flex max-w-[640px] flex-col gap-3 border-t border-divider pt-6">
      <h6 className="text-neutral-700">TMDB</h6>
      {canEdit && (
        <p className="text-[13px] text-neutral-700">
          Link this video to its movie on TMDB. Client sites then show it with TMDB&apos;s poster and details, and play it instead
          of the trailer.
        </p>
      )}
      <TmdbPicker value={value} onChange={(m) => void save(m)} disabled={!canEdit || saving} />
      {saving && <p className="text-[13px] text-neutral-700">Saving…</p>}
      {saved && !saving && <p className="text-[13px] text-neutral-700">Saved ✓</p>}
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-accent-700">
          {error}
        </p>
      )}
    </div>
  );
}
