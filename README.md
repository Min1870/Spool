# Spool

A small YouTube-style video app: upload a video in the browser, a background worker
converts it to adaptive HLS (480p + 720p) with FFmpeg, and viewers watch it with hls.js.

> 🚧 Built in phases. **Done: phase 1 (local infrastructure).** The rest of this README
> grows with each phase.

## How it fits together

```
 Browser ──(1) "I want to upload" ─────────────▶ Next.js API ──▶ Supabase (videos table)
    │      ◀── presigned upload URLs ───────────┘    │
    │                                                │ (3) upload done → add job
    │(2) upload parts directly ──▶ Garage/R2          ▼
    │                          spool-originals     Redis (BullMQ queue)
    │                                 │               │
    │                                 ▼               ▼
    │                        Worker (FFmpeg) ◀── (4) picks up job
    │                                 │
    │                                 ▼ (5) HLS + thumbnail
    └──(6) play with hls.js ◀── spool-media (public)
```

Video bytes **never** pass through the Next.js server. The browser uploads straight to
storage and plays straight from storage. The API only handles small JSON requests.

## Prerequisites (Windows)

1. **Docker Desktop** with the WSL 2 backend: https://www.docker.com/products/docker-desktop/
   Start it once and wait until it says "Engine running". Check in PowerShell:
   ```powershell
   docker --version
   docker compose version
   ```
2. **Node.js 22+** (needed from phase 3): https://nodejs.org
3. A free **Supabase** account (needed from phase 2): https://supabase.com

## Phase 1: local infrastructure

### What runs in Docker

| Service | What it is | Port(s) on your machine |
|---|---|---|
| `garage` | S3-compatible storage (stands in for Cloudflare R2) | 3900 S3 API, 3902 public files |
| `storage-init` | One-time setup: creates buckets, access, CORS, then exits | — |
| `redis` | In-memory store that holds the job queue (BullMQ) | 6379 |

**New concepts, briefly:**
- **S3 API / object storage.** Instead of folders on a disk, you store "objects" (files)
  under "keys" (paths like `originals/abc/video.mp4`) inside "buckets". AWS S3,
  Cloudflare R2 and Garage all speak the same S3 API, so the same code works with any of them.
- **Presigned URL.** A temporary link, signed with our secret key, that lets the browser
  upload one specific file directly to storage without ever seeing the key.
- **CORS.** Browsers block a page on `localhost:3000` from calling `localhost:3900`
  unless the storage server says "this origin is allowed". `storage-init` sets that up.
- **Two buckets.** `spool-originals` is private (raw uploads). `spool-media` is public
  (HLS + thumbnails), so hls.js can fetch segments without signed URLs. Storage can only make
  a whole bucket public, so originals live in a separate one.
- **Redis + BullMQ.** A queue: the web app drops a "transcode video X" job in, and the
  worker takes jobs out one at a time. If the worker is busy or restarting, jobs wait.

### Start it

From the repo root in PowerShell:

```powershell
copy .env.example .env
docker compose up -d
```

The first run downloads the images (a minute or two). The `.env.example` values work as-is
for local development.

### Test it

**1. Everything is up**

```powershell
docker compose ps -a
```
Expected: `garage` and `redis` are `running (healthy)`, and `storage-init` is `exited (0)`.
`exited (0)` is correct: it's a one-off setup job. See what it did:

```powershell
docker compose logs storage-init
```
It should end with `[storage-init] Done.` and mention both buckets.

**2. Redis answers**

```powershell
docker compose exec redis redis-cli ping
```
Expected: `PONG`

**3. The browser will be allowed to upload (CORS preflight)**

> In PowerShell, always type `curl.exe`. Plain `curl` is a different PowerShell command.

```powershell
curl.exe -i -X OPTIONS http://localhost:3900/spool-originals/test.mp4 -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: PUT"
```
Expected: `HTTP/1.1 200 OK` with `access-control-allow-origin: http://localhost:3000` and
`access-control-expose-headers: ETag` (the upload needs to read each part's ETag).
Try `-H "Origin: http://evil.example"` instead: you should get `HTTP/1.1 403 Forbidden`,
which means the browser will refuse the upload from that site.

**4. Write a file with the app's key, then read it publicly**

This uses your keys from `.env` (local dev values):

```powershell
"hello from spool" | Out-File -Encoding ascii hello.txt
curl.exe --aws-sigv4 "aws:amz:garage:s3" --user "GK31c2f218a2e44f485b94239e:b892c0665f0ada8a4755dae98baa3b133590e11dae3bcc1f9d8b0abd1c4e1fc5" -T hello.txt http://localhost:3900/spool-media/hls/test/hello.txt
curl.exe http://spool-media.web.garage.localhost:3902/hls/test/hello.txt
```
Expected: the last command prints `hello from spool`. That proves the key can write, the
public bucket is readable without a signature, and `*.localhost` resolves on your machine.

Optional: open http://spool-media.web.garage.localhost:3902/hls/test/hello.txt in your
browser. Then clean up with `del hello.txt`.

**5. Originals are NOT public**

```powershell
curl.exe -i http://spool-originals.web.garage.localhost:3902/anything
```
Expected: an error status (not 200). Website access is off for the private bucket.

### Useful commands

```powershell
docker compose logs -f garage        # follow Garage's logs
docker compose run --rm storage-init # re-run bucket/CORS setup (safe to repeat)
docker compose down                  # stop (keeps data)
docker compose down -v               # stop and DELETE all stored files + queue data
```

### Troubleshooting

- **`storage-init` exited with 1**: run `docker compose logs storage-init`. A message about a
  missing env var means your `.env` is missing or incomplete (re-copy `.env.example`).
- **Port already in use**: something else is using 3900/3902/6379. Stop it, or change the
  left-hand port in `docker-compose.yml` (and the matching URL in `.env`).
- **`Missing X-Amz-Content-Sha256 field` (400) in test 4**: your curl is too old to sign
  for Garage. Git Bash ships curl 7.85; use Windows' built-in `curl.exe` (8.x) from PowerShell.
- **`*.localhost` doesn't resolve** (very old curl/browser): use Chrome/Edge/Firefox, or add
  `127.0.0.1 spool-media.web.garage.localhost` to `C:\Windows\System32\drivers\etc\hosts`.

## Environment variables

Every variable is documented in [.env.example](.env.example). Switching from Garage to
Cloudflare R2 only means changing the **Storage** block (covered in the deploy phase).
