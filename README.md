# Spool

A small YouTube-style video app: upload a video in the browser, a background worker
converts it to adaptive HLS (480p + 720p) with FFmpeg, and viewers watch it with hls.js.

> 🚧 Built in phases. **Done: phase 1 (local infrastructure), phase 2 (database),
> phase 3 (upload), phase 4 (transcoding worker), phase 5 (library + player), phase 6 (sign in),
> phase 7 (public API + embeds).** The rest of this README grows with each phase.

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

## Phase 2: database (Supabase)

Supabase gives us a hosted **Postgres** database (plus auth, used in phase 6). We store one
row per video in a `videos` table. The video files live in storage; the database only
holds small facts about them: title, status, storage keys, duration, error.

**New concepts, briefly:**
- **Migration.** A SQL file that changes the database's structure. Migrations are numbered
  (`0001_...`) and kept in git, so anyone can rebuild the same database from scratch.
- **Check constraint.** A rule inside the database, e.g. status must be one of five values.
  Even buggy code can't save a bad value.
- **Row Level Security (RLS).** Postgres rules that decide which rows each key may see.
  We turn it on with no rules yet, so the browser-safe key can't read or write anything.
  Only our server code (secret key, which bypasses RLS) touches the table.
- **Two keys.** The *publishable* key (`sb_publishable_...`) is safe in the browser and limited
  by RLS. The *secret* key (`sb_secret_...`) can do anything and must stay on the server.

### Set it up

1. Create a free project at https://supabase.com/dashboard (any name, e.g. `spool`; pick a
   region near you; save the database password somewhere safe).
2. **Run the migration:** in the dashboard open **SQL Editor** → **New query**, paste the whole
   of [supabase/migrations/0001_videos.sql](supabase/migrations/0001_videos.sql), and click **Run**.
   You should see "Success. No rows returned".
