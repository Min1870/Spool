// A pretend "other website" for testing phase 7, on a DIFFERENT origin (port 5500).
// It embeds a Spool video in an <iframe> and calls the public API from JavaScript,
// exactly like someone else's blog would.
//
// Run from the repo root (with the web app running on APP_ORIGIN):
//   node --env-file=.env scripts/embed-test.mjs
// Then open:  http://localhost:5500/?id=<video id>

import http from "node:http";

const APP = (process.env.APP_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
const PORT = 5500;

const page = (id) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Someone else's blog</title>
  <style>
    body { font-family: Georgia, serif; max-width: 720px; margin: 40px auto; padding: 0 16px; background: #fffaf0; color: #222; }
    pre { background: #222; color: #eee; padding: 12px; overflow: auto; font-size: 12px; }
    .ok { color: #070; } .bad { color: #b00; }
  </style>
</head>
<body>
  <h1>My travel blog</h1>
  <p>This page runs on <b>${`http://localhost:${PORT}`}</b>, a different origin from Spool (<b>${APP}</b>).</p>
  ${
    id
      ? `<h2>1. Embedded player (iframe)</h2>
  <iframe src="${APP}/embed/${id}" title="Spool video" width="640" height="360" style="border:0;max-width:100%" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>

  <h2>2. Public API, called from this page's JavaScript</h2>
  <p id="status">Calling ${APP}/api/videos/${id} …</p>
  <pre id="json"></pre>
  <script>
    fetch(${JSON.stringify(`${APP}/api/videos/${id}`)})
      .then((r) => r.json())
      .then((data) => {
        document.getElementById("status").innerHTML = '<span class="ok">✓ CORS works: the browser let this page read the response.</span>';
        document.getElementById("json").textContent = JSON.stringify(data, null, 2);
      })
      .catch((err) => {
        document.getElementById("status").innerHTML = '<span class="bad">✗ Blocked: ' + err + ' (see the browser console)</span>';
      });
  </script>`
      : `<p>Add <code>?id=&lt;video id&gt;</code> to the URL. Copy an id from a Spool watch page URL.</p>`
  }
</body>
</html>`;

http
  .createServer((req, res) => {
    const id = new URL(req.url ?? "/", `http://localhost:${PORT}`).searchParams.get("id");
    // Only allow a UUID, so nothing odd can be injected into the page.
    const safeId = id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page(safeId));
  })
  .listen(PORT, () => console.log(`Pretend blog running at http://localhost:${PORT}/?id=<video id>  (embedding ${APP})`));
