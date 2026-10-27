/* =========================================================================
   GOGO — BOOKING SERVER

   The one thing the client is not allowed to decide: money.

   Right now every price is computed in the browser from FEE_CONFIG, which
   lives in a file anyone can read and edit. A user can open DevTools, run
   FEE_CONFIG.pickup = 0, and book a seat for nothing. No amount of
   obfuscation fixes that, because the browser has to know the numbers in
   order to show them.

   So the browser keeps computing the price for DISPLAY, and the server
   independently recomputes it on every write and refuses the request if the
   two disagree. The client can lie about anything except the ride id.

   Run alongside the site:
     node booking-server.js            (listens on 3050)
   Caddy proxies /gogo/api/* to it.

   Storage is a JSON file next to this script. Deliberately simple: a real
   database is the next step, but this proves the architecture and keeps a
   single source of truth for every rand.
   ========================================================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const agent = require("./support-agent");

const PORT = 3050;
const DATA = path.join(__dirname, "booking-data.json");

/* ── the same numbers the client uses, kept here in one place ───────────── */
/* These are the authoritative values. The client's FEE_CONFIG is a mirror for
   display only — if the two ever drift, this one wins and the client's price
   gets rejected, which is visible immediately rather than silently wrong. */
const FEES = {
  pickup: 19.99,
  platform: 9.99,
  parcelBooking: 19.99,
  version: 2,
};

/* ── the ride catalogue ─────────────────────────────────────────────────── */
/* Fares per leg. The client may not send these; it sends a ride id and the
   server looks the fare up. Until there is a real ride table, this is it. */
const RIDES = {
  g1: {
    driver: "Verified driver",
    from: "East London", to: "Mthatha",
    depart: "06:30", vehicle: "Toyota Quantum",
    seats: 4,
    /* fare per stopping point, keyed by the town the rider gets off at */
    legs: { Komani: 120, Butterworth: 170, Idutywa: 195, Mthatha: 240 },
  },
  g2: {
    driver: "Verified driver",
    from: "East London", to: "Mthatha",
    depart: "08:00", vehicle: "Toyota Quantum",
    seats: 3,
    legs: { Cala: 130, Ngcobo: 165, Mthatha: 185 },
  },
};

/* ── tiny JSON store ────────────────────────────────────────────────────── */
function load() {
  try { return JSON.parse(fs.readFileSync(DATA, "utf8")); }
  catch (e) { return { bookings: [], audit: [] }; }
}
function save(db) {
  const tmp = DATA + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA);          /* atomic: a crash cannot half-write */
}

/* ── money ──────────────────────────────────────────────────────────────── */
/* Everything in cents, integers only. Floats and money do not mix: 19.99 * 3
   in binary floating point is 59.97000000000001, and a cent that drifts is a
   cent someone argues about. */
const toCents = (r) => Math.round(Number(r) * 100);
const toRands = (c) => c / 100;

/* The server's own price for a seat. The client never supplies these inputs. */
function priceSeat(rideId, stop, seats) {
  const ride = RIDES[rideId];
  if (!ride) return { error: "unknown ride" };
  const fare = ride.legs[stop];
  if (fare === undefined) return { error: "unknown stop" };
  /* Refuse an out-of-range seat count rather than quietly clamping it. A
     silent clamp booked 3 seats when 99 were asked for, which is worse than
     an error: the rider is charged for something they did not ask for. */
  const n = Number(seats);
  if (!Number.isInteger(n) || n < 1 || n > 3) return { error: "seats must be 1 to 3" };
  if (n > ride.seats) return { error: "not enough seats left" };

  const fareC = toCents(fare);
  const pickupC = toCents(FEES.pickup) * n;
  const platformC = toCents(FEES.platform) * n;

  return {
    ok: true,
    currency: "ZAR",
    seats: n,
    stop,
    rideId,
    rows: [
      { label: `Card fare × ${n} seat${n > 1 ? "s" : ""}`, cents: fareC * n },
      { label: `Pickup fee × ${n}`, cents: pickupC },
      { label: `Platform fee × ${n}`, cents: platformC },
    ],
    totalCents: fareC * n + pickupC + platformC,
    feeVersion: FEES.version,
  };
}

function priceParcel(rideId, kg) {
  const ride = RIDES[rideId];
  if (!ride) return { error: "unknown ride" };
  const weight = Number(kg) || 0;
  if (weight <= 0 || weight > 50) return { error: "weight out of range" };
  /* carriage is agreed with the driver and arrives as a claim, so it is
     recorded but the platform fee is still ours to set */
  const bookingC = toCents(FEES.parcelBooking);
  return {
    ok: true,
    currency: "ZAR",
    kg: weight,
    rideId,
    rows: [{ label: "Parcel booking fee", cents: bookingC }],
    totalCents: bookingC,
    feeVersion: FEES.version,
  };
}

