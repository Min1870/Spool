> **Note (restored copy).** This is the Spool v2 design handoff spec, restored from the
> original `design_handoff_spool_v2/README.md`. The original HTML prototype
> (`Spool v2.dc.html`) and its runtime (`support.js`) are not in this repo; add them to
> `docs/design/` if you still have the handoff download.
>
> The current app follows this **visual design** (Modernist tokens, components, layouts,
> copy). Its **behaviour and architecture** follow `CLAUDE.md` instead. In particular, the
> "Connected sites" webhooks below are not part of the current build phases.

# Handoff: Spool v2 — Video Upload + Cross-site Publishing (API)

## Overview
Spool is a video hosting site for creators who publish publicly. The prototype covers the whole flow: landing → upload (drag & drop) → details form with live upload/processing progress → published/share screen → library ("My videos") → video player page.

**New in v2:** when a video is published, Spool pushes it to the creator's other websites via an outbound API call (webhook POST). A new **Connected sites** screen manages those destinations. The details form picks which sites receive the video, and the published screen shows live delivery status per site, plus the exact request body.

## About the Design Files
The files in this bundle are **design references created in HTML**: prototypes that show the intended look and behavior. They are not production code to copy directly. Your task is to **recreate these designs in the target codebase's existing environment** (React, Vue, etc.) using its established patterns. If there's no codebase yet, choose an appropriate framework (e.g. React + Vite or Next.js) and implement them there.

`Spool v2.dc.html` is a single-file prototype. Markup sits between `<x-dc>` tags, and the logic is a class in the `<script data-dc-script>` block at the bottom. `renderVals()` holds all the derived state and handlers. `support.js` is the prototype runtime only and should not be ported.

## Fidelity
**High-fidelity.** Final colors, type, spacing and interactions. Recreate it pixel-accurately. Uploads, processing, playback and webhook deliveries are **simulated** with timers, so wire them to real APIs.

## Design System — Modernist
Flat and architectural, set entirely in Archivo. Near-mono red on an off-white ground, a visible modular grid, **zero border radius everywhere**, and strong **2px dividers** between major sections. Button labels and all copy are **flush left**, never centered. Images are black and white (`filter: grayscale(1) contrast(1.08)`). Icons are Lucide.

All tokens and component classes are in `modernist.css`. Port them as-is: tokens become CSS variables or theme values, and the classes become components.

### Tokens
- `--color-bg` #f3f2f2 · `--color-surface` #eae9e9 · `--color-text` #201e1d
- `--color-accent` #ec3013 (hover `--color-accent-600` #dd2b0f, pressed `-700` #ae1800, tint `-100` #fff2ef, text-on-tint `-800` #7c1405)
- `--color-divider` = #201e1d at 40% alpha
- Neutral ramp: 100 #f8f4f4, 200 #eae7e7, 300 #d7d3d3, 400 #bab6b6, 500 #9b9797, 600 #7d7979, 700 #605d5d, 800 #444141, 900 #2d2b2b
- Font: Archivo 400/600/800. Headings 800, letter-spacing −0.015em to −0.035em on display sizes, line-height 0.95–1.12. Body 15px / 1.55.
- Type scale: h1 42 · h2 32 · h3 25 · h4 20 · h5 16 · h6 13 (uppercase, 0.08em). Display h1s use `clamp()`, up to 96px on the landing page.
- Spacing: 4, 8, 12, 16, 24, 32px (`--space-1` … `--space-8`)
- Radius: 0 everywhere
- Shadows: sm `0 1px 2px` / md `0 3px 10px` / lg `0 12px 32px`, all #2d2b2b at 14–22% alpha (rarely used)
- Focus: `outline: 2px solid accent; offset 2px`. Disabled: opacity 0.45.
- Kicker labels: 12px, 600 weight, uppercase, 0.1em tracking, color `--color-accent-700`

### Components used
`.btn` (+ `-primary` solid red, `-secondary` divider border, `-ghost` red text), `.tag` (+ `-accent`, `-outline`, `-neutral`), `.field` > label + `.input`, `.seg` / `.seg-opt` (segmented radio, checked = red fill), `.radio` + `.dot`, `.nav` / `.nav-brand`. See `modernist.css` for exact rules. Every button in the prototype also sets `justify-content:flex-start; white-space:nowrap`.

## Layout shell
- Content column: max-width 1240px, horizontal padding `clamp(16px,4vw,40px)`
- **Nav**: brand (14px red square + "Spool", 20px/800), then "My videos", "Watch" and "Connected sites" links (14px; active/hover turn red via `aria-current="page"`), then a primary "Upload" button with a Lucide arrow-up icon. 2px bottom rule.
- **Footer**: 2px top rule, 13px neutral-700 text: "Spool — video hosting for creators" and "Help · Terms · Privacy".
- Two-column screens use `repeat(auto-fit, minmax(min(100%, 380–420px), 1fr))`, with a 2px vertical rule (`border-left`) on the right column. Columns stack on narrow widths.

