# Free deploy: Spool + MSW online for $0

This puts both sites on the internet at no cost, which is good for a test clip and learning.
You do the dashboard steps (accounts, keys); the code already reads everything from env vars,
so nothing in the app changes.

## The big picture

```
 You (admin)                               Viewers
     │ upload                                 │ watch
     ▼                                        ▼
 Spool on Vercel ──job──► Redis Cloud     MSW on Vercel
 (spool-xxx.vercel.app)       │          (msw-xxx.vercel.app)
     │ presigned URLs          │ picks up job    │ API: list videos
     ▼                         ▼                 ▼
 R2 spool-originals ◄──── Worker on YOUR PC ──► R2 spool-media (public r2.dev)
 (private)           download    (FFmpeg)  upload       ▲
                                                        └── viewers stream from here
 Supabase: videos table + login (used by Spool and the worker)
```

| Part | Where | Cost |
|---|---|---|
| Spool web + API | Vercel Hobby (GitHub `Min1870/Spool`) | free |
| MSW | Vercel Hobby (GitHub `Min1870/Spool-client`) | free |
| Files | Cloudflare R2 | free up to 10 GB (card required) |
| Database + login | Supabase (your existing project) | free |
| Job queue | Redis Cloud free database (30 MB) | free |
| Worker (FFmpeg) | Docker on your PC | free |

**Your PC only has to be on while a new upload is being processed.** Once a video is
`ready`, it plays from R2 even with your PC off.

New words:
- **Vercel**: a host for Next.js sites. It builds from GitHub and redeploys on every push.
- **Serverless**: Vercel doesn't run your app all the time. It starts it for each request.
  That's why the long-running worker can't live there.
- **r2.dev URL**: a free public address Cloudflare gives a bucket. It's rate-limited and
  meant for testing; a real site would use your own domain.

Do the steps in order. Keep a text editor open with `.env.production` (step 0) and paste
each value in as you get it.

---

## 0. Create your production env file

In PowerShell, in the Spool folder (`D:\Work Folder\MSW_admin`):

```powershell
Copy-Item .env.production.example .env.production
```

Open `.env.production`. Every `<...>` gets replaced in the steps below. It's gitignored.
Never commit it or paste it anywhere public.

Copy these from your local `.env` now:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `TMDB_READ_ACCESS_TOKEN`

## 1. Cloudflare R2 (storage)

1. Sign up or log in at dash.cloudflare.com, then open **R2 Object Storage** in the sidebar.
   Enabling R2 asks for a card. You pay nothing while you stay under 10 GB stored,
   1 million writes and 10 million reads a month.
2. **Create bucket** `spool-originals`, with location Automatic. Leave it private.
3. **Create bucket** `spool-media`.
4. Open `spool-media` → **Settings** → **Public access** → **Public Development URL (r2.dev)**
   → Allow. Copy the `https://pub-….r2.dev` address into `S3_PUBLIC_URL` (no trailing slash).
5. CORS rules: they tell browsers which websites may talk to the bucket.
   - `spool-media` → Settings → **CORS policy** → Edit → paste
     [`deploy/r2-cors-media.json`](../deploy/r2-cors-media.json) → Save.
     Any website may read videos, so embeds and MSW work.
   - `spool-originals` → Settings → CORS policy → paste
     [`deploy/r2-cors-originals.json`](../deploy/r2-cors-originals.json). Leave the
     `<your-spool-project>` placeholder for now; you'll fix it in step 4 once Vercel gives you
     the address. `ExposeHeaders: ETag` matters: Uppy has to read each part's ETag to finish
     the upload.
6. `spool-originals` → Settings → **Object lifecycle rules** → Add rule: "Abort incomplete
   multipart uploads" after **1 day**. Cancelled uploads then don't sit there using space.
7. Back on the R2 overview: **Manage R2 API Tokens** (or "API" → "Manage API tokens") →
   **Create API token**:
   - Permission: **Object Read & Write**
   - Specify buckets: `spool-originals` and `spool-media`
   - Create. Copy **Access Key ID** → `S3_ACCESS_KEY` and **Secret Access Key** →
     `S3_SECRET_KEY`. The secret is shown only once.
   - The page also shows the S3 endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
     Put it in `S3_ENDPOINT`.

