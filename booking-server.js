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
const intervals = require("./seat-intervals");
const payments = require("./payments");
const auth = require("./auth");

/* ── auth helpers ────────────────────────────────────────────────────────── */
function bearer(req) {
  const h = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}

function cookieSession(req) {
  const raw = req.headers["cookie"] || "";
  const m = /(?:^|;\s*)gogo_session=([^;]+)/.exec(raw);
  return m ? decodeURIComponent(m[1]) : "";
}


const agent = require("./support-agent");
const driverOps = require("./driver-ops");
const driverRoutes = require("./driver-routes");

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

/* ── timetable ─────────────────────────────────────────────────────────────
   No GPS. The van's progress is inferred from its departure time and how long
   each leg usually takes. That is a schedule, not a position, and the UI must
   never present it as live tracking.

   Leg minutes are a rough road estimate at ~70km/h with town stops. They exist
   so "when will it reach Komani" has an answer better than the departure time. */
const LEG_MINUTES = 45;

function minutesOfDay(hhmm) {
  const p = String(hhmm || "00:00").split(":");
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
}

function hhmmOf(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

/**
 * When is the van due at each stop, and which stops are still reachable today?
 * Returns [{ town, idx, eta, reachable }].
 */
function scheduleFor(ride) {
  const stops = intervals.stopSequence(ride);
  const start = minutesOfDay(ride.depart);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return stops.map(function (town, i) {
    const eta = start + i * LEG_MINUTES;
    return {
      town: town,
      idx: i,
      eta: hhmmOf(eta),
      /* still sellable if the van is not yet due past this stop. A minute of
         grace so a rider is not refused as the van rolls in. */
      reachable: eta > nowMin - 1,
    };
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // The server used to live under cleanic.co.za/gogo/api. On go-go.city the
  // prefix is just /api, so strip whichever one arrives and treat the rest
  // as the route. That keeps old links working while the new domain beds in.
  const route = url.pathname.replace(/^\/gogo\/api/, "").replace(/^\/api/, "") || "/";

  /* ── driver operations + chat ───────────────────────────────────────────
     Twelve routes live in their own module so this file stays a flat list of
     booking logic. It returns true when it handled the request; anything it does
     not recognise falls through to the routes below. Mounted high so a
     /driver/* path is never mistaken for a booking route. */
  if (driverRoutes(req, res, route, url, {
    auth, ops: driverOps, json, body, bearer, cookieSession,
  })) return;

  /* destination matching -- see matchDestination above */
  /* ══ mid-route search ═══════════════════════════════════════════════════
     A rider standing in Komani asks "what is still coming through here toward
     Mthatha". This is a different question from "book from East London", and the
     answer must lead with the time the van reaches THEIR town, not the time it
     left the origin. */
  if (req.method === "GET" && route === "/match/midroute") {
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    if (!from || !to) return json(res, 400, { error: "from and to are required" });

    const db = load();
    const out = [];

    Object.keys(RIDES).forEach(function (rideId) {
      const ride = RIDES[rideId];
      const full = Object.assign({ id: rideId }, ride);
      const sched = scheduleFor(ride);
      const here = sched.find(function (x) { return intervals.sameTown(x.town, from); });
      const there = sched.find(function (x) { return intervals.sameTown(x.town, to); });
      if (!here || !there || there.idx <= here.idx) return;   // wrong direction
      if (!here.reachable) return;                            // van already due past

      const free = intervals.seatsFromTown(full, db.bookings, from);
      out.push({
        rideId: rideId,
        from: here.town,
        to: there.town,
        /* the number that matters to someone standing in Komani */
        dueAtTheirTown: here.eta,
        originDepart: ride.depart,
        seatsFree: free,
        vehicle: ride.vehicle,
        bookable: free > 0,
      });
    });

    out.sort(function (a, b) {
      return minutesOfDay(a.dueAtTheirTown) - minutesOfDay(b.dueAtTheirTown);
    });

    return json(res, 200, {
      from: from,
      to: to,
      rides: out,
      note: "dueAtTheirTown is from the timetable, not live tracking",
    });
  }

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

    /* a ride cannot be oversold ON ANY LEG IT TOUCHES.
       The old check summed every booking on the ride and compared it to the
       vehicle total, which is only right when everybody rides the whole route.
       Once a passenger alights early, the freed interval can be sold to someone
       boarding further along, and that is the entire point of this feature. */
    if (booking.kind === "passenger") {
      const ride = Object.assign({ id: b.rideId }, RIDES[b.rideId] || {});
      const fromTown = booking.city || (RIDES[b.rideId] || {}).from;
      const check = intervals.canBook(ride, db.bookings, fromTown, booking.stop, booking.seats);
      if (!check.ok) {
        return json(res, 409, {
          error: check.error,
          detail: check.detail || null,
          seatsFree: check.seatsFree != null ? check.seatsFree : null,
        });
      }
      /* stored so occupancy survives a restart without re-resolving towns */
      booking.boardIdx = check.boardIdx;
      booking.alightIdx = check.alightIdx;
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
        /* One row per LEG, carrying everything the ride finder needs to reason
           about direction: the ride it belongs to, and that leg's position in
           the ride's own stop order. Without legOrder a matcher cannot tell
           whether a town is ahead of the rider or behind them. */
        rides: () => {
          const out = [];
          Object.keys(RIDES).forEach(id => {
            const r = RIDES[id];
            const stops = Object.keys(r.legs || {});
            stops.forEach((stop, i) => {
              out.push({
                rideId: id,
                legOrder: i,
                fromCity: r.from,
                toCity: stop,
                depart: r.depart,
                seatsLeft: r.seats,
                price: r.legs[stop],
                vehicle: r.vehicle,
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
        /* NO capacity mutation.
           This used to do RIDES[b.rideId].seats += b.seats, which permanently
           enlarged the van: two cancels turned a 4-seat Quantum into an 8-seat
           one, because the "freed" seat was added back to the vehicle's total
           instead of simply no longer being counted. Capacity is a constant from
           the ride definition; occupancy is derived from bookings, so cancelling
           frees the interval automatically. */
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


  /* ══ mid-route availability ═════════════════════════════════════════════
     Every boarding town on a ride, with how many seats are free from there and
     when the van is due. This is what makes a listed ride visible to someone in
     Komani before it has left East London. */
  if (req.method === "GET" && route.startsWith("/ride/") && route.endsWith("/legs")) {
    const rideId = route.slice(6, -5);
    const ride = RIDES[rideId];
    if (!ride) return json(res, 404, { error: "no such ride" });

    const db = load();
    const full = Object.assign({ id: rideId }, ride);
    const sched = scheduleFor(ride);

    const boarding = sched.slice(0, -1).map(function (stop, i) {
      const free = intervals.seatsFromTown(full, db.bookings, stop.town);
      return {
        town: stop.town,
        dueAt: stop.eta,
        reachable: stop.reachable,
        seatsFree: free,
        /* a rider can board here only while the van is still to come, and only
           if there is somewhere ahead to go */
        bookable: stop.reachable && free > 0 && i < sched.length - 1,
      };
    });

    return json(res, 200, {
      rideId: rideId,
      from: ride.from,
      to: ride.to,
      depart: ride.depart,
      vehicle: ride.vehicle,
      capacity: ride.seats,
      boarding: boarding,
      note: "dueAt is from the timetable, not live tracking",
    });
  }

  /* ══ join a ride mid-route ══════════════════════════════════════════════
     Creates a PENDING booking that HOLDS an interval. Holding on request is
     deliberate: without it, two riders can both request the last seat and the
     driver accepts both, and one of them is standing at a rank with no van. */
  if (req.method === "POST" && route === "/join/request") {
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });

    const ride = RIDES[b.rideId];
    if (!ride) return json(res, 404, { error: "no such ride" });

    const seatCount = Number(b.seats) || 1;
    const db = load();
    const full = Object.assign({ id: b.rideId }, ride);

    /* direction and capacity, on the legs this rider would actually occupy */
    const check = intervals.canBook(full, db.bookings, b.from, b.to, seatCount);
    if (!check.ok) {
      return json(res, 409, { error: check.error, detail: check.detail || null, seatsFree: check.seatsFree });
    }

    /* has the van already passed their town? */
    const sched = scheduleFor(ride);
    const boarding = sched.find(function (x) { return intervals.sameTown(x.town, b.from); });
    if (boarding && !boarding.reachable) {
      return json(res, 409, {
        error: "too_late",
        detail: "the " + ride.depart + " van is already due past " + boarding.town + " (" + boarding.eta + ")",
      });
    }

    const agreed = Number(b.agreedCents);
    if (!Number.isInteger(agreed) || agreed < 0) {
      return json(res, 400, { error: "agreedCents is required: the fare the rider and driver agreed" });
    }

    /* Authorise the deposit and fee NOW, not at acceptance. A request that costs
       nothing is a request that blocks a seat for free. On the mock provider this
       writes ledger rows; on Stripe it puts a real hold on a card. */
    const bookingId = crypto.randomUUID();
    let depositAuth, feeAuth;
    try {
      depositAuth = await payments.provider().authorise({
        bookingId,
        cents: payments.DEPOSIT_CENTS,
        description: "GOGO no-show deposit, " + b.from + " to " + b.to,
      });
      feeAuth = await payments.provider().authorise({
        bookingId,
        cents: payments.FEE_CENTS,
        description: "GOGO booking fee, " + b.from + " to " + b.to,
      });
    } catch (e) {
      /* a failed authorisation must not create a seat hold */
      console.error("payment authorise failed:", e && e.message);
      return json(res, 402, {
        error: "payment_failed",
        detail: "We could not hold the deposit. Try again, or pay cash at boarding.",
      });
    }

    const join = {
      id: bookingId,
      at: new Date().toISOString(),
      /* PENDING until the driver accepts. This is the only unconfirmed state. */
      status: "pending",
      depositReference: depositAuth.reference,
      feeReference: feeAuth.reference,
      paymentProvider: payments.provider().name,
      paymentIsMock: payments.provider().isMock,
      kind: "passenger",
      midRoute: true,
      rideId: b.rideId,
      seats: seatCount,
      city: String(b.from || "").slice(0, 80),
      stop: String(b.to || "").slice(0, 80),
      boardIdx: check.boardIdx,
      alightIdx: check.alightIdx,
      /* the negotiated fare, kept apart from any server-priced total */
      fareSource: "negotiated",
      agreedCents: agreed,
      /* GOGO's flat fee, ADDED on top, never deducted from the driver's fare */
      bookingFeeCents: 999,
      depositCents: payments.DEPOSIT_CENTS,
      depositState: "held",
      feeState: "held",
      boardPoint: String(b.boardPoint || "").slice(0, 200),
      riderPhone: String(b.phone || "").slice(0, 30),
      riderName: String(b.name || "").slice(0, 80),
      paidAtBoarding: true,
    };

    db.bookings.push(join);
    db.audit.push({ at: join.at, kind: "JOIN_REQUESTED", id: join.id, rideId: b.rideId, agreed: agreed });
    save(db);

    return json(res, 201, {
      request: {
        id: join.id,
        status: join.status,
        rideId: join.rideId,
        from: join.city,
        to: join.stop,
        seats: join.seats,
        agreedCents: join.agreedCents,
        bookingFeeCents: join.bookingFeeCents,
        depositCents: join.depositCents,
        dueAt: boarding ? boarding.eta : null,
      },
      payment: payments.honesty(),
      note: "pending until the driver accepts. The fare is paid to the driver at boarding.",
    });
  }

  /* ══ driver decision ════════════════════════════════════════════════════
     The only path that confirms a join. A general "yes I will stop" in chat does
     NOT confirm, because it is not bound to a seat. */
  if (req.method === "POST" && route === "/join/decide") {
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });

    const db = load();
    const j = (db.bookings || []).find(function (x) { return x.id === b.id && x.midRoute; });
    if (!j) return json(res, 404, { error: "no such request" });
    if (j.status !== "pending") {
      return json(res, 409, { error: "already " + j.status });
    }

    if (b.action === "accept") {
      /* re-check at the moment of acceptance: someone else may have taken the
         interval while this request sat in the queue */
      const ride = RIDES[j.rideId];
      const full = Object.assign({ id: j.rideId }, ride || {});
      const still = intervals.canBook(full, db.bookings, j.city, j.stop, j.seats,
        { ignoreBookingId: j.id });
      /* canBook has no ignore option, so recompute without this booking */
      const others = db.bookings.filter(function (x) { return x.id !== j.id; });
      const recheck = intervals.canBook(full, others, j.city, j.stop, j.seats);
      if (!recheck.ok) {
        j.status = "declined";
        j.declinedAt = new Date().toISOString();
        j.declineReason = "seat_taken";
        j.depositState = "refunded";
        save(db);
        return json(res, 409, { error: "seat no longer free", detail: recheck.detail });
      }

      j.status = "confirmed";
      j.acceptedAt = new Date().toISOString();
      /* The holds STAY held. They are only captured when the rider actually
         boards, and released if either side backs out. */
      db.audit.push({ at: j.acceptedAt, kind: "JOIN_ACCEPTED", id: j.id });
      save(db);
      return json(res, 200, {
        request: { id: j.id, status: j.status },
        riderPhone: j.riderPhone,
        note: "confirmed. Fare is collected at boarding.",
      });
    }

    if (b.action === "decline") {
      j.status = "declined";
      j.declinedAt = new Date().toISOString();
      j.declineReason = String(b.reason || "driver_declined").slice(0, 80);
      /* a rider the driver turned away pays nothing, and the seat frees */
      await payments.settle(j, "DRIVER_DECLINED");
      db.audit.push({ at: j.declinedAt, kind: "JOIN_DECLINED", id: j.id });
      save(db);
      return json(res, 200, { request: { id: j.id, status: j.status }, payment: payments.honesty() });
    }

    return json(res, 400, { error: "action must be accept or decline" });
  }

  /* ══ the driver's queue ═════════════════════════════════════════════════ */
  if (req.method === "GET" && route === "/join/requests") {
    const rideId = url.searchParams.get("rideId");
    const db = load();
    const rows = (db.bookings || []).filter(function (x) {
      return x.midRoute && (!rideId || x.rideId === rideId);
    }).map(function (x) {
      return {
        id: x.id,
        status: x.status,
        rideId: x.rideId,
        from: x.city,
        to: x.stop,
        seats: x.seats,
        agreedCents: x.agreedCents,
        boardPoint: x.boardPoint,
        /* the driver may need to call: "I am at the Spar, where are you" */
        riderPhone: x.status === "pending" || x.status === "confirmed" ? x.riderPhone : null,
        riderName: x.riderName,
        requestedAt: x.at,
      };
    });
    return json(res, 200, { requests: rows });
  }


  /* ══ step 6: "not here, move on" ════════════════════════════════════════
     The driver is at the boarding point and the rider is not. One tap, and it
     has to be as easy as accepting or drivers will stop using the feature.

     This is the ONLY endpoint that keeps the rider's money, so it is separate
     from decline and writes its own audit row. A no-show means the driver lost a
     seat he could have sold, which is exactly what the deposit is for. */
  if (req.method === "POST" && route === "/join/no-show") {
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });

    const db = load();
    const j = (db.bookings || []).find(function (x) { return x.id === b.id && x.midRoute; });
    if (!j) return json(res, 404, { error: "no such request" });
    if (j.status === "no_show") {
      return json(res, 200, { request: { id: j.id, status: j.status }, alreadyMarked: true });
    }
    if (j.status !== "confirmed") {
      return json(res, 409, { error: "only a confirmed booking can be a no-show, this is " + j.status });
    }

    j.status = "no_show";
    j.noShowAt = new Date().toISOString();
    j.noShowBy = String(b.by || "driver").slice(0, 20);

    /* deposit forfeited, fee kept. The seat frees immediately because the status
       is no longer counted by the interval engine. */
    const settled = await payments.settle(j, "RIDER_NO_SHOW", "driver marked not present");

    db.audit.push({
      at: j.noShowAt, kind: "JOIN_NO_SHOW", id: j.id,
      deposit: j.depositState, fee: j.feeState,
    });
    save(db);

    return json(res, 200, {
      request: { id: j.id, status: j.status },
      money: { deposit: j.depositState, fee: j.feeState },
      seatFreed: true,
      payment: payments.honesty(),
      note: settled.isMock
        ? "the deposit was recorded as forfeited; no card was charged because no provider is connected"
        : "the deposit has been taken",
    });
  }

  /* ══ the rider got on ═══════════════════════════════════════════════════
     Captures the deposit and the fee. The agreed fare is paid to the driver
     directly, and never passes through GOGO. */
  if (req.method === "POST" && route === "/join/board") {
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });

    const db = load();
    const j = (db.bookings || []).find(function (x) { return x.id === b.id && x.midRoute; });
    if (!j) return json(res, 404, { error: "no such request" });
    if (j.status === "boarded") {
      return json(res, 200, { request: { id: j.id, status: j.status }, alreadyBoarded: true });
    }
    if (j.status !== "confirmed") {
      return json(res, 409, { error: "only a confirmed booking can board, this is " + j.status });
    }

    j.status = "boarded";
    j.boardedAt = new Date().toISOString();
    await payments.settle(j, "BOARDED");
    db.audit.push({ at: j.boardedAt, kind: "JOIN_BOARDED", id: j.id });
    save(db);

    return json(res, 200, {
      request: { id: j.id, status: j.status },
      money: { deposit: j.depositState, fee: j.feeState },
      payment: payments.honesty(),
    });
  }

  /* ══ rider changes their mind ═══════════════════════════════════════════
     Before acceptance: everything back. After acceptance: deposit back, fee kept,
     because the driver has already committed a seat. */
  if (req.method === "POST" && route === "/join/cancel") {
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });

    const db = load();
    const j = (db.bookings || []).find(function (x) { return x.id === b.id && x.midRoute; });
    if (!j) return json(res, 404, { error: "no such request" });
    if (["cancelled", "declined", "no_show"].includes(j.status)) {
      return json(res, 200, { request: { id: j.id, status: j.status }, alreadyClosed: true });
    }

    const wasAccepted = j.status === "confirmed" || j.status === "boarded";
    j.status = "cancelled";
    j.cancelledAt = new Date().toISOString();
    j.cancelledBy = "rider";
    const outcome = wasAccepted ? "RIDER_CANCELLED_LATE" : "RIDER_CANCELLED_EARLY";
    await payments.settle(j, outcome, "rider cancelled");
    db.audit.push({ at: j.cancelledAt, kind: "JOIN_CANCELLED", id: j.id, outcome: outcome });
    save(db);

    return json(res, 200, {
      request: { id: j.id, status: j.status },
      money: { deposit: j.depositState, fee: j.feeState },
      payment: payments.honesty(),
    });
  }

  /* ══ what may the UI claim about money? ═════════════════════════════════ */
  if (req.method === "GET" && route === "/payments/status") {
    return json(res, 200, payments.honesty());
  }


  /* ══ AUTHENTICATION ═════════════════════════════════════════════════════
     Phone number is the identity. Signup and login are one flow: request a
     code, verify it, and the account exists. There is no password anywhere.

     The caller is ALWAYS derived from a token. No route below trusts a user id,
     phone number or "signed in" flag supplied in a request body. */

  /* What the page is allowed to say about how codes are delivered. While
     Twilio is not configured this reports devMode: true, and the UI must warn
     that codes are on screen rather than pretend an SMS was sent. */
  if (req.method === "GET" && route === "/auth/config") {
    return json(res, 200, auth.config());
  }

  /* Step 1 — ask for a code. Creates no account: a mistyped number must not
     leave an orphan record behind. */
  if (req.method === "POST" && route === "/auth/request-otp") {
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });

    const r = await auth.requestCode(b.phone);
    if (!r.ok) {
      /* 429 for rate limits, 400 for a bad number. The client shows r.message
         as-is, because it was written for a human. */
      const status = (r.code === "cooldown" || r.code === "hourly_limit") ? 429 : 400;
      return json(res, status, r);
    }
    return json(res, 200, r);
  }

  /* Step 2 — check the code and issue a session. On success the code is
     destroyed, so it cannot be replayed. */
  if (req.method === "POST" && route === "/auth/verify-otp") {
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });

    const r = auth.verifyCode(b.phone, b.code);
    if (!r.ok) {
      const status = r.code === "too_many_attempts" ? 429 : 401;
      return json(res, status, r);
    }

    /* httpOnly + SameSite=Lax: the cookie rides on top-level navigations, so a
       page reload stays signed in, and JavaScript cannot read it. Secure is
       omitted because this origin is served over Cloudflare Flexible (the app
       sees plain HTTP); adding it here would silently stop the cookie working. */
    res.setHeader(
      "Set-Cookie",
      "gogo_session=" + encodeURIComponent(r.token) +
      "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + Math.floor((r.expiresAt - Date.now()) / 1000)
    );

    return json(res, 200, {
      ok: true,
      token: r.token,
      created: r.created,
      needsProfile: r.needsProfile,
      user: r.user,
    });
  }

  /* Who am I? Reads the token, never a body. Returns 401 rather than an empty
     object so the client can tell "signed out" from "request failed". */
  if (req.method === "GET" && route === "/auth/me") {
    const tok = bearer(req) || cookieSession(req);
    const u = auth.userFromToken(tok);
    if (!u) return json(res, 401, { ok: false, error: "not_signed_in" });
    return json(res, 200, { ok: true, user: auth.publicUser(u) });
  }

  /* Complete the profile. This is what turns a fresh phone verification into
     an account the app can use, and it is required before booking. */
  if (req.method === "POST" && route === "/auth/profile") {
    const tok = bearer(req) || cookieSession(req);
    const b = await body(req);
    if (!b) return json(res, 400, { error: "bad json" });

    const r = auth.setProfile(tok, { name: b.name, home: b.home });
    if (!r.ok) {
      const status = r.code === "not_signed_in" ? 401 : 400;
      return json(res, status, r);
    }
    return json(res, 200, { ok: true, user: r.user });
  }

  /* Sign out: clear the cookie. The token itself stays valid until it expires,
     which is honest — the server holds no session table to kill. Rotating the
     secret invalidates every token at once if that is ever needed. */
  if (req.method === "POST" && route === "/auth/logout") {
    res.setHeader("Set-Cookie", "gogo_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "no such endpoint" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("GOGO booking server on http://127.0.0.1:" + PORT);
});