## Screens

### 1. Landing
- **Hero** (2 columns, 2px bottom rule). Left column: kicker "For creators"; h1 "Upload once. Be watched everywhere." (`clamp(48px,7vw,96px)`, line-height 0.95); 18px lede "Drop in your cut, write the details while it processes, and publish to a link that plays on anything." (max-width 460px); primary button "Upload a video →" (min-width 220px, 16px padding, label left and arrow right) and secondary button "Watch an example". Right column: a black-and-white hero image (min-height 360px).
- **Steps row**: 3 cells divided by 2px vertical rules. Each has a big red number (44px/800), an h4, and 15px body text:
  - 01 "Drop your file": "MP4, MOV or WebM up to 10 GB. Uploads keep going if your connection blinks."
  - 02 "Write while it processes": "Title, tags, captions and thumbnail — fill them in while we encode in HD and 4K."
  - 03 "Publish or schedule": "Go live now or pick a time. Either way you get a clean link that plays anywhere."
- **Poster banner**: solid red field, 32px vertical margin. h2 "Your next upload is one drag away." (`clamp(36px,5vw,64px)`) in the bg color, plus a "Start uploading →" button with a bg-colored fill and ink text.

### 2. Upload
- Header: kicker "Step 1 of 2", h1 "Upload a video", 2px bottom rule.
- **Drop zone**: a `<label>` with a hidden `input[type=file][accept=video/*]`, 2px border, surface fill, min-height 360px, 2 columns.
  - Left column: 64px red square holding a white arrow-up icon; h2 "Drag a video here" (becomes "Release to upload" while dragging); and "or click anywhere here to choose a file."
  - Right column: a spec list divided by 1px rules, each row an 11px uppercase key and a 17px/600 value: Formats "MP4 · MOV · WebM", Max size "10 GB / 4 hours", Output "Up to 4K, HDR kept".
  - While dragging: border turns accent and the fill becomes accent-100.
- Below the zone: "No file handy?" and a ghost button "Try a sample video →".