/* ── http ───────────────────────────────────────────────────────────────── */
function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "https://cleanic.co.za",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(payload);
}

function body(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > 64 * 1024) { req.destroy(); resolve(null); }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(b || "{}")); } catch (e) { resolve(null); }
    });
  });
}


/* -- destination matching ---------------------------------------------------
   POST /match  { "q": "kokstad", "from": "East London" }

   The old booking card offered a hard-coded town dropdown, which is a lie in
   both directions: it hides stops we genuinely serve and offers ones we may
   never reach. The routes are a corridor, and every key in a ride's `legs` map
   is a place we really stop, with a real fare attached.

   So this answers one question -- "I want to go to X, which hikes get me
   there?" -- ranked by how well the name fits, and never invents a town.
   ------------------------------------------------------------------------- */

const MIN_QUERY = 2;

/* Levenshtein, capped. Forgiving a typo ("koktad" -> Kokstad) is useful;
   inventing a match out of an unrelated word is not. */
function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

function scoreStop(stop, q) {
  const s = stop.toLowerCase();
  if (s === q) return 100;
  if (s.startsWith(q)) return 85;
  if (s.includes(q)) return 70;
  const d = editDistance(s, q);
  const allowed = s.length >= 8 ? 2 : 1;
  if (d <= allowed) return 55 - d * 10;
  return 0;
}

/* Every stop we serve, taken from the rides themselves -- one source of truth.
   Add a ride with a new stop and it becomes bookable with no other change. */
function allStops() {
  const seen = new Map();
  for (const [id, r] of Object.entries(RIDES)) {
    for (const [stop, fare] of Object.entries(r.legs || {})) {
      if (!seen.has(stop)) seen.set(stop, []);
      seen.get(stop).push({
        rideId: id, fare, depart: r.depart, vehicle: r.vehicle,
        seats: r.seats, from: r.from, to: r.to,
      });
    }
  }
  return seen;
}

