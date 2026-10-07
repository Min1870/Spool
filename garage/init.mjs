// One-time storage setup, run by the `storage-init` service in docker-compose.
// It talks to Garage's admin HTTP API (port 3903, inside the Docker network only)
// and is safe to run again: everything it does is "create if missing / set to X".
//
// What it sets up:
//   1. The app's access key (S3_ACCESS_KEY / S3_SECRET_KEY from .env).
//   2. S3_BUCKET (private): browsers upload originals here with presigned URLs.
//   3. S3_PUBLIC_BUCKET (public): the worker writes HLS + thumbnails here, and
//      browsers read them through Garage's website endpoint (S3_PUBLIC_URL).
//   4. CORS rules on both buckets, so the browser is allowed to talk to them.
//
// Why two buckets? Garage (and Cloudflare R2) can only make a WHOLE bucket public,
// not a folder. Keeping originals in a separate private bucket means nobody can
// download someone's raw upload just by guessing its URL.

const ADMIN_URL = need("GARAGE_ADMIN_URL");
const ADMIN_TOKEN = need("GARAGE_ADMIN_TOKEN");
const ACCESS_KEY = need("S3_ACCESS_KEY");
const SECRET_KEY = need("S3_SECRET_KEY");
const PRIVATE_BUCKET = need("S3_BUCKET");
const PUBLIC_BUCKET = need("S3_PUBLIC_BUCKET");
const APP_ORIGIN = need("APP_ORIGIN");

function need(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[storage-init] Missing env var ${name}. Check your .env file.`);
    process.exit(1);
  }
  return value;
}

/** Call a Garage admin API endpoint, e.g. api("GET", "GetClusterHealth"). */
async function api(method, endpoint, { query, body } = {}) {
  const url = new URL(`/v2/${endpoint}`, ADMIN_URL);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? safeJson(text) : null };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Garage needs a few seconds after starting to configure its single-node layout. */
async function waitForHealthy() {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const res = await api("GET", "GetClusterHealth");
      if (res.ok && res.data?.status === "healthy") return;
      console.log(`[storage-init] Garage not ready yet (${res.data?.status ?? res.status}), retrying...`);
    } catch {
      console.log("[storage-init] Garage not reachable yet, retrying...");
    }
    await sleep(2000);
  }
  throw new Error("Garage did not become healthy within 60 seconds.");
}

/** Make sure the app's access key exists (Garage's --default-access-key usually creates it). */
async function ensureKey() {
  const existing = await api("GET", "GetKeyInfo", { query: { id: ACCESS_KEY } });
  if (existing.ok) return;
  const res = await api("POST", "ImportKey", {
    body: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY, name: "spool-app" },
  });
  if (!res.ok) throw new Error(`Couldn't create access key: ${JSON.stringify(res.data)}`);
  console.log("[storage-init] Created access key");
}

/** Find a bucket by name, creating it if needed. Returns Garage's internal bucket id. */
async function ensureBucket(name) {
  let info = await api("GET", "GetBucketInfo", { query: { globalAlias: name } });
  if (!info.ok) {
    const created = await api("POST", "CreateBucket", { body: { globalAlias: name } });
    if (!created.ok) throw new Error(`Couldn't create bucket ${name}: ${JSON.stringify(created.data)}`);
    console.log(`[storage-init] Created bucket ${name}`);
    info = await api("GET", "GetBucketInfo", { query: { globalAlias: name } });
  }
  if (!info.ok) throw new Error(`Couldn't read bucket ${name}: ${JSON.stringify(info.data)}`);
  return info.data.id;
}

async function allowKey(bucketId) {
  const res = await api("POST", "AllowBucketKey", {
    body: { bucketId, accessKeyId: ACCESS_KEY, permissions: { read: true, write: true, owner: true } },
  });
  if (!res.ok) throw new Error(`Couldn't grant key access: ${JSON.stringify(res.data)}`);
}

async function updateBucket(bucketId, body) {
  const res = await api("POST", "UpdateBucket", { query: { id: bucketId }, body });
  if (!res.ok) throw new Error(`Couldn't update bucket: ${JSON.stringify(res.data)}`);
}

async function main() {
  await waitForHealthy();
  await ensureKey();

  // Private bucket: uploads. Only our web app's origin may PUT parts.
  // ExposeHeader "ETag" matters: after each part upload the browser must read the
  // part's ETag and send the list back when completing the multipart upload.
  const privateId = await ensureBucket(PRIVATE_BUCKET);
  await allowKey(privateId);
  await updateBucket(privateId, {
    corsRules: [
      {
        AllowedOrigin: [APP_ORIGIN],
        AllowedMethod: ["GET", "PUT", "POST", "DELETE", "HEAD"],
        AllowedHeader: ["*"],
        ExposeHeader: ["ETag"],
      },
    ],
  });
  console.log(`[storage-init] ${PRIVATE_BUCKET}: private, CORS allows ${APP_ORIGIN}`);

  // Public bucket: HLS playlists, video segments and thumbnails.
  // Any origin may GET, so videos can also be embedded on other websites.
  const publicId = await ensureBucket(PUBLIC_BUCKET);
  await allowKey(publicId);
  await updateBucket(publicId, {
    websiteAccess: { enabled: true, indexDocument: "index.html" },
    corsRules: [{ AllowedOrigin: ["*"], AllowedMethod: ["GET", "HEAD"], AllowedHeader: ["*"] }],
  });
  console.log(`[storage-init] ${PUBLIC_BUCKET}: public website access, CORS allows any origin for GET`);

  console.log("[storage-init] Done.");
}

main().catch((err) => {
  console.error(`[storage-init] FAILED: ${err.message}`);
  process.exit(1);
});
