/* =========================================================================
   GOGO — API SERVER

   The authority for everything that must not be trusted to the browser:
   accounts, sessions, rides, fares, bookings, payments, chat and reports.

   Two rules run through the whole file:

     1. The client never supplies a price. It supplies a ride id and a stop,
        and the fare is looked up here.
     2. The client never supplies an identity. It supplies a session token,
        and the user is looked up here.

   Everything else follows from those.
   ========================================================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const auth = require("./auth");

const PORT = Number(process.env.GOGO_PORT || 3051);

/* ── database ──────────────────────────────────────────────────────────── */
/* The Windows->WSL path drops idle TCP connections (the port forward has a
   short idle timeout), which surfaces as ECONNRESET on a pooled client that
   looked healthy. Three settings keep the pool honest:
     - allowExitOnIdle so the process can shut down cleanly
     - a short idleTimeoutMillis, so we retire connections before the forward
       does and never hand out a socket that is already dead
     - keepAlive, which makes the sockets send periodic probes and keeps the
       forward's mapping alive.
   Without these the pool hands out dead clients and every request after a
   quiet spell fails once before recovering. */
const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  user: process.env.PGUSER || "gogo",
  password: process.env.PGPASSWORD || "gogo",
  database: process.env.PGDATABASE || "gogo",
  max: 10,
  idleTimeoutMillis: 4000,
  connectionTimeoutMillis: 8000,
  allowExitOnIdle: true,
  keepAlive: true,
  keepAliveInitialDelayMillis: 2000,
});

pool.on("error", (e) => console.error("[db] idle client error:", e.message));

/* A one-shot retry for a connection that died between checkout and use. The
   reset is transient and the second attempt opens a fresh socket, but a
   genuine SQL error is not retried — only connection loss is. */
const q = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (e) {
    const transient = /ECONNRESET|ECONNREFUSED|terminating connection|Connection terminated/i.test(e.message);
    if (!transient) throw e;
    await new Promise((r) => setTimeout(r, 150));
    return pool.query(text, params);
  }
};

/* ── fees — the authoritative numbers ──────────────────────────────────── */
/* The client mirrors these for display. If they ever drift, this wins and the
   client's price is refused, which shows up in the audit table immediately. */
const FEES = {
  pickupCents: 1999,
  platformCents: 999,
  parcelBookingCents: 1999,
  version: 1,
};

/* ── http helpers ──────────────────────────────────────────────────────── */
const CORS = {
  "Access-Control-Allow-Origin": "https://cleanic.co.za",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

function send(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...CORS,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    let tooBig = false;
    req.on("data", (c) => {
      b += c;
      if (b.length > 128 * 1024) { tooBig = true; req.destroy(); }
    });
    req.on("end", () => {
      if (tooBig) return resolve(null);
      try { resolve(JSON.parse(b || "{}")); } catch (e) { resolve(null); }
    });
  });
}

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket.remoteAddress || "";
}

async function audit(kind, userId, detail, req) {
  try {
    await q(
      "INSERT INTO audit (kind, user_id, detail, ip) VALUES ($1,$2,$3,$4)",
      [kind, userId || null, detail || {}, clientIp(req)]
    );
  } catch (e) { console.error("[audit] failed:", e.message); }
}

/* ── sessions ──────────────────────────────────────────────────────────── */
/* Returns the user row, or null. Never throws for a bad token — an invalid
   session is a normal outcome, not an error. */
async function userFrom(req) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!token || token.length < 20) return null;

  const { rows } = await q(
    `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()`,
    [auth.tokenHash(token)]
  );
  return rows[0] || null;
}

async function requireUser(req, res) {
  const u = await userFrom(req);
  if (!u) { send(res, 401, { error: "sign in required" }); return null; }
  return u;
}

