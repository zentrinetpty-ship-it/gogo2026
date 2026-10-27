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
/* OSM / municipal / colloquial names -> the names the rides use.
   A table, not fuzzy matching: likeness produced false positives on real data
   ("East London" matching "London"), and a wrong city is worse than none — it
   filters the rider into an empty list with no explanation. */
const CITY_ALIASES = {
  "kugompo": "East London",
  "kugompo city": "East London",
  "umtata": "Mthatha",
  "queenstown": "Komani",
  "engcobo": "Ngcobo",
  "gcuwa": "Butterworth",
  "dutywa": "Idutywa",
  "gqeberha": "Gqeberha",
  "port elizabeth": "Gqeberha",
  "makhanda": "Makhanda",
  "grahamstown": "Makhanda",
  "kwamaqoma": "Fort Beaufort",
  "nxuba": "Cradock",
  "qonce": "Qonce",
  "king williams town": "Qonce",
  "king william s town": "Qonce",
  "kariega": "Kariega",
  "uitenhage": "Kariega",
  "bhisho": "Bhisho",
  "bisho": "Bhisho",
  "kwabhaca": "Mount Frere",
  "east london": "East London",
  "kugompo": "East London",
  "kugompo city": "East London",
  "buffalo city": "East London",
  "gonubie": "East London",
  "beacon bay": "East London",
  "mthatha": "Mthatha",
  "umtata": "Mthatha",
  "komani": "Komani",
  "queenstown": "Komani",
  "cala": "Cala",
  "ngcobo": "Ngcobo",
  "engcobo": "Ngcobo",
  "butterworth": "Butterworth",
  "gcuwa": "Butterworth",
  "idutywa": "Idutywa",
  "dutywa": "Idutywa",
  "kokstad": "Kokstad",
  "port shepstone": "Port Shepstone",
  "durban": "Durban"
};

function normaliseCity(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (CITY_ALIASES[s]) return CITY_ALIASES[s];
  /* widen: any alias appearing as a whole word, so "Buffalo City Metropolitan
     Municipality" still lands on East London */
  for (const alias of Object.keys(CITY_ALIASES)) {
    if (alias.length > 3 && new RegExp("\\b" + alias + "\\b").test(s)) return CITY_ALIASES[alias];
  }
  return null;
}

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

/* ═══════════════════════════════════════════════════════════════════════════
   MAPBOX AUTOCOMPLETE

   Why Mapbox replaces Nominatim for suggestions: Nominatim has no South African
   house numbers. Typing "131 Oxford Street" returned the street and never the
   number, which is the single thing a pick-up field must capture. Verified
   against the live token — Mapbox returns

       131 Oxford Street, East London, Eastern Cape 5201, South Africa

   The token is a Mapbox public (pk.) token, so it is not a secret in the
   leaked-credential sense, but it lives here rather than in page source so it
   cannot be lifted and used to burn the account's monthly geocode quota.

   Nominatim is kept as the fallback: a Mapbox quota error then costs accuracy,
   not the whole feature.
   ═══════════════════════════════════════════════════════════════════════════ */
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || "";

/* Corridor centre. Biasing is load-bearing, not cosmetic: unbounded, the query
   "Komani" resolves to a street in Johannesburg roughly 800km away, and a rider
   in Queenstown would get a suggestion they cannot use. */
const MAPBOX_BIAS = "28.30,-32.30";

/* Mapbox and GOGO do not agree on every name. Mapbox still returns
   "Port Elizabeth" for Gqeberha, and either spelling can appear in a place
   context, so both directions are mapped to the canonical GOGO town. */
const TOWN_ALIASES = {
  "port elizabeth": "Gqeberha",
  "gqeberha": "Gqeberha",
  "queenstown": "Komani",
  "komani": "Komani",
  "umtata": "Mthatha",
  "mthatha": "Mthatha",
  "east london": "East London",
  "kugompo": "East London",
  "buffalo city": "East London",
  "gonubie": "East London",
  "beacon bay": "East London",
  "butterworth": "Butterworth",
  "gcuwa": "Butterworth",
  "idutywa": "Idutywa",
  "dutywa": "Idutywa",
  "ngcobo": "Ngcobo",
  "engcobo": "Ngcobo",
  "grahamstown": "Makhanda",
  "makhanda": "Makhanda",
};

const GOGO_TOWNS = ["East London", "Komani", "Butterworth", "Idutywa", "Mthatha",
                    "Gqeberha", "Ngcobo", "Makhanda"];

/* Mapbox puts the town in `text` for a place feature, and in context.place for
   anything below it. Both are checked, then the alias table, then a loose
   contains so a hyphenated or suffixed spelling still lands. */