## 2. Redis Cloud (job queue)

1. Sign up at redis.io/try-free (no card), then create a **free** database. Pick a cloud
   region close to you; any region works.
2. Open the database → **Configuration** → Edit → set **Data eviction policy** to
   **noeviction** → Save.
   Why: by default Redis may delete keys when it's full. BullMQ keeps jobs as keys, so a
   deleted key is a lost job. With `noeviction`, Redis refuses new data instead. 30 MB holds
   thousands of jobs.
3. **Connect** → copy the public endpoint (`host:port`) and the password (under **Security**,
   default user). Fill in:
   `REDIS_URL=redis://default:<password>@<host>:<port>`

> The free plan's connection is not encrypted (TLS is a paid feature). It's password
> protected, which is fine for a test project. With TLS you'd use `rediss://`, and both are accepted.

## 3. Supabase (same project as local)

1. **Clear old local test rows.** Their files exist only in Garage on your PC, so they'd show
   up as broken videos on the live site. SQL Editor → run:
   ```sql
   delete from videos;
   ```
   (Re-upload your test clip on the live site later.)
2. **Authentication → URL Configuration.** Wait for step 4's address, then:
   - Site URL: `https://<your-spool-project>.vercel.app`
   - Redirect URLs: add `https://<your-spool-project>.vercel.app/auth/callback` **and**
     `http://localhost:3000/auth/callback` (so local dev still works).
3. **Close sign-ups.** Make sure your own account already exists (you made it in phase 6),
   then go to Authentication → **Sign In / Providers** and switch **off "Allow new users to
   sign up"**. Otherwise anyone who finds your Spool site could make an account and fill your
   R2 storage (and your card). You can turn it back on any time.

## 4. Vercel: Spool (the admin site)

1. Sign in at vercel.com **with GitHub** → **Add New… → Project** → import `Min1870/Spool`.
2. **Root Directory** → Edit → choose `web`. The Next.js app lives there, and Vercel then finds
   `package.json`. Framework preset: **Next.js**; keep the build settings as they are.
3. **Environment Variables**: paste the contents of `.env.production` into the first box. Vercel
   splits it into variables. `APP_ORIGIN` still has the placeholder; that's OK for now.
4. **Deploy.** After 1–2 minutes you get an address like `https://spool-abc123.vercel.app`.
   Copy it (Project → Domains shows the main one).
5. Now put the real address in everywhere:
   - `.env.production` → `APP_ORIGIN=https://spool-abc123.vercel.app`
   - Vercel → Project → **Settings → Environment Variables** → edit `APP_ORIGIN` to the same value
   - R2 → `spool-originals` → CORS policy → replace `https://<your-spool-project>.vercel.app`
   - Supabase → URL Configuration (step 3.2)
6. Vercel → **Deployments** → ⋯ on the latest → **Redeploy**. Env var changes only apply
   to new deployments. `NEXT_PUBLIC_*` values are baked in at build time.

## 5. Vercel: MSW (the public site)