### 3. Details (upload in progress)
- Header: kicker "Step 2 of 2", then the file name and size on their own line (14px neutral-700), then h1 "Details". On the right: secondary "Cancel" and a primary button reading "Publish →" (or "Schedule →" when scheduling), disabled until processing reaches 100%.
- **Left column (form)**, 24px gap between fields:
  - Title: input, 44px tall, 16px text, prefilled from the file name with dashes and underscores turned into spaces.
  - Description: textarea, 4 rows.
  - Tags: a surface box holding removable `.tag-accent` chips ("label ×") and an inline input. Enter or comma adds a tag (a leading # is stripped and duplicates are ignored). Backspace in an empty input removes the last tag.
  - Thumbnail: 3 tiles at 16:9 ("Frame 0:04", "Frame 0:31", "Upload custom"). The selected tile gets a 3px accent border.
  - A 2px rule.
  - Visibility: segmented Public / Unlisted / Private, with a 13px hint below: "Anyone can find and watch it." / "Only people with the link can watch." / "Only you can watch."
  - Captions: radios "Auto-generate (English)" (default), "Upload a .srt or .vtt file", "No captions".
  - Publishing: segmented "Publish now" / "Schedule". Schedule reveals date and time inputs in 2 columns.
  - A 2px rule.
  - **Send to connected sites (v2)**: a label row "Send to connected sites" with a "Manage sites" link (12px, accent-700) that goes to Connected sites. Below it is a list of the connected sites, separated by 1px rules. Each row is a whole-row toggle button:
    - A 20px square checkbox: checked = accent fill and border with a white Lucide check; unchecked = divider border, no fill.
    - The site name (14px/600).
    - `POST <endpoint url>` in monospace (12px, neutral-700, `ui-monospace, Menlo, monospace`).
    - The rows that start checked are the sites with "Send new uploads by default" turned on.
    - When visibility is Private, the rows are disabled (opacity 0.45).
  - A 13px hint under the list, depending on state:
    - Private: "Private videos aren't sent to other sites."
    - No sites checked: "Only on Spool — no sites selected."
    - Scheduled: "Requests go out when it goes live (<date>)."
    - Otherwise: "N sites get a POST request the moment you publish."
- **Right column (sticky, top 24px)**:
  - Preview at 16:9 on a dark field, with a label that cycles "Uploading…" → "Processing…" → "Preview ready".
  - Status h4 ("Uploading" for 0–70%, "Processing" for 70–99%, "Ready" at 100%) with a red 28px/800 tabular percentage.
  - 8px progress bar: neutral-300 track, accent fill, 0.3s width transition.
  - 13px hint: "Keep this tab open until the upload finishes." / "Generating playback formats — keep editing." / "Encoded in 1080p and 4K."
  - Summary list (2px top rule, 1px row rules): Visibility, Captions, Tags count, Goes live ("On publish" or the scheduled date/time), and Sends to ("N sites", or — when private or none are checked).

### 4. Published
- Two columns between 2px top and bottom rules.
- Left column: 48px red square with a white check icon; h1 "It's live." or "Scheduled." (`clamp(44px,6vw,80px)`); "“Title” is public. Share the link." or "“Title” goes live Oct 9, 6:00 PM. The link works from then."
- Share link: a readonly input joined to a primary "Copy link" button, which changes to "Copied ✓" after clicking.
- Actions: "View video", "Upload another", and a ghost "My videos →".
- **Right column (v2): delivery status**
  - Header: h4 "Sent to your sites", with a 13px summary on the right ("2 of 3 delivered", or "Sends when it goes live" when scheduled).
  - A 2px top rule, then one row per selected site, separated by 1px rules. Each row shows:
    - The site name (14px/600).
    - A monospace line: `POST <url>`, plus " · 312 ms" on success or " · timed out after 30 s" on failure.
    - A status tag on the right.
  - Status sequence: `Queued` (tag-neutral) → `Sending…` (tag-outline) → `✓ 201 Created` (tag-neutral) or `502 Bad Gateway` (tag-accent, with a ghost **Retry** button). Scheduled videos show `Sends Oct 9, 6:00 PM` instead.
  - Sites are sent one after another, 350ms apart (simulated: about 300ms queued, then 1.3–2s sending).
  - Empty state: "Private videos aren't sent to other sites." or "No sites were selected for this video."
  - **Request body** block: a label "Request body — video.published", then a `<pre>` with a neutral-900 background, neutral-100 text, 12px monospace, line-height 1.6 and max-height 340px with scrolling. It shows the JSON payload (see API contract below).
- Share URL format: `spool.video/v/<slug, max 28 characters>-<id>`.

### 5. My videos (library)
- Header: kicker "N videos", h1 "My videos", primary "New upload →".
- Grid: `repeat(auto-fill, minmax(260px, 1fr))` with a 24px column gap. Each item is a button with a 1px bottom rule:
  - 16:9 thumbnail with an ink duration badge in the bottom-right corner.
  - Title at 17px/800.
  - Meta row: a visibility tag (Public = `tag-accent`, Unlisted = `tag-outline`, Private = `tag-neutral`), then "views · when".
  - Hovering turns the text accent. Clicking opens the Player.
- Newly published videos are added at the top.

### 6. Connected sites (v2)
- Header (2px bottom rule):
  - Kicker "API & webhooks".
  - h1 "Connected sites".
  - 16px lede: "When you publish, Spool sends a POST request to each site you choose, so the video shows up there on its own."
  - A primary button on the right: "Add site +", which changes to "Close ×" while the form is open.
- **Left column**
  - **Add form**, shown when open: a surface box with a 2px accent top border and 24px padding.
    - h4 "Add a site".
    - Fields "Name" (placeholder "My portfolio") and "Endpoint URL — receives POST requests" (monospace, placeholder `https://yoursite.com/api/videos`). Inputs use the bg color so they stand out from the surface.
    - Validation: the URL must match `^https://[^\s/]+\.\S+`; otherwise show "Enter a full https:// endpoint URL." in 13px/600 accent-700. If the name is left empty, use the URL's host.
    - Buttons "Save site" (primary) and "Cancel" (secondary). New sites are added with "Send new uploads by default" turned on.
  - **Site list**: a 2px top rule, with rows separated by 1px rules and 16px vertical padding. Each row shows:
    - The name (17px/800).
    - `POST <url>` in monospace.
    - The last delivery in 13px neutral-700, e.g. "Last delivery: Oct 4 · 201 Created" or "No deliveries yet".
    - An optional test tag on the right: `Sending test…` (outline), then `✓ 200 OK` (neutral).
    - An actions row: a checkbox labeled "Send new uploads by default", plus ghost buttons "Send test" and "Remove" (Remove is neutral-700).
- **Right column** (2px left rule):
  - **Your API key**: a readonly monospace input joined to a secondary "Reveal"/"Hide" button. Masked: `sk_live_••••••••••••d6`. A hint below: "Every request is signed with this key in the X-Spool-Signature header."
  - **Or pull videos from our API**: a dark `<pre>` with `curl "https://api.spool.video/v1/videos?status=published" -H "Authorization: Bearer …"`.
  - **Embed the player on your site**: a dark `<pre>` with `<iframe src="https://spool.video/embed/vid_…" width="640" height="360" allowfullscreen>`.

### 7. Player
- Video area at 16:9 (max-height 72vh, dark field):
  - An 80px red play/pause square on the left (Lucide play and pause icons, 32px). Hover uses accent-600.
  - A 6px scrubber at the bottom (bg color at 30% track, accent fill) that you can click to seek.
  - Current time and duration shown under the scrubber (13px, tabular numbers).
- Below, a 2px top rule, then:
  - **Left column** (flex 2): h1 title, a visibility tag with "views · when", the description (16px, max-width 640px), tag chips, and the buttons "Copy link" (primary) and "Edit details" (secondary).
  - **Right column** (flex 1, 2px left rule): h6 "Up next", then up to 4 rows, each a 120px thumbnail with title (14px/600) and "duration · views". Clicking a row switches to that video.

## Interactions & State
State held in the prototype (`state` object):
- `screen`: landing | upload | details | done | library | player | sites
- `dests[]` (v2): {id, name, url, on (send by default), last (last delivery text), flaky (prototype-only: the first attempt fails)}
- `sendTo[]` (v2): ids of the sites chosen for the current upload, seeded from the sites with `on` when an upload starts
- `dist{}` (v2): delivery status per site: {st: queued | sending | ok | fail | scheduled, code, ms}
- `publishedAt`, `adding`, `newName`, `newUrl`, `newErr`, `tests{}`, `keyShown` (v2)
- `drag`, `file` ({name, size}), `pct` (0–100 upload/processing progress)
- Form fields: `title`, `desc`, `tags[]`, `tagDraft`, `thumb` (0–2), `vis` (public | unlisted | private), `cap` (auto | file | none), `when` (now | later), `schedDate`, `schedTime`
- `copied`, `cur` (index of the video in the player), `playing`, `playPct` (0–1)
- `videos[]`: {title, vis, when, dur, views, tags[], desc}

Behavior:
- Choosing or dropping a file starts the upload, jumps to Details, resets the form and starts the progress timer. Real implementation: a resumable/chunked upload, with progress from the upload and then the server's processing status.
- Cancel stops the upload and returns to the Upload screen.
- Publish/Schedule adds the video to the library and goes to Published.
- Leaving Details for any screen except Details stops the timer. In production, decide whether uploads should keep running in the background.
- **Publish (v2)**: if visibility is Private, nothing is sent. If scheduled, every selected site is marked `scheduled`. Otherwise each selected site gets a POST, sent in sequence. A failure shows Retry, which sends again. On success, that site's "last delivery" text is updated.
- Copy link writes `https://<shareUrl>` to the clipboard.
- Every navigation scrolls the page back to the top.

## API contract (v2) — to implement on the backend
**Outbound webhook.** For each selected site, send `POST <endpoint url>`:
- Headers: `Content-Type: application/json`, and `X-Spool-Signature: sha256=<HMAC of the raw body using the account secret>`.
- Body:
```json
{
  "event": "video.published",          // or "video.scheduled"
  "sent_at": "2026-10-06T12:00:00Z",
  "video": {
    "id": "vid_k3x9",
    "title": "harbor morning 4k",
    "description": "",
    "visibility": "public",            // public | unlisted (private is never sent)
    "tags": ["film"],
    "duration_s": 207,
    "url": "https://spool.video/v/harbor-morning-4k-k3x9",
    "embed_url": "https://spool.video/embed/vid_k3x9",
    "thumbnail_url": "https://cdn.spool.video/t/vid_k3x9.jpg",
    "captions": ["en"],
    "publish_at": null                 // ISO time when scheduled
  }
}
```
- Any 2xx response counts as delivered. Use a 30s timeout. Non-2xx responses and timeouts are marked failed and can be retried manually. Automatic retry with backoff is recommended.
- Fire the webhook only after processing finishes **and** at publish time (for scheduled videos, when `publish_at` is reached).
- Store every delivery attempt (status code, latency, timestamp) to power the status rows and the "Last delivery" text.

**Pull API** (optional alternative): `GET https://api.spool.video/v1/videos?status=published` with `Authorization: Bearer <api key>`.

**Embed**: `https://spool.video/embed/<id>`, loaded in an iframe.

**Monospace**: the design system has no mono font, so code and URLs use `ui-monospace, Menlo, monospace`.

## Assets
There are no real assets. Every image is a striped placeholder (`repeating-linear-gradient` of neutral-200/300, or neutral-800/900 for the video areas) with an uppercase 11px label. Replace them with real thumbnails and frames, always shown through the grayscale filter. Icons are Lucide (arrow-up, check, play, pause).

## Files
- `Spool v2.dc.html`: the complete prototype (all seven screens, one file)
- `modernist.css`: design tokens and component classes
- `support.js`: the prototype runtime, needed only to open the HTML locally (don't port it)