function matchDestination(q, fromFilter) {
  const query = String(q || "").trim().toLowerCase();
  if (query.length < MIN_QUERY) return { query, matches: [], suggestion: null };

  const stops = allStops();
  const hits = [];

  for (const [stop, rides] of stops) {
    const score = scoreStop(stop, query);
    if (!score) continue;
    for (const r of rides) {
      if (fromFilter && r.from.toLowerCase() !== String(fromFilter).toLowerCase()) continue;
      hits.push({ kind: "stop", score: score, stop: stop, rideId: r.rideId, from: r.from, to: r.to, depart: r.depart, vehicle: r.vehicle, seats: r.seats, fare: r.fare });
    }
  }

  hits.sort(function (a, b) { return b.score - a.score || a.depart.localeCompare(b.depart); });

  /* Nothing matched. This is a scheduling answer, not a coverage answer: the
     town may well sit on a route we work, there is just no hike to it at this
     moment. So never say "we do not go there" -- say there is no direct ride
     right now, and offer the closest stops we can actually reach today. */
  let suggestion = null;
  let alternatives = [];
  if (!hits.length) {
    let best = null;
    for (const stop of stops.keys()) {
      const d = editDistance(stop.toLowerCase(), query);
      if (!best || d < best.d) best = { stop: stop, d: d };
    }
    if (best) suggestion = best.stop;

    /* the nearest few stops, and every hike that reaches them, so the rider has
       something real to act on rather than a dead end */
    const nearest = Array.from(stops.keys())
      .map(function (stop) { return { stop: stop, d: editDistance(stop.toLowerCase(), query) }; })
      .sort(function (a, b) { return a.d - b.d || a.stop.localeCompare(b.stop); })
      .slice(0, 3);

    for (const n of nearest) {
      const rides = stops.get(n.stop) || [];
      for (const r of rides) {
        alternatives.push({
          stop: n.stop, rideId: r.rideId, from: r.from, to: r.to,
          depart: r.depart, vehicle: r.vehicle, seats: r.seats, fare: r.fare,
        });
      }
    }
    alternatives.sort(function (a, b) { return a.depart.localeCompare(b.depart); });
    alternatives = alternatives.slice(0, 6);
  }

  return {
    query: query,
    matches: hits.slice(0, 12),
    suggestion: suggestion,
    alternatives: alternatives,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // The server used to live under cleanic.co.za/gogo/api. On go-go.city the
  // prefix is just /api, so strip whichever one arrives and treat the rest
  // as the route. That keeps old links working while the new domain beds in.
  const route = url.pathname.replace(/^\/gogo\/api/, "").replace(/^\/api/, "") || "/";

  /* destination matching -- see matchDestination above */
  if (req.method === "POST" && route === "/match") {
    let body = "";
    req.on("data", function (c) { body += c; if (body.length > 4096) req.destroy(); });
    req.on("end", function () {
      let payload = {};
      try { payload = JSON.parse(body || "{}"); } catch (e) { payload = {}; }
      const out = matchDestination(payload.q, payload.from);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(out));
    });
    return;
  }

  if (req.method === "OPTIONS") return json(res, 204, {});

  /* ── GET /rides ── the catalogue, so the client can render without
     inventing prices of its own ── */
  if (req.method === "GET" && route === "/rides") {
    const list = Object.keys(RIDES).map((id) => ({
      id, from: RIDES[id].from, to: RIDES[id].to,
      depart: RIDES[id].depart, vehicle: RIDES[id].vehicle,
      seats: RIDES[id].seats, legs: RIDES[id].legs,
    }));
    return json(res, 200, { rides: list, feeVersion: FEES.version });
  }

  /* ── POST /quote ── the server prices a seat. The client calls this and
     shows the result. It never needs to compute a total itself. ── */
  if (req.method === "POST" && route === "/quote") {
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });
    const q = b.kind === "parcel"
      ? priceParcel(b.rideId, b.kg)
      : priceSeat(b.rideId, b.stop, b.seats);
    if (!q.ok) return json(res, 400, { error: q.error });
    return json(res, 200, q);
  }

  /* ── POST /book ── the actual booking. This is the gate.
     The client may send whatever total it likes; the server recomputes and
     rejects a mismatch. So a tampered price cannot get through. ── */
  if (req.method === "POST" && route === "/book") {
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });

    const quoted = b.kind === "parcel"
      ? priceParcel(b.rideId, b.kg)
      : priceSeat(b.rideId, b.stop, b.seats);
    if (!quoted.ok) return json(res, 400, { error: quoted.error });

    /* ── the check that matters ── */
    if (b.clientTotalCents !== undefined && b.clientTotalCents !== quoted.totalCents) {
      const db = load();
      db.audit.push({
        at: new Date().toISOString(),
        kind: "PRICE_MISMATCH",
        rideId: b.rideId,
        claimed: b.clientTotalCents,
        actual: quoted.totalCents,
        ip: req.socket.remoteAddress,
      });
      save(db);
      return json(res, 409, {
        error: "price mismatch",
        /* tell the client the right number so the UI can correct itself
           rather than leaving the rider stuck */
        serverTotalCents: quoted.totalCents,
      });
    }

    const db = load();
    const booking = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      status: "pending",
      rideId: b.rideId,
      kind: b.kind === "parcel" ? "parcel" : "passenger",
      seats: quoted.seats || 0,
      stop: b.stop || null,
      kg: quoted.kg || null,
      pickup: String(b.pickup || "").slice(0, 200),
      suburb: String(b.suburb || "").slice(0, 80),
      city: String(b.city || "").slice(0, 80),
      /* the price is the SERVER's, never the client's */
      totalCents: quoted.totalCents,
      rows: quoted.rows,
      feeVersion: quoted.feeVersion,
      payMethod: b.payMethod === "cash" ? "cash" : "card",
    };

    /* a ride cannot be oversold */
    const taken = db.bookings
      .filter((x) => x.rideId === booking.rideId && x.status !== "cancelled")
      .reduce((s, x) => s + (x.seats || 0), 0);
    if (booking.kind === "passenger" && taken + booking.seats > (RIDES[b.rideId] || {}).seats) {
      return json(res, 409, { error: "not enough seats left" });
    }

    db.bookings.push(booking);
    db.audit.push({ at: booking.at, kind: "BOOKED", id: booking.id, total: booking.totalCents });
    save(db);
    return json(res, 201, { booking });
  }

  /* ── GET /bookings ── read back ── */
  /* ── GET /booking/:id ── one booking, for the tracking page.

     Sits before the list route so /booking/abc is not swallowed by /bookings.
     A missing id is a 404 rather than an empty 200: the client distinguishes
     "not found" from "not loaded", and a tracking page that silently shows
     nothing is worse than one that says the booking does not exist. */
  if (req.method === "GET" && route.startsWith("/booking/")) {
    const id = decodeURIComponent(route.slice("/booking/".length));
    if (!id) return json(res, 400, { error: "missing booking id" });
    const db = load();
    const booking = (db.bookings || []).find((b) => b && b.id === id);
    if (!booking) return json(res, 404, { error: "booking not found" });
    /* The tracking view needs the route context, not just the stored row, so the
       ride is joined in here rather than making the client fetch it separately. */
    const src = RIDES[booking.rideId];
    const ride = src
      ? { id: booking.rideId, from: src.from, to: src.to, depart: src.depart,
          vehicle: src.vehicle, seats: src.seats, legs: src.legs }
      : null;
    return json(res, 200, { booking, ride });
  }

  if (req.method === "GET" && route === "/bookings") {
    const db = load();
    return json(res, 200, { bookings: db.bookings });
  }


  /* ══ support agent ══════════════════════════════════════════════════════
     The roster is public: a guest should see who they are about to talk to.
     full_power is deliberately always false here — GOGO has no auth yet, so
     nobody can be an owner through this route. */
  if (req.method === "GET" && route === "/agent/agents") {
    return json(res, 200, {
      agents: agent.AGENTS,
      role_label: "Customer Support",
      full_power: false,
      towns: agent.CORRIDOR,
    });
  }

  if (req.method === "GET" && route === "/agent/health") {
    const ready = !!(process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY);
    return json(res, 200, { ready, model: agent.MODEL_NAME || "deepseek-chat" });
  }

  if (req.method === "POST" && route === "/agent/chat") {
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });

    const text = String(b.message || "").trim().slice(0, 1500);
    if (!text) return json(res, 400, { error: "Say something first" });

    /* Identity. No auth system exists on GOGO yet, so every caller is a guest.
       This is the single line to change when sign-in arrives: resolve the
       session here and hand the real user to the agent. The tool layer already
       scopes every lookup by identity, so nothing downstream needs touching. */
    const user = { id: "guest", role: "guest", email: null, name: "Guest" };

    const agentDef = agent.AGENTS.find(a => a.id === b.agent_id) || agent.AGENTS[0];

    /* History is kept on the request, not in server memory: a guest's thread is
       their browser's business, and a server-side store would need sessions to
       stop two guests sharing a transcript. Capped so the context cannot grow
       without bound. */
    const history = Array.isArray(b.history)
      ? b.history
          .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-12)
          .map(m => ({ role: m.role, content: m.content.slice(0, 1200) }))
      : [];

    const messages = [
      { role: "system", content: agent.systemPrompt(agentDef, user) },
      ...history,
      { role: "user", content: text },
    ];

    /* collected while tools run, so the reply can carry structured facts the UI
       needs without parsing the model's prose */
    let createdTicket = null;

    const deps = {
      db: {
        /* One entry per LEG, not per ride. A ride's legs map is stop -> fare,
           so flattening it is what lets the agent answer "how much to X". */
        rides: () => {
          const out = [];
          Object.keys(RIDES).forEach(id => {
            const r = RIDES[id];
            Object.keys(r.legs || {}).forEach(stop => {
              out.push({
                id: id + ":" + stop,
                fromCity: r.from,
                toCity: stop,
                depart: r.depart,
                seatsLeft: r.seats,
                price: r.legs[stop],
              });
            });
          });
          return out;
        },
        bookings: () => load().bookings || [],
      },
      saveTicket: async (ticket) => {
        const db = load();
        db.tickets = db.tickets || [];
        db.tickets.push(ticket);
        save(db);
        createdTicket = ticket.id;
      },
      cancelBooking: async (id) => {
        const db = load();
        const b = (db.bookings || []).find(x => x.id === id);
        if (!b) return false;
        b.status = "cancelled";
        b.cancelledAt = new Date().toISOString();
        /* a cancelled seat is a seat again */
        if (b.rideId && RIDES[b.rideId] && b.seats) {
          RIDES[b.rideId].seats += Number(b.seats) || 0;
        }
        save(db);
        return true;
      },
    };

    try {
      const answer = await agent.reply(messages, user, deps);
      return json(res, 200, {
        reply: answer,
        agent: { id: agentDef.id, name: agentDef.name },
        typing_ms: agent.typingMs(text, answer),
        ticket: createdTicket,
      });
    } catch (e) {
      /* Never leak a stack trace or a provider error to a customer. Log it and
         give them a way forward. */
      console.error("agent chat failed:", e && e.message);
      return json(res, 200, {
        reply: "Sorry, I am battling to check that right now. Let me get a person from the team to help you.",
        agent: { id: agentDef.id, name: agentDef.name },
        typing_ms: 1800,
        degraded: true,
      });
    }
  }

  return json(res, 404, { error: "no such endpoint" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("GOGO booking server on http://127.0.0.1:" + PORT);
});
