import "server-only";
import type { TmdbMovie } from "@shared/video";
import { env } from "./env";

// A tiny TMDB (themoviedb.org) client for the admin. It runs on the SERVER, so the TMDB
// token stays secret. The browser asks our API, our API asks TMDB.
//
// We only need two things: search movies by title, and look one up by id. We also look
// it up when saving a link, so the title/year we store come from TMDB, not from whatever
// the browser sent.

const API = "https://api.themoviedb.org/3";

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const tmdbEnabled = () => Boolean(env().TMDB_READ_ACCESS_TOKEN);

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = env().TMDB_READ_ACCESS_TOKEN;
  if (!token) throw new TmdbError("TMDB isn't configured (TMDB_READ_ACCESS_TOKEN is empty).", 503);

  const url = new URL(API + path);
  for (const [k, v] of Object.entries({ language: "en-US", ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, {
    // The "API Read Access Token" goes in the Authorization header (TMDB API v3 accepts it).
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    // TMDB data barely changes; let Next cache identical requests for an hour.
    next: { revalidate: 3600 },
  });
  if (res.status === 404) throw new TmdbError("That movie doesn't exist on TMDB.", 404);
  if (!res.ok) throw new TmdbError(`TMDB request failed (${res.status}).`, 502);
  return res.json() as Promise<T>;
}

type RawMovie = { id: number; title: string; release_date?: string; poster_path: string | null; overview?: string };

function toMovie(raw: RawMovie): TmdbMovie {
  const year = raw.release_date ? Number(raw.release_date.slice(0, 4)) : NaN;
  return {
    id: raw.id,
    title: raw.title,
    year: Number.isFinite(year) ? year : null,
    posterPath: raw.poster_path,
    overview: raw.overview ?? "",
  };
}

/** Movies matching a title, best matches first (max 10). */
export async function searchMovies(query: string): Promise<TmdbMovie[]> {
  const data = await tmdb<{ results: RawMovie[] }>("/search/movie", { query, include_adult: "false" });
  return data.results.slice(0, 10).map(toMovie);
}

/** One movie by TMDB id (throws TmdbError 404 if it doesn't exist). */
export async function getMovie(id: number): Promise<TmdbMovie> {
  return toMovie(await tmdb<RawMovie>(`/movie/${id}`));
}
