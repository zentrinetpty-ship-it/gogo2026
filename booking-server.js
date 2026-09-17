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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const route = url.pathname.replace(/^\/gogo\/api/, "");

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
  if (req.method === "GET" && route === "/bookings") {
    const db = load();
    return json(res, 200, { bookings: db.bookings });
  }

  return json(res, 404, { error: "no such endpoint" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("GOGO booking server on http://127.0.0.1:" + PORT);
});
