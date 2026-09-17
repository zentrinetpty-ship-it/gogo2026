/* Tiny static server for GOGO — no dependencies. Runs on :3020.
   Everything is served from this folder: the React landing is copied in here
   from gogohermes/_build on deploy, so there is no second source of truth to
   get out of step. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = 3020;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json", ".map": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};

function send(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(500).end("error"); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || "/").split("?")[0]);

  /* ── everything is one tree now: /gogo/ resolves to index.html, and the
     landing's _app/ and fonts/ sit alongside the inner pages ── */
  if (url === "/") url = "/gogo/";
  let file = path.join(ROOT, path.normalize(url).replace(/^([/\\])+/, ""));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const alt = path.join(ROOT, url.replace(/\/$/, "") + ".html");
    file = fs.existsSync(alt) ? alt : path.join(ROOT, "404.html");
  }
  send(res, file);
}).listen(PORT, "127.0.0.1", () => console.log("GOGO running on http://127.0.0.1:" + PORT));