async function issueSession(userId) {
  const token = auth.newToken();
  await q(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1,$2, now() + ($3 || ' days')::interval)`,
    [userId, auth.tokenHash(token), auth.SESSION_DAYS]
  );
  return token;
}

/* ── pricing — the only place a rand is decided ────────────────────────── */
async function priceSeat(rideId, stop, seats) {
  const n = Number(seats);
  /* Refuse rather than clamp. A silent clamp once booked 3 seats when 99 were
     asked for, charging for something nobody requested. */
  if (!Number.isInteger(n) || n < 1 || n > 3) return { error: "seats must be 1 to 3" };

  const { rows } = await q(
    `SELECT r.id, r.seats_total, l.fare_cents
       FROM rides r JOIN ride_legs l ON l.ride_id = r.id
      WHERE r.id = $1 AND l.stop = $2 AND r.status = 'open'`,
    [rideId, stop]
  );
  if (!rows.length) return { error: "unknown ride or stop" };
  const ride = rows[0];

  const { rows: takenRows } = await q(
    `SELECT COALESCE(SUM(seat_count),0)::int AS taken FROM bookings
      WHERE ride_id = $1 AND kind = 'passenger'
        AND status IN ('pending','accepted','completed')`,
    [rideId]
  );
  const taken = takenRows[0].taken;
  if (taken + n > ride.seats_total) return { error: "not enough seats left" };

  const fare = ride.fare_cents;
  const pickup = FEES.pickupCents * n;
  const platform = FEES.platformCents * n;
  const total = fare * n + pickup + platform;

  return {
    ok: true, currency: "ZAR", seats: n, stop, rideId,
    fareCents: fare, pickupCents: pickup, platformCents: platform,
    rows: [
      { label: n > 1 ? `Card fare × ${n} seats` : "Card fare", cents: fare * n },
      { label: n > 1 ? `Pickup fee × ${n}` : "Pickup fee", cents: pickup },
      { label: n > 1 ? `Platform fee × ${n}` : "Platform fee", cents: platform },
    ],
    totalCents: total,
    feeVersion: FEES.version,
  };
}

async function priceParcel(rideId, kg) {
  const weight = Number(kg);
  if (!(weight > 0) || weight > 50) return { error: "weight must be 0 to 50 kg" };
  const { rows } = await q("SELECT id FROM rides WHERE id = $1 AND status = 'open'", [rideId]);
  if (!rows.length) return { error: "unknown ride" };
  const booking = FEES.parcelBookingCents;
  return {
    ok: true, currency: "ZAR", kg: weight, rideId,
    rowCents: booking,
    rows: [{ label: "Parcel booking fee", cents: booking }],
    totalCents: booking,
    feeVersion: FEES.version,
  };
}

/* ── routes ────────────────────────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const route = url.pathname.replace(/^\/gogo\/api/, "");

  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

  try {
    /* ── health ── */
    if (route === "/health") {
      const { rows } = await q("SELECT count(*)::int AS users FROM users");
      return send(res, 200, { ok: true, db: true, users: rows[0].users, feeVersion: FEES.version });
    }

    /* ── signup ──
       The client sends a derived hash, never the password. The salt is theirs
       so login can re-derive identically. */
    if (req.method === "POST" && route === "/auth/signup") {
      const b = await readBody(req);
      const bad = auth.checkSignup(b);
      if (bad) return send(res, 400, { error: bad });

      const email = String(b.email).trim().toLowerCase();
      const salt = String(b.salt);
      const serverHashed = auth.serverHash(b.clientHash, salt);

      const { rows: exists } = await q("SELECT id FROM users WHERE email = $1", [email]);
      if (exists.length) return send(res, 409, { error: "that email is already registered" });

      const { rows } = await q(
        `INSERT INTO users (email, name, phone, pw_salt, pw_hash, is_driver)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, email, name, phone, is_driver, created_at`,
        [
          email, String(b.name).trim().slice(0, 80),
          String(b.phone || "").replace(/[^\d+]/g, "").slice(0, 20) || null,
          salt, serverHashed, !!b.isDriver,
        ]
      );
      const u = rows[0];
      const token = await issueSession(u.id);
      await audit("SIGNUP", u.id, { driver: u.is_driver }, req);
      return send(res, 201, { user: u, token });
    }

    /* ── the salt for an email, so the client can derive before sending ──
       This does reveal whether an email is registered. That is the standard
       trade-off; a signup attempt reveals it anyway. */
    if (req.method === "POST" && route === "/auth/salt") {
      const b = await readBody(req);
      const email = String((b && b.email) || "").trim().toLowerCase();
      if (!auth.goodEmail(email)) return send(res, 400, { error: "bad email" });
      const { rows } = await q("SELECT pw_salt FROM users WHERE email = $1", [email]);
      /* Always return a salt-shaped value so a missing account is not
         distinguishable by response shape, only by the later failure. */
      return send(res, 200, { salt: rows.length ? rows[0].pw_salt : auth.newSalt() });
    }

    /* ── login ── */
    if (req.method === "POST" && route === "/auth/login") {
      const b = await readBody(req);
      if (!b || !auth.goodEmail(b.email) || !b.clientHash) {
        return send(res, 400, { error: "email and password are required" });
      }
      const email = String(b.email).trim().toLowerCase();
      const { rows } = await q("SELECT * FROM users WHERE email = $1", [email]);
      /* Same message either way: never confirm which half was wrong. */
      const fail = { error: "that email or password is not right" };
      if (!rows.length) return send(res, 401, fail);

      const u = rows[0];
      if (!auth.verify(b.clientHash, u.pw_salt, u.pw_hash)) {
        await audit("LOGIN_FAIL", u.id, { email }, req);
        return send(res, 401, fail);
      }
      const token = await issueSession(u.id);
      await q("UPDATE users SET last_seen_at = now() WHERE id = $1", [u.id]);
      await audit("LOGIN", u.id, {}, req);
      return send(res, 200, {
        user: { id: u.id, email: u.email, name: u.name, phone: u.phone, is_driver: u.is_driver },
        token,
      });
    }

    if (req.method === "POST" && route === "/auth/logout") {
      const hdr = req.headers.authorization || "";
      const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
      if (token) {
        await q("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1",
                [auth.tokenHash(token)]);
      }
      return send(res, 200, { ok: true });
    }

    /* ── who am I ── */
    if (req.method === "GET" && route === "/auth/me") {
      const u = await requireUser(req, res);
      if (!u) return;
      return send(res, 200, {
        user: { id: u.id, email: u.email, name: u.name, phone: u.phone,
                is_driver: u.is_driver, verified: u.verified },
      });
    }

    /* ── rides: public catalogue, with fares so the client can draw them ── */
    if (req.method === "GET" && route === "/rides") {
      const { rows } = await q(
        `SELECT r.id, r.origin, r.destination, r.depart_label, r.vehicle,
                r.plate, r.colour, r.seats_total, r.is_sample, r.status,
                r.driver_name,
                COALESCE(json_object_agg(l.stop, l.fare_cents)
                         FILTER (WHERE l.stop IS NOT NULL), '{}') AS legs,
                COALESCE((SELECT SUM(b.seat_count) FROM bookings b
                           WHERE b.ride_id = r.id AND b.kind = 'passenger'
                             AND b.status IN ('pending','accepted','completed')),0)::int AS taken
           FROM rides r LEFT JOIN ride_legs l ON l.ride_id = r.id
          WHERE r.status IN ('open','full')
          GROUP BY r.id
          ORDER BY r.depart_label NULLS LAST, r.id`
      );
      return send(res, 200, {
        rides: rows.map((r) => ({
          id: r.id, from: r.origin, to: r.destination,
          depart: r.depart_label, vehicle: r.vehicle,
          plate: r.plate, colour: r.colour,
          seats: r.seats_total, taken: r.taken, left: r.seats_total - r.taken,
          driver: r.driver_name, legs: r.legs, sample: r.is_sample, status: r.status,
        })),
        feeVersion: FEES.version,
      });
    }

    /* ── a driver publishes a ride ── */
    if (req.method === "POST" && route === "/rides") {
      const u = await requireUser(req, res);
      if (!u) return;
      const b = await readBody(req);
      if (!b || !b.from || !b.to) return send(res, 400, { error: "from and to are required" });
      const seats = Number(b.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
        return send(res, 400, { error: "seats must be 1 to 8" });
      }
      const legs = Array.isArray(b.legs) ? b.legs : [];
      if (!legs.length) return send(res, 400, { error: "at least one stop and fare is required" });
      for (const l of legs) {
        if (!l || !l.stop || !Number.isInteger(Number(l.fareCents)) || Number(l.fareCents) < 0) {
          return send(res, 400, { error: "every stop needs a name and a whole-rand fare in cents" });
        }
      }

      const id = "r" + crypto.randomBytes(6).toString("hex");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO rides (id, driver_id, driver_name, origin, destination,
                              depart_label, vehicle, plate, colour, seats_total, is_sample)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE)`,
          [id, u.id, u.name || "Verified driver", String(b.from).slice(0, 80),
           String(b.to).slice(0, 80), String(b.departLabel || "").slice(0, 20),
           String(b.vehicle || "").slice(0, 60), String(b.plate || "").slice(0, 20),
           String(b.colour || "").slice(0, 30), seats]
        );
        for (let i = 0; i < legs.length; i++) {
          await client.query(
            "INSERT INTO ride_legs (ride_id, stop, fare_cents, position) VALUES ($1,$2,$3,$4)",
            [id, String(legs[i].stop).slice(0, 80), Number(legs[i].fareCents), i]
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      await q("UPDATE users SET is_driver = TRUE WHERE id = $1", [u.id]);
      await audit("RIDE_CREATED", u.id, { rideId: id }, req);
      return send(res, 201, { rideId: id });
    }

    /* ── quote: the server prices, the client displays ── */
    if (req.method === "POST" && route === "/quote") {
      const b = await readBody(req);
      if (!b) return send(res, 400, { error: "bad json" });
      const p = b.kind === "parcel"
        ? await priceParcel(b.rideId, b.kg)
        : await priceSeat(b.rideId, b.stop, b.seats);
      if (!p.ok) return send(res, 400, { error: p.error });
      return send(res, 200, p);
    }

    /* ── book. The gate. ──
       The client may send any total it likes; the price is recomputed here and
       a mismatch is refused and recorded. */
    if (req.method === "POST" && route === "/book") {
      const u = await requireUser(req, res);
      if (!u) return;
      const b = await readBody(req);
      if (!b) return send(res, 400, { error: "bad json" });

      const priced = b.kind === "parcel"
        ? await priceParcel(b.rideId, b.kg)
        : await priceSeat(b.rideId, b.stop, b.seats);
      if (!priced.ok) return send(res, 400, { error: priced.error });

      if (b.clientTotalCents !== undefined && b.clientTotalCents !== priced.totalCents) {
        await audit("PRICE_MISMATCH", u.id,
          { rideId: b.rideId, claimed: b.clientTotalCents, actual: priced.totalCents }, req);
        return send(res, 409, { error: "price mismatch", serverTotalCents: priced.totalCents });
      }

      const client = await pool.connect();
      let booking;
      try {
        await client.query("BEGIN");
        /* lock the ride so two riders cannot grab the last seat at once */
        await client.query("SELECT id FROM rides WHERE id = $1 FOR UPDATE", [b.rideId]);
        const { rows: takenRows } = await client.query(
          `SELECT COALESCE(SUM(seat_count),0)::int AS taken FROM bookings
            WHERE ride_id = $1 AND kind = 'passenger'
              AND status IN ('pending','accepted','completed')`,
          [b.rideId]
        );
        if (b.kind !== "parcel" && takenRows[0].taken + priced.seats > (await client.query(
          "SELECT seats_total FROM rides WHERE id = $1", [b.rideId])).rows[0].seats_total) {
          await client.query("ROLLBACK");
          return send(res, 409, { error: "not enough seats left" });
        }

        const { rows } = await client.query(
          `INSERT INTO bookings (ride_id, user_id, kind, seat_count, stop, kg,
                                 pickup, suburb, city, fare_cents, pickup_cents,
                                 platform_cents, total_cents, fee_version, pay_method)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING *`,
          [b.rideId, u.id, b.kind === "parcel" ? "parcel" : "passenger",
           priced.seats || 0, b.stop || null, priced.kg || null,
           String(b.pickup || "").slice(0, 200), String(b.suburb || "").slice(0, 80),
           String(b.city || "").slice(0, 80),
           priced.fareCents || 0, priced.pickupCents || 0, priced.platformCents || 0,
           priced.totalCents, priced.feeVersion,
           b.payMethod === "cash" ? "cash" : "card"]
        );
        await client.query("COMMIT");
        booking = rows[0];
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      await audit("BOOKED", u.id, { booking: booking.id, total: booking.total_cents }, req);
      return send(res, 201, {
        booking: {
          id: booking.id, at: booking.created_at, status: booking.status,
          rideId: booking.ride_id, kind: booking.kind, seats: booking.seat_count,
          stop: booking.stop, kg: booking.kg ? Number(booking.kg) : null,
          pickup: booking.pickup, suburb: booking.suburb, city: booking.city,
          totalCents: booking.total_cents, payMethod: booking.pay_method,
          feeVersion: booking.fee_version,
          rows: priced.rows,
        },
        /* the plate is shared only once a seat is confirmed — so it is NOT
           sent here, on a pending booking */
      });
    }

    /* ── my bookings ── */
    if (req.method === "GET" && route === "/bookings") {
      const u = await requireUser(req, res);
      if (!u) return;
      const { rows } = await q(
        `SELECT b.*, r.origin, r.destination, r.depart_label, r.vehicle,
                r.plate, r.colour, r.driver_name,
                u2.name AS driver_real_name
           FROM bookings b
           JOIN rides r ON r.id = b.ride_id
           LEFT JOIN users u2 ON u2.id = r.driver_id
          WHERE b.user_id = $1
          ORDER BY b.created_at DESC LIMIT 100`,
        [u.id]
      );
      return send(res, 200, {
        bookings: rows.map((b) => ({
          id: b.id, at: b.created_at, status: b.status,
          rideId: b.ride_id, kind: b.kind, seats: b.seat_count, stop: b.stop,
          pickup: b.pickup, suburb: b.suburb, city: b.city,
          totalCents: b.total_cents, payMethod: b.pay_method,
          from: b.origin, to: b.destination, depart: b.depart_label,
          vehicle: b.vehicle, driver: b.driver_name,
          /* plate and colour released only after the driver accepts */
          plate: (b.status === "accepted" || b.status === "completed") ? b.plate : null,
          colour: (b.status === "accepted" || b.status === "completed") ? b.colour : null,
        })),
      });
    }

    /* ── chat ── */
    if (req.method === "GET" && route === "/messages") {
      const u = await requireUser(req, res);
      if (!u) return;
      const rideId = url.searchParams.get("rideId");
      if (!rideId) return send(res, 400, { error: "rideId is required" });
      /* only people on this ride may read it */
      const { rows: onRide } = await q(
        `SELECT 1 FROM bookings WHERE ride_id = $1 AND user_id = $2
         UNION SELECT 1 FROM rides WHERE id = $1 AND driver_id = $2 LIMIT 1`,
        [rideId, u.id]
      );
      if (!onRide.length) return send(res, 403, { error: "not your ride" });
      const { rows } = await q(
        `SELECT m.id, m.body, m.is_system, m.created_at, u.name AS sender
           FROM messages m LEFT JOIN users u ON u.id = m.user_id
          WHERE m.ride_id = $1 ORDER BY m.created_at ASC LIMIT 300`,
        [rideId]
      );
      return send(res, 200, { messages: rows });
    }

    if (req.method === "POST" && route === "/messages") {
      const u = await requireUser(req, res);
      if (!u) return;
      const b = await readBody(req);
      if (!b || !b.rideId || !String(b.body || "").trim()) {
        return send(res, 400, { error: "rideId and body are required" });
      }
      const { rows: onRide } = await q(
        `SELECT 1 FROM bookings WHERE ride_id = $1 AND user_id = $2
         UNION SELECT 1 FROM rides WHERE id = $1 AND driver_id = $2 LIMIT 1`,
        [b.rideId, u.id]
      );
      if (!onRide.length) return send(res, 403, { error: "not your ride" });
      const { rows } = await q(
        `INSERT INTO messages (ride_id, user_id, body) VALUES ($1,$2,$3)
         RETURNING id, body, is_system, created_at`,
        [b.rideId, u.id, String(b.body).slice(0, 2000)]
      );
      return send(res, 201, { message: { ...rows[0], sender: u.name } });
    }

    /* ── safety reports — write only, from the client's side ── */
    if (req.method === "POST" && route === "/reports") {
      const u = await requireUser(req, res);
      if (!u) return;
      const b = await readBody(req);
      if (!b || !String(b.reason || "").trim()) {
        return send(res, 400, { error: "a reason is required" });
      }
      const { rows } = await q(
        `INSERT INTO reports (ride_id, reporter, reason, detail)
         VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
        [b.rideId || null, u.id, String(b.reason).slice(0, 100),
         String(b.detail || "").slice(0, 2000)]
      );
      await audit("REPORT", u.id, { rideId: b.rideId, reason: b.reason }, req);
      return send(res, 201, { report: rows[0] });
    }

    return send(res, 404, { error: "no such endpoint" });
  } catch (e) {
    console.error("[api]", e.message);
    return send(res, 500, { error: "server error" });
  }
});

/* ── boot ──────────────────────────────────────────────────────────────── */
async function seed() {
  /* The sample rides. They exist so the app has something to show before real
     drivers sign up, and are flagged is_sample so they can be filtered out
     once real inventory arrives. */
  const SAMPLES = [
    { id: "g1", from: "East London", to: "Mthatha", depart: "06:30",
      vehicle: "Toyota Quantum", plate: "EL 123 GP", colour: "White",
      seats: 4, legs: [["Komani", 12000], ["Butterworth", 17000],
                       ["Idutywa", 19500], ["Mthatha", 24000]] },
    { id: "g2", from: "East London", to: "Mthatha", depart: "08:00",
      vehicle: "Toyota Quantum", plate: "EL 456 GP", colour: "Silver",
      seats: 3, legs: [["Cala", 13000], ["Ngcobo", 16500], ["Mthatha", 18500]] },
  ];

  for (const s of SAMPLES) {
    const { rows } = await q("SELECT id FROM rides WHERE id = $1", [s.id]);
    if (rows.length) continue;
    await q(
      `INSERT INTO rides (id, driver_name, origin, destination, depart_label,
                          vehicle, plate, colour, seats_total, is_sample)
       VALUES ($1,'Verified driver',$2,$3,$4,$5,$6,$7,$8,TRUE)`,
      [s.id, s.from, s.to, s.depart, s.vehicle, s.plate, s.colour, s.seats]
    );
    for (let i = 0; i < s.legs.length; i++) {
      await q("INSERT INTO ride_legs (ride_id, stop, fare_cents, position) VALUES ($1,$2,$3,$4)",
              [s.id, s.legs[i][0], s.legs[i][1], i]);
    }
  }
  console.log("[seed] sample rides present");
}

server.listen(PORT, "127.0.0.1", async () => {
  console.log("GOGO API on http://127.0.0.1:" + PORT);
  try {
    await q("SELECT 1");
    console.log("[db] connected");
    await seed();
  } catch (e) {
    console.error("[db] NOT READY:", e.message);
    console.error("     run: db/setup.sh");
  }
});
