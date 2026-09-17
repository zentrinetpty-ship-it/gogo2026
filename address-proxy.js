/* =========================================================================
   GOGO address lookup proxy — runs on :3040, no dependencies.

   Why this exists: the browser used to call Nominatim (OpenStreetMap) directly.
   That breaks in two ways we cannot control —
     • Nominatim rate-limits per client, and a burst of typing trips it, so the
       rider sees "no match" for addresses that exist;
     • some SA mobile networks and DNS resolvers block the host outright;
     • the browser cannot set a User-Agent, which their usage policy asks for.

   Proxying through our own domain fixes all three:
     • one server-side identity, so the rate limit is shared and respected;
     • the browser only ever talks to cleanic.co.za, so nothing can block it;
     • we send a proper User-Agent and take the blame if we ever over-ask;
     • results are cached, so repeated lookups never hit them twice.

   Policy compliance: at most one upstream request per second (queued, not
   dropped), an identifying User-Agent, and a 24-hour result cache.
   ========================================================================= */
const http = require("http");
const https = require("https");
const url = require("url");

const PORT = 3040;
const UPSTREAM = "https://nominatim.openstreetmap.org/search";
const UA = "GOGO-Booking/1.0 (cleanic.co.za; order@cleanic.co.za)";

const cache = new Map();          /* query -> { at, body } */
const CACHE_MS = 24 * 60 * 60 * 1000;
let MIN_GAP_MS = 1100;            /* one upstream call per second, per policy */
function slowDown() {
  /* back off, but recover: without this a burst leaves us throttled for good */
  MIN_GAP_MS = Math.min(8000, Math.round(MIN_GAP_MS * 1.6));
}
function speedUp() {
  MIN_GAP_MS = Math.max(1100, Math.round(MIN_GAP_MS / 1.3));
}

let queue = Promise.resolve();
let lastCall = 0;

function throttled(task) {
  const run = queue.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastCall));
    if (wait) await new Promise(r => setTimeout(r, wait));
    lastCall = Date.now();
    return task();
  });
  /* keep the chain alive even if one task rejects */
  queue = run.catch(() => {});
  return run;
}

function upstream(q) {
  return new Promise((resolve, reject) => {
    const u = UPSTREAM
      + "?format=jsonv2&addressdetails=1&limit=6&countrycodes=za"
      + "&q=" + encodeURIComponent(q);
    const req = https.get(u, {
      headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "en" },
      timeout: 12000,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("timeout", () => { req.destroy(new Error("upstream timeout")); });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const q = String(parsed.query.q || "").trim();

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept",
    "Cache-Control": "public, max-age=86400",
  };

  if (req.method === "OPTIONS") { res.writeHead(204, cors).end(); return; }

  if (!q || q.length < 3) {
    res.writeHead(400, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "query too short" }));
    return;
  }

  const hit = cache.get(q.toLowerCase());
  if (hit && Date.now() - hit.at < CACHE_MS) {
    res.writeHead(200, { ...cors, "Content-Type": "application/json", "X-Cache": "hit" });
    res.end(hit.body);
    return;
  }

  try {
    let out = await throttled(() => upstream(q));
    /* Nominatim answers 429 when it wants us to slow down. Wait and try once
       more rather than failing a live booking on a transient throttle. */
    if (out.status === 429) {
      await new Promise(r => setTimeout(r, 2500));
      out = await throttled(() => upstream(q));
    }
    if (out.status !== 200) {
      /* pass the upstream status through so the client can tell a lookup
         failure from a genuine "no match" */
      res.writeHead(502, { ...cors, "Content-Type": "application/json", "X-Upstream": String(out.status) });
      res.end(JSON.stringify({ error: "lookup unavailable", upstream: out.status }));
      return;
    }
    cache.set(q.toLowerCase(), { at: Date.now(), body: out.body });
    res.writeHead(200, { ...cors, "Content-Type": "application/json", "X-Cache": "miss" });
    res.end(out.body);
  } catch (e) {
    res.writeHead(502, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "lookup unavailable", detail: e.message }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("GOGO address proxy on http://127.0.0.1:" + PORT);
});
