"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { tmdbPosterUrl, type TmdbMovie } from "@shared/video";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";

/** The picked movie. posterUrl is a full image URL (search results and saved links both provide one). */
export type TmdbChoice = Pick<TmdbMovie, "id" | "title" | "year"> & { posterUrl: string | null };

/**
 * "Link to TMDB": search themoviedb.org by title and pick the movie a video IS.
 * Searches go to our own /api/tmdb/search (the TMDB key stays on the server).
 */
export function TmdbPicker({
  value,
  onChange,
  disabled,
}: {
  value: TmdbChoice | null;
  onChange: (movie: TmdbChoice | null) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmdbMovie[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Search 300ms after typing stops ("debounce"), so we don't call TMDB on every keystroke.
  const q = query.trim();
  const searching = q.length >= 2; // shorter text = no search, nothing shown

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await res.json()) as { results?: TmdbMovie[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Search failed.");
        setResults(data.results ?? []);
        setStatus("idle");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
        setStatus("error");
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center gap-4 border border-divider bg-surface p-3">
        <Poster src={value.posterUrl} className="w-12" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] uppercase tracking-[0.1em] text-neutral-700">Linked to TMDB</span>
          <span className="truncate text-[16px] font-extrabold">
            {value.title} {value.year && <span className="font-normal text-neutral-700">({value.year})</span>}
          </span>
          <a href={`https://www.themoviedb.org/movie/${value.id}`} target="_blank" rel="noopener" className="font-mono text-[12px]">
            themoviedb.org/movie/{value.id} ↗
          </a>
        </div>
        {!disabled && (
          <Button variant="ghost" onClick={() => onChange(null)} aria-label="Remove TMDB link">
            <X size={16} /> Remove
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-700" />
        <Input
          id={inputId}
          aria-label="Search TMDB movies"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a movie title, e.g. Night of the Living Dead"
          className="pl-9"
        />
      </div>
      {searching && status === "loading" && <p className="text-[13px] text-neutral-700">Searching TMDB…</p>}
      {searching && status === "error" && (
        <p role="alert" className="text-[13px] font-semibold text-accent-700">
          {error}
        </p>
      )}
      {searching && status === "idle" && results.length === 0 && (
        <p className="text-[13px] text-neutral-700">No movies found.</p>
      )}
      {searching && results.length > 0 && (
        <ul className="flex max-h-[320px] flex-col overflow-y-auto border border-divider" aria-label="TMDB results">
          {results.map((m) => (
            <li key={m.id} className="border-b border-divider last:border-b-0">
              <button
                type="button"
                onClick={() => {
                  onChange({ id: m.id, title: m.title, year: m.year, posterUrl: tmdbPosterUrl(m.posterPath, "w185") });
                  setQuery("");
                  setResults([]);
                }}
                className="flex w-full items-center gap-3 p-2 text-left hover-ink"
              >
                <Poster src={tmdbPosterUrl(m.posterPath, "w92")} className="w-9" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-semibold">
                    {m.title} {m.year && <span className="font-normal text-neutral-700">({m.year})</span>}
                  </span>
                  <span className="line-clamp-1 text-[12px] text-neutral-700">{m.overview || "No overview."}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Small TMDB poster in black and white (Spool design rule for images). */
function Poster({ src, className }: { src: string | null; className?: string }) {
  return (
    <div className={cn("aspect-[2/3] flex-none overflow-hidden bg-neutral-200", className)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="bw size-full object-cover" />
      )}
    </div>
  );
}
