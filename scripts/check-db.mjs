// Phase 2 check: is the `videos` table set up correctly in Supabase?
//
// Run from the repo root (PowerShell or cmd):
//   node --env-file=.env scripts/check-db.mjs
//
// It talks to Supabase's REST API with plain fetch (no packages needed):
//   1. With the SECRET key: insert a test row, read it back, try an invalid status
//      (the database should reject it), then delete the test row.
//   2. With the PUBLISHABLE key: try to read and insert. Row Level Security should
//      block both, which proves the browser key can't touch the table on its own.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || url.includes("your-project-ref") || !secretKey?.startsWith("sb_secret_") || secretKey === "sb_secret_xxx") {
  console.error("✗ Fill in NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env first (see README, phase 2).");
  process.exit(1);
}

const table = `${url.replace(/\/+$/, "")}/rest/v1/videos`;

/** Call the REST API. Supabase's new keys go in the `apikey` header. */
async function rest(key, path, init = {}) {
  const res = await fetch(table + path, {
    ...init,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      // Ask Supabase to send back the rows it inserted/changed.
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, data: text ? JSON.parse(text) : null };
}

let failures = 0;
const pass = (msg) => console.log(`✓ ${msg}`);
const fail = (msg, detail) => {
  failures++;
  console.log(`✗ ${msg}`);
  if (detail !== undefined) console.log("   ", JSON.stringify(detail));
};

// ── 1. Secret key (what our server code will use) ───────────────────────────
const inserted = await rest(secretKey, "", {
  method: "POST",
  body: JSON.stringify({ title: "check-db test row" }),
});

if (!inserted.ok) {
  fail(`Insert failed (HTTP ${inserted.status}). Did you run supabase/migrations/0001_videos.sql?`, inserted.data);
  process.exit(1);
}
const row = inserted.data[0];
pass(`Inserted a row: id=${row.id}`);

if (row.status === "uploading" && row.created_at) pass("Defaults work (status='uploading', created_at set)");
else fail("Unexpected defaults", row);

const read = await rest(secretKey, `?id=eq.${row.id}&select=*`);
if (read.ok && read.data.length === 1) pass("Read it back with the secret key");
else fail("Couldn't read the row back", read.data);

const badStatus = await rest(secretKey, `?id=eq.${row.id}`, {
  method: "PATCH",
  body: JSON.stringify({ status: "banana" }),
});
if (!badStatus.ok) pass("Database rejected an invalid status (check constraint works)");
else fail("An invalid status was accepted. Is the check constraint missing?", badStatus.data);

const removed = await rest(secretKey, `?id=eq.${row.id}`, { method: "DELETE" });
if (removed.ok) pass("Deleted the test row");
else fail("Couldn't delete the test row", removed.data);

// ── 2. Publishable key (what a browser has) ─────────────────────────────────
if (!publishableKey || publishableKey === "sb_publishable_xxx") {
  console.log("- Skipped RLS check: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY isn't set.");
} else {
  // With RLS on and no policies, a read either returns zero rows or a permission
  // error (depending on the project's default grants). Both mean "protected".
  const anonRead = await rest(publishableKey, "?select=id&limit=1");
  if (anonRead.ok && anonRead.data.length === 0) pass("Publishable key sees no rows (RLS is on)");
  else if (!anonRead.ok) pass(`Publishable key can't read the table (HTTP ${anonRead.status})`);
  else fail("Publishable key could read rows. Is RLS enabled?", anonRead.data);

  // ...and writes are refused.
  const anonInsert = await rest(publishableKey, "", {
    method: "POST",
    body: JSON.stringify({ title: "should be blocked" }),
  });
  if (!anonInsert.ok) pass(`Publishable key can't insert (HTTP ${anonInsert.status}, RLS works)`);
  else fail("Publishable key inserted a row! RLS is not protecting the table.", anonInsert.data);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
