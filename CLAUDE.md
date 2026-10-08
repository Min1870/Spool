# CLAUDE.md

Project guide for Claude Code. Read this before making changes.

## Project

**Spool**: a small YouTube-style video upload and streaming app. Users upload videos in the browser,
a background worker converts them to HLS (480p, 720p) with FFmpeg, and viewers watch them
with adaptive quality using hls.js. Other websites can embed videos or fetch them through
a public API.

## About me (the developer)

- Front-end developer (React, Next.js, TypeScript). New to backend, Docker and DevOps.
- I am building this to learn. Explain new backend/DevOps concepts in simple terms
  when you introduce them, and keep code readable over clever.
- I work on Windows with Docker Desktop (WSL 2). Commands must work in PowerShell/cmd,
  or say clearly when something must run inside WSL.

## Stack

| Part | Tool |
|---|---|
| Frontend + API | Next.js (App Router), TypeScript |
| Upload | Uppy + @uppy/aws-s3 (multipart, presigned URLs, direct to storage) |
| Storage | S3-compatible via @aws-sdk/client-s3. Local: Garage (`dxflrs/garage`). Production: Cloudflare R2 |
| Database + auth | Supabase (cloud) via @supabase/supabase-js |
| Queue | Redis + BullMQ |
| Worker | Node.js + TypeScript service running FFmpeg (in Docker) |
| Player | hls.js |
| Styling | Tailwind CSS with the Spool "Modernist" design system (see Design below) |

> **Why Garage, not MinIO:** MinIO removed its free Docker images (Docker Hub, Sept 2026)
> and quay.io now requires login. Garage is an open-source S3-compatible server. The app
> only speaks S3, so nothing else changes.

## Architecture and flow

1. API creates a `videos` row (status `uploading`) and returns presigned multipart URLs.
2. Browser uploads directly to the **private** bucket (`S3_BUCKET`) at `originals/{videoId}/`.
3. On completion, API sets status `queued` and adds a BullMQ job.
4. Worker downloads the original, runs FFmpeg to HLS (480p + 720p, 6-second segments,
   `master.m3u8`, `-crf 23`) and extracts a thumbnail.
5. Worker uploads results to the **public** bucket (`S3_PUBLIC_BUCKET`) at `hls/{videoId}/`,
   sets status `ready` (or `failed` with an error message).
6. Watch page plays `${S3_PUBLIC_URL}/hls/{videoId}/master.m3u8` with hls.js.

Two buckets, because Garage and R2 can only make a whole bucket public, not a folder.
Originals must stay private.

Video statuses: `uploading` -> `queued` -> `processing` -> `ready` | `failed`

Large video files must never pass through the Next.js server. The browser uploads to and
plays from storage directly; the API only handles small JSON requests.

## Folder structure (target)

```
/
├─ CLAUDE.md
├─ README.md
├─ docker-compose.yml     # Garage, Redis, worker
├─ .env.example           # every env var, with comments (copy to .env)
├─ garage/                # Garage config + one-time bucket/CORS setup script
├─ docs/design/           # Spool design spec + modernist.css (source of truth for the look)
├─ web/                   # Next.js app (pages, API routes)
│  └─ shared/             # types + constants used by web AND worker (Video, VideoStatus,
│                         #   queue name, storage keys). Worker imports ../web/shared.
├─ worker/                # BullMQ + FFmpeg service, with its own Dockerfile
└─ supabase/migrations/   # SQL migrations
```

## Commands

```
docker compose up -d          # start Garage, Redis, worker
docker compose down           # stop everything
docker compose logs -f worker # watch worker logs
cd web && npm run dev         # start Next.js on http://localhost:3000 (loads ../.env)
```

Garage has no web console. S3 API: http://localhost:3900. Public files:
http://spool-media.web.garage.localhost:3902/<key>. In PowerShell, use `curl.exe`
(plain `curl` is an alias for `Invoke-WebRequest` in Windows PowerShell).

## Rules

- **Config in env vars only.** Switching Garage -> R2 must need only `.env` changes
  (`S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
  `S3_BUCKET`, `S3_PUBLIC_BUCKET`, `S3_PUBLIC_URL`).
  Never hard-code endpoints, keys or bucket names. Keep `.env.example` up to date.
- **Never commit secrets.** `.env` stays in `.gitignore`. Never print keys in logs.
- **Keep costs at zero locally.** Do not add paid services or AWS without asking me first.
- **Errors:** handle failed uploads, FFmpeg failures and worker crashes. Jobs retry
  2 times, then the video is marked `failed` with the error saved.
- **Clean up temp files** in the worker after each job, success or failure.
- **CORS:** the bucket must allow the web app origin (and embed origins) for uploads and
  HLS playback; public API routes must send CORS headers.
- **Security:** validate file type and size before issuing upload URLs. Only logged-in
  users can upload (once auth is added). Presigned URLs should expire quickly.
- **TypeScript strict mode.** Shared types (e.g. `Video`, `VideoStatus`) live in one place.
- **Small steps.** Work in phases. After each phase, stop, explain what changed in simple
  terms, and tell me exactly how to test it before continuing.
- Comment code where the "why" is not obvious, especially Docker, FFmpeg and queue code.

## Design (Spool "Modernist")

The UI uses the Spool design system. Spec: `docs/design/README.md`; tokens and component
rules: `docs/design/modernist.css`. Follow the visual design there. Behaviour follows this file.
- Tokens become CSS variables in `web/app/globals.css` and the Tailwind `@theme` (use
  `@theme static` so every token is emitted). Never hard-code hex values elsewhere.
- **Zero radius everywhere.** 2px dividers between sections, 1px between rows.
- **Everything flush left**, including button labels. Never center hero copy.
- Accent red (#ec3013) sparingly: primary actions, kickers (accent-700 text), progress,
  selected states, the landing banner.
- Images and thumbnails are black and white: `filter: grayscale(1) contrast(1.08)`.
- Archivo 400/600/800 via `next/font/google`. Code and URLs: `ui-monospace, Menlo, monospace`.
- Reusable primitives in `web/components/ui/` (Button, Tag, Kicker, Field, Input, Seg,
  Checkbox, Rule, Skeleton...). Avoid conflicting Tailwind classes on the same element.

## Build phases

1. docker-compose with Garage (buckets + CORS setup) and Redis; `.env.example`
2. Supabase migration for the `videos` table
3. Upload page + API routes for multipart presign and completion
4. Worker: BullMQ consumer, FFmpeg transcoding, uploads, status updates, Dockerfile
5. Video list page + watch page with hls.js and status display
6. Supabase Auth: only logged-in users can upload
7. Public API (`GET /api/videos/[id]`) with CORS + `/embed/[id]` iframe page
8. Deploy notes: VPS (e.g. DigitalOcean Droplet) + Cloudflare R2

## Out of scope for now

Comments, likes, recommendations, live streaming, payments, and more than two
resolutions. Ask before adding anything not listed in the phases.