function townOf(feature) {
  const names = [];
  if (feature.text) names.push(feature.text);
  (feature.context || []).forEach((c) => { if (c.text) names.push(c.text); });
  for (const n of names) {
    const hit = TOWN_ALIASES[String(n).toLowerCase().trim()];
    if (hit) return hit;
  }
  for (const n of names) {
    for (const t of GOGO_TOWNS) {
      if (String(n).toLowerCase().indexOf(t.toLowerCase()) !== -1) return t;
    }
  }
  return null;
}

async function mapboxSuggest(q) {
  const url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
    encodeURIComponent(q) + ".json" +
    "?access_token=" + MAPBOX_TOKEN +
    "&country=za&limit=8&language=en" +
    "&proximity=" + MAPBOX_BIAS +
    "&types=address,place,locality,neighborhood,poi";

  const r = await fetch(url);
  if (!r.ok) throw new Error("mapbox " + r.status);
  const j = await r.json();

  return (j.features || []).map((f) => {
    const town = townOf(f);
    return {
      /* the full label the field displays */
      label: f.place_name,
      /* what gets stored on a booking: number + street on their own, so the
         record is not padded with province and postcode */
      address: f.address ? (f.address + " " + f.text) : f.text,
      town,
      lat: f.center ? f.center[1] : null,
      lng: f.center ? f.center[0] : null,
      served: town !== null,
    };
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

/* ── /address/city ──────────────────────────────────────────────────────
     Resolves an address to the town a rider is starting from. Same upstream,
     same cache and throttle as the suggestion list, so a lookup that already
     happened for the dropdown costs nothing here. */
  /* Caddy strips the /api prefix before proxying here, so the path arriving
       is "/address/city". Both are accepted: the stripped form for real
       traffic through go-go.city, the full form for direct calls in tests. */
  const inPath = String(parsed.pathname || "").replace(/\/+$/, "");
  /*  ── /address/suggest ─────────────────────────────────────────────────────
      Mapbox first (it is the only source with SA house numbers), Nominatim as
      fallback. Same cache and CORS as everything else here. */
  if (inPath === "/address/suggest" || inPath === "/api/address/suggest") {
    const out = { suggestions: [], source: "mapbox" };
    if (q && q.length >= 3) {
      const key = "sugg:" + q.toLowerCase();
      const hitS = cache.get(key);
      if (hitS && Date.now() - hitS.at < CACHE_MS) {
        res.writeHead(200, { ...cors, "Content-Type": "application/json", "X-Cache": "hit" });
        res.end(hitS.body);
        return;
      }
      try {
        out.suggestions = await mapboxSuggest(q);
      } catch (e) {
        out.source = "nominatim-fallback";
        try {
          const r2 = await throttled(() => upstream(q));
          const rows = JSON.parse(r2.body || "[]");
          out.suggestions = (Array.isArray(rows) ? rows : []).map((row) => {
            const a = row.address || {};
            const town = TOWN_ALIASES[String(a.city || a.town || "").toLowerCase().trim()] || null;
            return {
              label: row.display_name,
              address: row.display_name ? row.display_name.split(",")[0] : "",
              town,
              lat: Number(row.lat) || null,
              lng: Number(row.lon) || null,
              served: town !== null,
            };
          });
        } catch (e2) {
          out.error = String(e2.message || e2);
        }
      }
      const body = JSON.stringify(out);
      cache.set(key, { at: Date.now(), body });
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(body);
      return;
    }
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify(out));
    return;
  }

  if (inPath === "/address/city" || inPath === "/api/address/city") {
    if (!q || q.length < 3) {
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ city: null, matched: false, candidates: [] }));
      return;
    }
    const key = "city:" + q.toLowerCase();
    const hitCity = cache.get(key);
    if (hitCity && Date.now() - hitCity.at < CACHE_MS) {
      res.writeHead(200, { ...cors, "Content-Type": "application/json", "X-Cache": "hit" });
      res.end(hitCity.body);
      return;
    }
    try {
      /* reuse the same upstream call the dropdown makes — addressdetails=1
         already asks for the city field, so no extra request shape is needed */
      let out = await throttled(() => upstream(q));
      if (out.status === 429) {
        await new Promise(r => setTimeout(r, 2500));
        out = await throttled(() => upstream(q));
      }
      let rows = [];
      try { rows = JSON.parse(out.body); } catch { rows = []; }
      const candidates = [];
      for (const row of (Array.isArray(rows) ? rows : [])) {
        const a = row.address || {};
        const city =
          normaliseCity(a.city) ||
          normaliseCity(a.town) ||
          normaliseCity(a.municipality) ||
          normaliseCity(a.county) ||
          normaliseCity(a.suburb);
        if (city && candidates.indexOf(city) === -1) candidates.push(city);
      }
      const body = JSON.stringify({
        city: candidates[0] || null,
        matched: candidates.length > 0,
        candidates
      });
      cache.set(key, { at: Date.now(), body });
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(body);
    } catch (e) {
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ city: null, matched: false, candidates: [], error: String(e.message || e) }));
    }
    return;
  }

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