1. **Add New… → Project** → import `Min1870/Spool-client`. The root directory is the repo root.
2. Environment Variables:
   - `NEXT_PUBLIC_TMDB_API_KEY` = the value from MSW's `.env.local`
   - `NEXT_PUBLIC_SPOOL_API_URL` = `https://spool-abc123.vercel.app` (Spool's address, no slash)
3. **Deploy** → you get `https://<msw>.vercel.app`.

## 6. Worker on your PC

In PowerShell, in `D:\Work Folder\MSW_admin`, with Docker Desktop running:

```powershell
docker compose stop worker                              # the DEV worker isn't needed now (saves CPU)
docker compose -f docker-compose.prod.yml up -d --build # build + start the production worker
docker compose -f docker-compose.prod.yml logs -f worker
```

You should see `[worker] Ready. Waiting for "transcode" jobs`. Ctrl+C stops *watching* the
logs; the worker keeps running. It restarts by itself when Docker Desktop starts. Stop it with
`docker compose -f docker-compose.prod.yml down`.

If it prints `Invalid environment variables`, the message names the variable to fix in
`.env.production`.

## 7. Test it

1. Open `https://spool-abc123.vercel.app/upload`. You're sent to `/login`, so sign in.
2. Upload your test clip, choose **Link to TMDB** → Spider-Man: Brand New Day → upload.
   In R2, `spool-originals` gets `originals/<id>/…`.
3. Worker logs: `Start` → `Downloading …` → `Plan: copy …` → `Uploaded … files` → `Done ✓`. In R2, `spool-media` now has
   `hls/<id>/master.m3u8`, the segments and `thumbnail.jpg`.
4. The watch page shows **ready** and plays. DevTools → Network shows the `.m3u8` / `.ts`
   files coming from `pub-….r2.dev`.
5. Open `https://<msw>.vercel.app`. The movie shows in the hero and "Now Streaming" (it can take
   up to a minute, because of caching), and **Play** streams it.
6. Public API + CORS:
   ```powershell
   curl.exe -i https://spool-abc123.vercel.app/api/videos
   ```
   You should see `access-control-allow-origin: *` and your video in the JSON.
7. In a private window, `/upload` sends you to `/login`, and signing up is refused.

## If something goes wrong

| Symptom | Likely cause → fix |
|---|---|
| Upload fails at once; console says **CORS** | `spool-originals` CORS origin doesn't exactly match the Vercel address (https, no trailing slash). If it still fails, replace `"AllowedHeaders": ["*"]` with `["content-type", "authorization", "x-amz-date", "x-amz-content-sha256"]`. |
| Upload works, but the video stays **queued** | Worker isn't running or uses a different `REDIS_URL` than Vercel. Check `docker compose -f docker-compose.prod.yml logs worker`. |
| Worker: `Eviction policy is volatile-lru. It should be "noeviction"` | Set the eviction policy (step 2.2). The worker keeps running meanwhile. |
| Video **failed** with `AccessDenied` | The R2 token lacks access to one of the buckets → make a new token with both buckets. |
| Player error / thumbnail missing | `S3_PUBLIC_URL` is wrong, or the r2.dev URL isn't enabled → step 1.4, then redeploy Spool. |
| Login email link goes to localhost | Supabase Site URL / redirect URLs (step 3.2) or `APP_ORIGIN` on Vercel not updated → fix + redeploy. |
| Vercel build: `Invalid environment variables` | A variable is missing in Vercel. The message names it. |
| Everything was fine, then the API errors after a quiet week | Supabase free projects pause after about 7 days idle → dashboard → **Restore**. |

## Good to know

- **Local dev shares the database now.** Live videos appear in your local `/videos` list (with
  broken thumbnails, since local reads from Garage), and local uploads appear live. If that
  bothers you, delete test rows, or point your local `.env` storage block at R2 too.
- **Updating the sites**: `git push` → Vercel redeploys automatically. After worker code
  changes, run `docker compose -f docker-compose.prod.yml up -d --build`.
- **Limits**: Vercel Hobby is for non-commercial use, `r2.dev` is rate-limited, and R2's free
  tier is 10 GB. A 500 MB upload limit (`NEXT_PUBLIC_MAX_UPLOAD_MB`) keeps you well inside it.
- **Only upload content you have the rights to.** The site is public now.

## Later: moving to a paid VPS (about $24/month)

When you want the worker running without your PC (or bigger uploads), rent a VPS (e.g. a
DigitalOcean Droplet, 2 vCPU / 4 GB, Ubuntu). Install Docker, copy the repo plus
`.env.production`, and run the same `docker compose -f docker-compose.prod.yml up -d --build`.
Nothing else changes: the sites can stay on Vercel, and storage, queue and database are
already in the cloud. Turn off the worker on your PC afterwards, so only one worker takes jobs
(two would also work, since BullMQ never gives the same job to both).