3. **Copy your keys into `.env`:**
   - `NEXT_PUBLIC_SUPABASE_URL`: the Project URL, e.g. `https://abcd1234.supabase.co`
     (the **Connect** button at the top, or **Settings → Data API**)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: **Settings → API Keys** → Publishable key
   - `SUPABASE_SECRET_KEY`: **Settings → API Keys** → Secret keys (create one if there's none)

### Test it

**1. See the table:** in the dashboard, **Table Editor** → `videos`. It's empty, with the
columns `id, user_id, title, status, original_key, hls_key, thumbnail_key, duration, error, created_at`.

**2. Try it by hand** in the SQL Editor:
```sql
insert into videos (title) values ('my first video') returning *;
-- status is 'uploading', id and created_at are filled in automatically

insert into videos (title, status) values ('bad', 'banana');
-- ERROR: violates check constraint "videos_status_check"  ← the database protects itself

delete from videos where title = 'my first video';
```

**3. Run the check script** from the repo root (PowerShell):
```powershell
node --env-file=.env scripts/check-db.mjs
```
Expected: every line starts with ✓ and it ends with `All checks passed.` It inserts, reads,
rejects a bad status and deletes a test row with the secret key, then confirms the publishable
key is blocked by RLS.

### Troubleshooting
- **`Insert failed (HTTP 404)` / relation does not exist**: the migration didn't run. Repeat step 2.
- **HTTP 401 with the secret key**: the key is wrong or has a stray space. Copy it again.
  Secret keys only work from servers and scripts, never in a browser.
- **"Fill in ... in .env first"**: you're still on the placeholder values in `.env`.

## Phase 3: upload page + upload API

The Next.js app lives in `web/`. It has the Spool landing page and an **Upload** page, plus four
small API routes. The video file goes from the browser **straight to storage**. Our server only
answers small JSON requests about it.

```
Browser                               Next.js API (web/app/api/uploads)        Garage / R2
───────                               ─────────────────────────────────        ───────────
1. "I want to upload clip.mp4"  ──▶  POST /api/uploads
                                       checks type + size, creates the
                                       videos row (status: uploading),
                                       picks key originals/{id}/clip.mp4
2. Uppy, for EVERY storage request:
   "may I start / upload part 3 /
    complete?"                  ──▶  POST /api/uploads/sign
                                       checks the rules, returns a URL
                                       signed for 15 minutes
   ...then sends it ───────────────────────────────────────────────────────▶  PUT part 3
3. "done!"                      ──▶  POST /api/uploads/complete
                                       asks storage "is it really there?",
                                       status → queued, adds BullMQ job
   (Cancel)                     ──▶  POST /api/uploads/cancel → status failed
```

**New concepts, briefly:**
- **Multipart upload.** Big files are split into parts of about 8 MB, uploaded one by one, then
  joined by storage. If the network fails, only the part in flight is lost.
- **Uppy** (`@uppy/core` + `@uppy/aws-s3`) does the splitting, the retries and the resuming.
  We use it "headless": no Uppy UI, our own Spool-styled drop zone and progress bar.
- **Signing rules** ([web/lib/server/sign-rules.ts](web/lib/server/sign-rules.ts)). Uppy talks to
  storage directly, but only with URLs we sign. We only sign multipart steps for the exact key we
  assigned to that video, and only while it's uploading. Nobody can use our API to write elsewhere.
- **Don't trust the browser.** File type and size are checked in the browser (quick feedback) *and*
  on the server (security). On "complete", the server checks storage instead of believing the client.
- **One `.env` for everything.** `npm run dev` runs [web/scripts/next-with-env.mjs](web/scripts/next-with-env.mjs),
  which loads the repo-root `.env` before starting Next.js.

### Run it

Garage and Redis must be running (`docker compose up -d` from the repo root). Then in PowerShell:

```powershell
cd web
npm install
npm run dev
```

Open http://localhost:3000. You should see the Spool landing page. Click **Upload**.

### Test it

1. **Happy path.** Drop any `.mp4`, `.mov` or `.webm` file (or click to choose one) and optionally
   type a title first. You'll see the progress bar, then **Uploaded** with a video id.
   - Supabase → Table Editor → `videos`: a new row with status **queued**, your title, and
     `original_key = originals/<id>/<file name>`.
   - Redis has the job (the worker that runs it comes in phase 4):
     ```powershell
     docker compose exec redis redis-cli LLEN bull:transcode:wait
     ```
     Prints the number of waiting jobs (1 after your first upload).
2. **Wrong file type.** Choose a `.txt` or `.jpg`. You get "Only MP4, MOV and WebM videos are supported."
   and no row is created.
3. **Connection drops.** Use a big file (a few hundred MB). In Chrome DevTools (F12) → **Network**,
   set throttling to "Slow 4G", start the upload, switch to **Offline** for a few seconds, then back.
   The upload pauses and carries on where it stopped. If it shows **Upload failed** instead, press
   **Retry**: it continues from the last finished part.
4. **Cancel.** Start a big upload (throttled as above) and press **Cancel**. The row becomes
   **failed** with "Upload cancelled.", and the parts already uploaded are deleted from storage.
5. **The API protects itself** (optional). It refuses requests that skip the rules:
   ```powershell
   curl.exe -s -H "Content-Type: application/json" -d '{\"title\":\"x\",\"filename\":\"a.exe\",\"size\":10,\"contentType\":\"application/x-msdownload\"}' http://localhost:3000/api/uploads
   ```
   Expected: `{"error":"Only MP4, MOV and WebM videos are supported."}`
   (That quoting is for Windows PowerShell 5.1. In PowerShell 7, remove the backslashes.)

**Checks for code changes** (from `web/`): `npm run typecheck`, `npm run lint`, `npm test`.

### Troubleshooting
- **"Invalid environment variables" in the terminal**: a value in the repo-root `.env` is missing or
  wrong. The message names it. Start the app with `npm run dev` (not `npx next dev`), which loads `../.env`.
- **Upload fails immediately with a CORS error in the browser console**: open the app at exactly
  `APP_ORIGIN` (`http://localhost:3000`), then re-run `docker compose run --rm storage-init`.
- **"Couldn't queue the video for processing"**: Redis isn't running (`docker compose up -d`).

## Phase 4: the transcoding worker

`worker/` is a separate Node.js + TypeScript program that runs in Docker next to Garage and
Redis. It takes jobs from the queue and turns each original into adaptive HLS.

```
Redis queue ──job { videoId }──▶ worker
                                   1. status → processing
                                   2. download originals/{id}/... from spool-originals (to /tmp)
                                   3. ffprobe: duration, audio track?
                                   4. ffmpeg: one pass → 480p + 720p, 6-second segments, master.m3u8
                                   5. ffmpeg: thumbnail.jpg (10% in, max 10s)
                                   6. upload to spool-media at hls/{id}/ (master.m3u8 last)
                                   7. status → ready (hls_key, thumbnail_key, duration)
                                   8. delete the /tmp folder (always, even on failure)
```

Output for one video (public, e.g. `http://spool-media.web.garage.localhost:3902/hls/<id>/master.m3u8`):
```
hls/<id>/master.m3u8        lists both qualities with their bandwidth + resolution
hls/<id>/480p/index.m3u8    list of 480p segments
hls/<id>/480p/seg_000.ts …  6-second chunks
hls/<id>/720p/…             same for 720p
hls/<id>/thumbnail.jpg
```

**New concepts, briefly:**
- **HLS (HTTP Live Streaming).** The video is cut into short `.ts` files plus text playlists
  (`.m3u8`). A player downloads the master playlist, picks a quality that fits the connection, and
  fetches segments one by one. It can switch quality between segments.
- **FFmpeg / ffprobe.** The standard command-line tools for video. ffprobe *reads* a file (length,
  tracks); ffmpeg *converts* it. Node just starts them as child processes and waits.
- **CRF 23 + bitrate cap.** CRF means "constant quality": simple scenes use few bits, busy scenes more.
  The cap (1.4 Mbps at 480p, 2.8 Mbps at 720p) stops spikes and gives the player real numbers to
  choose a quality with.
- **Keyframes every 6 s** (`-force_key_frames`). Every segment starts with a full picture, aligned in
  both qualities, so the player can switch quality at any segment.
- **Retries.** If a job throws (bad file, storage hiccup), BullMQ tries again after 15s, then 30s.
  After the 3rd failure the video is marked `failed` with FFmpeg's error message.
- **Stalled jobs.** While working, the worker keeps renewing a "lock" on the job in Redis. If the
  worker crashes, the lock expires, BullMQ notices the job "stalled" and puts it back in the queue.
  A restarted worker picks it up (up to 2 times).
- **Docker image** ([worker/Dockerfile](worker/Dockerfile)). A recipe: start from Node 22 on Debian,
  install FFmpeg, copy the code, run it as a non-root user. `docker compose` builds and runs it.

### Run it

```powershell
docker compose up -d --build
docker compose logs -f worker
```
The first build takes a couple of minutes (it downloads FFmpeg). You should see
`[worker] Ready. Waiting for "transcode" jobs`. Any upload that was waiting in the queue is processed right away.
Press Ctrl+C to stop following the logs (the worker keeps running).

After changing code in `worker/`, rebuild with `docker compose up -d --build worker`.

### Test it

1. **Happy path.** Keep `docker compose logs -f worker` open, and upload a short video at
   http://localhost:3000/upload (with `cd web` + `npm run dev` running). The log shows
   `Downloading` → `Duration …` → `Transcoding…` → `Uploaded N files` → `Done ✓`.
   In Supabase the row goes `queued` → `processing` → `ready`, with `hls_key`, `thumbnail_key` and `duration` filled in.
2. **Look at the result.** Open these in your browser (replace `<id>` with the video's id):
   - `http://spool-media.web.garage.localhost:3902/hls/<id>/thumbnail.jpg` shows the thumbnail
   - `http://spool-media.web.garage.localhost:3902/hls/<id>/master.m3u8` downloads the playlist.
     Open it in a text editor: two `#EXT-X-STREAM-INF` lines, 480p and 720p.
   - Most browsers can't play `.m3u8` directly (Safari can). The player comes in phase 5.
3. **A broken file.** Rename any non-video file (e.g. a `.txt` with some text) to `broken.mp4` and
   upload it. The worker log shows attempts 1, 2, 3 (15s and 30s apart), then `FAILED for good`.
   The row becomes `failed`, with "This file couldn't be read as a video…" in `error`.
4. **A crash.** Upload a long video (a few minutes). While the log says `Transcoding…`, kill the worker:
   ```powershell
   docker compose kill worker
   docker compose up -d worker
   ```
   Within about 30 seconds the log shows `stalled (worker crashed?), back in the queue`, then the job
   starts over and finishes with `Done ✓`. The row ends up `ready`.
5. **Unit tests** for the FFmpeg arguments: `cd worker`, `npm install`, `npm test`.

### Troubleshooting
- **`Invalid environment variables` in the worker log**: fix the repo-root `.env`, then
  `docker compose up -d worker`.
- **Build fails with "Read-only file system" or "no space left"**: the disk Docker Desktop uses is
  full. Free space, or move Docker's disk (Docker Desktop → Settings → Resources → Advanced →
  Disk image location) to a bigger drive.
- **Video stuck on `queued`**: is the worker running? `docker compose ps`, then `docker compose logs worker`.

## Phase 5: video list + watch page

Two new pages and one API route in `web/`:

| URL | What it does |
|---|---|
| `/videos` | **My videos**: every video, newest first, with B/W thumbnail, duration and status. While any video is still processing, the page refreshes its data every 4 s, so cards turn ready by themselves. |
| `/watch/<id>` | **Watch page**: the player once the video is ready; before that, a status screen (Queued / Processing / failed with the reason) that checks `GET /api/videos/<id>` every 3 s. Plus title, "Copy link" and **Up next**. |
| `GET /api/videos/<id>` | JSON: status, error, duration and, once ready, the `hlsUrl` and `thumbnailUrl`. |

**New concepts, briefly:**
- **Server Components.** `/videos` and `/watch/<id>` read the database on the server and send ready-made
  HTML, so there's no loading spinner on first view. Only the interactive parts (player, polling) run in the browser.
- **Polling.** The browser asks "is it ready yet?" every few seconds and stops once the answer is final
  (ready or failed). Simple and reliable for a few users.
- **hls.js + Media Source Extensions.** Chrome, Edge and Firefox can't play `.m3u8` on their own. hls.js
  downloads the playlist and segments itself and feeds them to the `<video>` element. Safari plays HLS
  natively, so there the player just sets the video's `src`.
- **Adaptive bitrate (ABR).** "Auto" lets hls.js pick 480p or 720p from the measured download speed; the
  label shows the current choice (e.g. `Auto · 720p`). Picking 480p or 720p locks it.
- **Keys → URLs.** The database stores storage keys; the server turns them into URLs with `S3_PUBLIC_URL`.
  Moving to R2 only changes that variable, never the data.

### Test it

With Docker (`docker compose up -d`) and the web app (`cd web`, `npm run dev`) running:

1. **Library.** Open http://localhost:3000/videos (or click **My videos**). You see your videos as cards with
   black-and-white thumbnails and durations.
2. **Watch.** Click a card. Press the red ▶ square. The video plays; the time counts up; clicking the thin
   red bar at the bottom jumps to that point.
3. **Quality.** Below the video, **Auto · 720p** (or 480p) shows what hls.js picked. Click **480p** and the
   picture switches within a few seconds. In DevTools (F12) → **Network**, filter by `.ts`: segments now come
   from `480p/`. Set throttling to "Slow 4G" with **Auto** selected and watch it drop to 480p.
4. **Processing screen.** Upload a new video, then click **My videos → your new card** right away. You see
   **Queued** / **Processing** with a pulsing bar. Don't reload: the player appears by itself when it's ready.
   The library card also turns ready by itself.
5. **Failed screen.** Upload a renamed non-video file (`broken.mp4`) and open its card: after the retries
   (about 45 s) it shows "This video couldn't be processed." with the reason.
6. **API.** Open `http://localhost:3000/api/videos/<id>` in the browser to see the JSON the watch page polls.

## Phase 6: sign in (Supabase Auth)

Anyone can still **watch** (`/watch/<id>` is public). To **upload** or see **My videos** you need an
account. Each video now belongs to the user who uploaded it.

| What | Where |
|---|---|
| Sign in / create account page | `/login` ([web/app/login](web/app/login)) |
| Sign in, sign up, sign out (Server Actions) | [web/app/login/actions.ts](web/app/login/actions.ts) |
| "Confirm your email" link lands here | `/auth/callback` |
| Session refresh + redirect to `/login` for `/upload` and `/videos` | [web/proxy.ts](web/proxy.ts) |
| Every upload API route checks the user and that the video is theirs | [web/app/api/uploads](web/app/api/uploads) |
| Database rules for the browser key | [supabase/migrations/0002_auth_policies.sql](supabase/migrations/0002_auth_policies.sql) |

**New concepts, briefly:**
- **Session cookies.** On sign-in Supabase issues an *access token* (proves who you are, expires after
  about an hour) and a *refresh token* (gets a new access token). They're stored in cookies, so every
  request to our server carries them. [web/proxy.ts](web/proxy.ts) refreshes them before they expire.
- **Verify, don't trust.** The server reads the user with `getClaims()`, which checks the token's
  signature. Editing a cookie by hand gets you rejected, not logged in as someone else.
- **Authentication vs authorization.** *Who are you?* (signed in, or 401) vs *are you allowed?*
  (your own video, or 403). Each upload route checks both.
- **Server Actions.** Functions marked `"use server"` that a `<form>` can call directly. The password goes
  from the form to our server to Supabase; it's never stored by us.
- **Row Level Security policies.** Rules inside Postgres for the browser-safe key: anyone can read
  *ready* videos, signed-in users can read their *own*, nobody can write. Our server uses the secret key,
  which bypasses them, so these are a second lock rather than the first.

### Set it up (Supabase dashboard, one time)

1. **Run the new migration.** SQL Editor → New query → paste
   [supabase/migrations/0002_auth_policies.sql](supabase/migrations/0002_auth_policies.sql) → **Run**.
2. **Tell Supabase where the app lives.** Authentication → **URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/auth/callback`
3. **Email confirmation (choose one):**
   - *Easiest for local development:* Authentication → **Sign In / Providers** → **Email** → turn off
     **Confirm email** → Save. New accounts are signed in right away.
   - *Or keep it on:* after "Create account" you get an email; click its link. (Supabase's built-in
     email service only sends a few emails per hour. Fine for testing, not for production.)

### Test it

With Docker and `npm run dev` (in `web`) running:

1. **Signed out.** Open http://localhost:3000/upload. You're sent to **Sign in to upload**. The nav shows
   **Sign in**. A watch page (e.g. from an old link) still plays without signing in.
2. **Create an account.** On `/login`, choose **Create account**, enter an email and a password (8+
   characters). You land on the upload page, and the nav shows your email, **My videos** and **Sign out**.
3. **Upload.** Upload a video. In Supabase → Table Editor → `videos`, its `user_id` is now filled in. Compare
   it with Authentication → Users: it's your user's id.
4. **My videos** shows only your videos. Videos uploaded *before* this phase have no owner (`user_id` is
   empty), so they don't appear. To make them yours, run this in the SQL Editor with your email:
   ```sql
   update videos
   set user_id = (select id from auth.users where email = 'you@example.com')
   where user_id is null;
   ```
5. **Wrong password.** Sign out, then sign in with a wrong password: "Wrong email or password.", and the
   email stays filled in.
6. **Someone else's upload** (optional). Create a second account in a private/incognito window. Its
   **My videos** is empty, and the API refuses to sign, complete or cancel uploads that aren't yours (403/404).
7. **Database check.** `node --env-file=.env scripts/check-db.mjs` (from the repo root) still passes, and now
   reports how many *ready* videos the browser key can see.

### Troubleshooting
- **"Confirm your email first"**: click the link in the email, or turn off **Confirm email** (step 3 above).
- **The email link opens "That link didn't work"**: the link expired or was opened in a different browser.
  Sign in normally, or sign up again.
- **"Invalid environment variables … NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"**: copy the publishable key
  (`sb_publishable_…`) into `.env`.

## Phase 7: public API + embeddable player

Other websites can now **embed** Spool videos and **read** video data from JavaScript.

| What | URL |
|---|---|
| Public JSON API (with CORS) | `GET /api/videos/<id>` |
| Player-only page for `<iframe>` | `/embed/<id>` |
| Copyable embed code | on every watch page, under **Embed on your site** |

`GET /api/videos/<id>` returns:
```json
{
  "id": "8f794c8a-…", "title": "Test Title", "status": "ready", "error": null,
  "duration": 17.88, "createdAt": "2026-10-08T06:02:05Z",
  "hlsUrl": "http://spool-media.web.garage.localhost:3902/hls/8f794c8a-…/master.m3u8",
  "thumbnailUrl": "…/thumbnail.jpg",
  "watchUrl": "http://localhost:3000/watch/8f794c8a-…",
  "embedUrl": "http://localhost:3000/embed/8f794c8a-…"
}
```
While a video is processing, `status` is `queued`/`processing` and the URLs to media are `null`, so a
site can poll until it's `ready`. Unknown ids get `404 {"error":"Video not found."}`.

Embed code (the watch page fills in the right URL and title):
```html
<iframe src="http://localhost:3000/embed/<id>" title="…" width="640" height="360"
        style="border:0" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>
```

**New concepts, briefly:**
- **Origin.** Scheme + host + port, e.g. `http://localhost:3000`. `http://localhost:5500` is a *different*
  origin, as is any other website.
- **CORS.** By default a page may only *read* responses from its own origin. Our public API sends
  `Access-Control-Allow-Origin: *` ("anyone may read this"). That's safe because the data is public and the API
  never uses cookies or changes anything. The upload API deliberately sends **no** CORS headers.
- **Preflight.** For some requests the browser first asks with `OPTIONS` ("may I?"). The API answers that too.
- **iframe + `frame-ancestors`.** An iframe shows one page inside another. The `Content-Security-Policy:
  frame-ancestors` header decides who may do that. `/embed/*` allows everyone; every other page allows only
  Spool itself, which blocks **clickjacking** (a hostile site hiding our login or upload page in an invisible frame).
- **Route groups.** Normal pages moved to `web/app/(site)/` so they share the nav + footer. The `(site)` folder
  doesn't appear in URLs. `/embed` lives outside it, so embeds show only the player.
- **Why the video still plays inside someone else's site:** the iframe page is on Spool's origin, and the
  public bucket's CORS rule (from phase 1) allows any origin to `GET` segments.

### Test it

With Docker and `npm run dev` (in `web`) running:

1. **API in the browser.** Open a watch page, scroll to **Embed on your site**, click the
   `GET /api/videos/…` link. You see the JSON above.
2. **API from the command line, as another website:**
   ```powershell
   curl.exe -i http://localhost:3000/api/videos/<id> -H "Origin: https://example.com"
   ```
   Look for `access-control-allow-origin: *` in the headers.
3. **A pretend other website.** In a second terminal, from the repo root:
   ```powershell
   node --env-file=.env scripts/embed-test.mjs
   ```
   Open `http://localhost:5500/?id=<id>` (use an id from a watch page URL). This "travel blog" runs on a different
   origin and shows:
   - the **embedded player**: press ▶, switch quality, go full screen; **Spool ↗** opens the watch page in a new tab
   - **✓ CORS works** with the API's JSON, fetched by that page's own JavaScript

   Stop it with Ctrl+C.
4. **Copy the embed code** on a watch page and paste it into any HTML file or online HTML playground. Same player.
5. **Framing protection** (optional). In DevTools on the pretend blog, run
   `document.body.innerHTML += '<iframe src="http://localhost:3000/login" width=600 height=300></iframe>'`.
   The frame stays empty and the console says it refused because of `frame-ancestors`. Only `/embed` can be framed.

## Environment variables

Every variable is documented in [.env.example](.env.example). Switching from Garage to
Cloudflare R2 only means changing the **Storage** block (covered in the deploy phase).
