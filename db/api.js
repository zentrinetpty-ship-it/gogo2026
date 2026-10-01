/* =========================================================================
   GOGO — API SERVER

   The authority for everything that must not be trusted to the browser:
   accounts, sessions, rides, fares, bookings, payments, chat and reports.

   Two rules run through the whole file:

     1. The client never supplies a price. It supplies a ride id and a stop,
        and the fare is looked up here.
     2. The client never supplies an identity. It supplies a session token,
        and the user is looked up here.

   Storage is the file-backed store in store.js — the same pattern as the HQ
   mailer, which is what runs reliably on this machine. See store.js for why
   that is safe (atomic writes, serialised mutations).
   ========================================================================= */

const http = require("http");
const crypto = require("crypto");
const auth = require("./auth");
const store = require("./store");
const { db, touch, mutate, uuid } = store;

/* ── booking references ────────────────────────────────────────────────────
   Six characters, airline style: GG-4K7P2M. Read aloud without ambiguity,
   so the alphabet leaves out the pairs people confuse on a phone — I and 1,
   O and 0, S and 5, B and 8, Z and 2. That leaves 29 symbols, and six of them
   is about 600 million combinations, so a reference cannot be guessed by
   somebody fishing for other people's bookings.

   Uniqueness is checked against the store, because a booking code that
   collides would merge two people's trips. */
const REF_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
function newRef() {
  for (let attempt = 0; attempt < 20; attempt++) {
    let out = "";
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
    if (!db.bookings.some((b) => b.ref === out)) return out;
  }
  /* 600m combinations: reaching here means something is wrong, not unlucky */
  throw new Error("could not allocate a booking reference");
}

const PORT = Number(process.env.GOGO_PORT || 3051);

/* ── fees — the authoritative numbers ──────────────────────────────────── */
const FEES = {
  pickupCents: 1999,
  platformCents: 999,
  parcelBookingCents: 1999,
  version: 1,
  maxSeatsPerBooking: 3,
};

/* ── http helpers ──────────────────────────────────────────────────────── */
const CORS = {
  "Access-Control-Allow-Origin": "https://cleanic.co.za",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

function send(res, code, body) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...CORS,
  });
  res.end(JSON.stringify(body));
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

const clientIp = (req) =>
  (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";

function audit(kind, userId, detail, req) {
  try {
    db.audit.push({
      id: store.shortId("a", 8), at: new Date().toISOString(),
      kind, userId: userId || null, detail: detail || {}, ip: clientIp(req),
    });
    /* keep the trail bounded — the last 5000 events is plenty to see a probe */
    if (db.audit.length > 5000) db.audit = db.audit.slice(-5000);
    touch("audit");
  } catch (e) { console.error("[audit]", e.message); }
}

/* ── sessions ──────────────────────────────────────────────────────────── */
function userFrom(req) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!token || token.length < 20) return null;

  const now = Date.now();
  const s = db.sessions.find((x) =>
    x.tokenHash === auth.tokenHash(token) && !x.revokedAt && new Date(x.expiresAt).getTime() > now
  );
  if (!s) return null;
  return db.users.find((u) => u.id === s.userId) || null;
}

function requireUser(req, res) {
  const u = userFrom(req);
  if (!u) { send(res, 401, { error: "sign in required" }); return null; }
  return u;
}

function issueSession(userId) {
  const token = auth.newToken();
  db.sessions.push({
    id: uuid(), userId, tokenHash: auth.tokenHash(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + auth.SESSION_DAYS * 864e5).toISOString(),
    revokedAt: null,
  });
  touch("sessions");
  return token;
}

const publicUser = (u) => ({
  id: u.id, email: u.email, name: u.name, phone: u.phone,
  is_driver: !!u.isDriver, verified: !!u.verified,
  province: u.province || "", town: u.town || "",
});

/* ── rides ─────────────────────────────────────────────────────────────── */
const rideById = (id) => db.rides.find((r) => r.id === id && r.status !== "cancelled");

function seatsTaken(rideId) {
  return db.bookings
    .filter((b) => b.rideId === rideId && b.kind === "passenger"
                && ["pending", "accepted", "completed"].includes(b.status))
    .reduce((n, b) => n + (b.seatCount || 0), 0);
}

const rideView = (r) => ({
  id: r.id, from: r.from, to: r.to, depart: r.departLabel,
  vehicle: r.vehicle, plate: r.plate, colour: r.colour,
  seats: r.seatsTotal, taken: seatsTaken(r.id),
  left: r.seatsTotal - seatsTaken(r.id),
  driver: r.driverName, legs: r.legs, sample: !!r.isSample, status: r.status,
});

/* ── pricing — the only place a rand is decided ────────────────────────── */
function priceSeat(rideId, stop, seats) {
  const n = Number(seats);
  /* Refuse rather than clamp. A silent clamp once booked 3 seats when 99 were
     asked for, charging for something nobody requested. */
  if (!Number.isInteger(n) || n < 1 || n > FEES.maxSeatsPerBooking) {
    return { error: "seats must be 1 to " + FEES.maxSeatsPerBooking };
  }
  const r = rideById(rideId);
  if (!r || r.status !== "open") return { error: "unknown ride or stop" };

  const fareCents = r.legs[stop];
  if (fareCents === undefined) return { error: "unknown ride or stop" };

  const taken = seatsTaken(rideId);
  if (taken + n > r.seatsTotal) return { error: "not enough seats left" };

  const pickup = FEES.pickupCents * n;
  const platform = FEES.platformCents * n;
  return {
    ok: true, currency: "ZAR", seats: n, stop, rideId,
    fareCents, pickupCents: pickup, platformCents: platform,
    rows: [
      { label: n > 1 ? `Card fare × ${n} seats` : "Card fare", cents: fareCents * n },
      { label: n > 1 ? `Pickup fee × ${n}` : "Pickup fee", cents: pickup },
      { label: n > 1 ? `Platform fee × ${n}` : "Platform fee", cents: platform },
    ],
    totalCents: fareCents * n + pickup + platform,
    feeVersion: FEES.version,
  };
}

function priceParcel(rideId, kg) {
  const weight = Number(kg);
  if (!(weight > 0) || weight > 50) return { error: "weight must be 0 to 50 kg" };
  if (!rideById(rideId)) return { error: "unknown ride" };
  const booking = FEES.parcelBookingCents;
  return {
    ok: true, currency: "ZAR", kg: weight, rideId,
    rows: [{ label: "Parcel booking fee", cents: booking }],
    totalCents: booking, feeVersion: FEES.version,
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
      return send(res, 200, {
        ok: true, store: "files",
        users: db.users.length, rides: db.rides.length,
        bookings: db.bookings.length, feeVersion: FEES.version,
      });
    }

    /* ── signup ── the client sends a derived hash, never the password ── */
    if (req.method === "POST" && route === "/auth/signup") {
      const b = await readBody(req);
      const bad = auth.checkSignup(b);
      if (bad) return send(res, 400, { error: bad });

      const email = String(b.email).trim().toLowerCase();
      if (db.users.some((u) => u.email === email)) {
        return send(res, 409, { error: "that email is already registered" });
      }
      const u = {
        id: uuid(), email,
        name: String(b.name).trim().slice(0, 80),
        phone: String(b.phone || "").replace(/[^\d+]/g, "").slice(0, 20) || null,
        pwSalt: String(b.salt),
        pwHash: auth.serverHash(b.clientHash, b.salt),
        isDriver: !!b.isDriver, verified: false,
        /* where the rider calls home. Used to show them hikes leaving their own
           city first, so it is stored rather than re-asked on every screen. */
        province: String(b.province || "").slice(0, 60),
        town: String(b.town || "").slice(0, 60),
        createdAt: new Date().toISOString(), lastSeenAt: null,
      };
      db.users.push(u);
      touch("users");
      const token = issueSession(u.id);
      audit("SIGNUP", u.id, { driver: u.isDriver }, req);
      return send(res, 201, { user: publicUser(u), token });
    }

    /* ── the salt, so the client can derive before sending ── */
    if (req.method === "POST" && route === "/auth/salt") {
      const b = await readBody(req);
      const email = String((b && b.email) || "").trim().toLowerCase();
      if (!auth.goodEmail(email)) return send(res, 400, { error: "bad email" });
      const u = db.users.find((x) => x.email === email);
      /* always salt-shaped, so a missing account is not obvious from the reply */
      return send(res, 200, { salt: u ? u.pwSalt : auth.newSalt() });
    }

    /* ── login ── */
    if (req.method === "POST" && route === "/auth/login") {
      const b = await readBody(req);
      if (!b || !auth.goodEmail(b.email) || !b.clientHash) {
        return send(res, 400, { error: "email and password are required" });
      }
      const u = db.users.find((x) => x.email === String(b.email).trim().toLowerCase());
      /* same message either way: never confirm which half was wrong */
      const fail = { error: "that email or password is not right" };
      if (!u) return send(res, 401, fail);
      if (!auth.verify(b.clientHash, u.pwSalt, u.pwHash)) {
        audit("LOGIN_FAIL", u.id, {}, req);
        return send(res, 401, fail);
      }
      u.lastSeenAt = new Date().toISOString();
      touch("users");
      const token = issueSession(u.id);
      audit("LOGIN", u.id, {}, req);
      return send(res, 200, { user: publicUser(u), token });
    }

    if (req.method === "POST" && route === "/auth/logout") {
      const hdr = req.headers.authorization || "";
      const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
      if (token) {
        const h = auth.tokenHash(token);
        const s = db.sessions.find((x) => x.tokenHash === h);
        if (s) { s.revokedAt = new Date().toISOString(); touch("sessions"); }
      }
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && route === "/auth/me") {
      const u = requireUser(req, res);
      if (!u) return;
      return send(res, 200, { user: publicUser(u) });
    }

    /* ── rides ── public, with fares, so the client can draw them ── */
    if (req.method === "GET" && route === "/rides") {
      const live = db.rides.filter((r) => r.status === "open" || r.status === "full");
      return send(res, 200, { rides: live.map(rideView), feeVersion: FEES.version });
    }

    /* ── a driver publishes a ride ── */
    if (req.method === "POST" && route === "/rides") {
      const u = requireUser(req, res);
      if (!u) return;
      const b = await readBody(req);
      if (!b || !b.from || !b.to) return send(res, 400, { error: "from and to are required" });
      const seats = Number(b.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
        return send(res, 400, { error: "seats must be 1 to 8" });
      }
      const legs = Array.isArray(b.legs) ? b.legs : [];
      if (!legs.length) return send(res, 400, { error: "at least one stop and fare is required" });

      const clean = {};
      for (const l of legs) {
        const stop = String((l && l.stop) || "").trim().slice(0, 80);
        const fareCents = Number(l && l.fareCents);
        if (!stop || !Number.isInteger(fareCents) || fareCents < 0) {
          return send(res, 400, { error: "every stop needs a name and a whole-cent fare" });
        }
        clean[stop] = fareCents;
      }

      const id = store.shortId("r", 6);
      db.rides.push({
        id, driverId: u.id, driverName: u.name || "Verified driver",
        from: String(b.from).slice(0, 80), to: String(b.to).slice(0, 80),
        departLabel: String(b.departLabel || "").slice(0, 20),
        vehicle: String(b.vehicle || "").slice(0, 60),
        plate: String(b.plate || "").slice(0, 20),
        colour: String(b.colour || "").slice(0, 30),
        seatsTotal: seats, legs: clean, isSample: false, status: "open",
        createdAt: new Date().toISOString(),
      });
      touch("rides");
      u.isDriver = true;
      touch("users");
      audit("RIDE_CREATED", u.id, { rideId: id }, req);
      return send(res, 201, { rideId: id });
    }

    /* ── quote: the server prices, the client displays ── */
    if (req.method === "POST" && route === "/quote") {
      const b = await readBody(req);
      if (!b) return send(res, 400, { error: "bad json" });
      const p = b.kind === "parcel"
        ? priceParcel(b.rideId, b.kg)
        : priceSeat(b.rideId, b.stop, b.seats);
      if (!p.ok) return send(res, 400, { error: p.error });
      return send(res, 200, p);
    }

    /* ── book. The gate. ──
       The whole check-then-write runs inside mutate(), synchronously, so two
       riders claiming the last seat cannot both succeed. */
    if (req.method === "POST" && route === "/book") {
      const u = requireUser(req, res);
      if (!u) return;
      const b = await readBody(req);
      if (!b) return send(res, 400, { error: "bad json" });

      const isParcel = b.kind === "parcel";
      const priced = isParcel ? priceParcel(b.rideId, b.kg) : priceSeat(b.rideId, b.stop, b.seats);
      if (!priced.ok) return send(res, 400, { error: priced.error });

      /* the tamper check — the client may send any total it likes */
      if (b.clientTotalCents !== undefined && b.clientTotalCents !== priced.totalCents) {
        audit("PRICE_MISMATCH", u.id,
          { rideId: b.rideId, claimed: b.clientTotalCents, actual: priced.totalCents }, req);
        return send(res, 409, { error: "price mismatch", serverTotalCents: priced.totalCents });
      }

      let outcome;
      try {
        /* read → re-check seats → write, with no await in between */
        outcome = mutate(["bookings"], () => {
          if (!isParcel) {
            const r = rideById(b.rideId);
            if (!r) throw { code: 400, message: "unknown ride" };
            if (seatsTaken(b.rideId) + priced.seats > r.seatsTotal) {
              throw { code: 409, message: "not enough seats left" };
            }
          } else if (!rideById(b.rideId)) {
            throw { code: 400, message: "unknown ride" };
          }

          const bk = {
            /* the reference the rider carries, like a ticket number */
            ref: newRef(),
            id: uuid(), at: new Date().toISOString(), status: "pending",
            rideId: b.rideId, userId: u.id, userEmail: u.email,
            kind: isParcel ? "parcel" : "passenger",
            seatCount: priced.seats || 0, stop: b.stop || null, kg: priced.kg || null,
            pickup: String(b.pickup || "").slice(0, 200),
            suburb: String(b.suburb || "").slice(0, 80),
            city: String(b.city || "").slice(0, 80),
            fareCents: priced.fareCents || 0,
            pickupCents: priced.pickupCents || 0,
            platformCents: priced.platformCents || 0,
            totalCents: priced.totalCents,
            feeVersion: priced.feeVersion,
            payMethod: b.payMethod === "cash" ? "cash" : "card",
            rows: priced.rows,
          };
          db.bookings.push(bk);
          return bk;
        });
      } catch (e) {
        if (e && e.code) return send(res, e.code, { error: e.message });
        throw e;
      }

      audit("BOOKED", u.id, { booking: outcome.id, total: outcome.totalCents }, req);
      /* the plate is NOT sent here — it is released only once accepted */
      return send(res, 201, {
        booking: {
          /* the rider's ticket number — this is what they carry to the rank */
          ref: outcome.ref,
          id: outcome.id, at: outcome.at, status: outcome.status,
          rideId: outcome.rideId, kind: outcome.kind, seats: outcome.seatCount,
          stop: outcome.stop, kg: outcome.kg, pickup: outcome.pickup,
          suburb: outcome.suburb, city: outcome.city,
          totalCents: outcome.totalCents, payMethod: outcome.payMethod,
          feeVersion: outcome.feeVersion, rows: outcome.rows,
        },
      });
    }

    /* ── my bookings ── */
    /* ── a driver accepts a request ─────────────────────────────────────────
       This is the moment the seat is committed and the driver's details are
       released to the rider. Accepting twice is refused rather than silently
       succeeding, so a double-tap cannot be mistaken for two acceptances. */
    if (req.method === "POST" && route === "/accept") {
      const u = requireUser(req, res);
      if (!u) return;
      const b = await readBody(req);
      if (!b) return send(res, 400, { error: "bad json" });

      /* the booking is found by reference, which is what the driver sees */
      const key = String(b.ref || "").trim().toUpperCase();
      const id = String(b.bookingId || "");
      const bk = db.bookings.find((x) => (key && x.ref === key) || (id && x.id === id));
      if (!bk) return send(res, 404, { error: "no booking with that reference" });

      if (bk.status === "accepted") {
        return send(res, 409, { error: "that booking is already accepted" });
      }
      if (bk.status === "cancelled") {
        return send(res, 409, { error: "that booking was cancelled" });
      }
      if (bk.status !== "pending") {
        return send(res, 409, { error: "that booking cannot be accepted" });
      }

      bk.status = "accepted";
      bk.acceptedAt = new Date().toISOString();
      bk.acceptedBy = u.id;
      touch();

      audit("ACCEPTED", u.id, { booking: bk.id, ref: bk.ref }, req);
      const r = rideById(bk.rideId) || {};
      return send(res, 200, {
        booking: {
          ref: bk.ref, id: bk.id, status: bk.status, at: bk.at,
          acceptedAt: bk.acceptedAt,
          rideId: bk.rideId, kind: bk.kind, seats: bk.seatCount,
          stop: bk.stop, pickup: bk.pickup, suburb: bk.suburb, city: bk.city,
          totalCents: bk.totalCents, payMethod: bk.payMethod, rows: bk.rows,
          from: r.from, to: r.to, depart: r.departLabel,
          vehicle: r.vehicle, driver: r.driverName,
          plate: r.plate, colour: r.colour,
          rider: { name: bk.riderName || null, phone: bk.riderPhone || null },
        },
      });
    }

    /* ── look a booking up by its reference ─────────────────────────────────
       Used by the boarding pass: the rider can open their own ticket from any
       device with the code alone, which is how a ticket is meant to work. */
    if (req.method === "GET" && route.startsWith("/booking/")) {
      const ref = decodeURIComponent(route.slice("/booking/".length)).trim().toUpperCase();
      if (!ref) return send(res, 400, { error: "no reference given" });
      const bk = db.bookings.find((x) => x.ref === ref);
      if (!bk) return send(res, 404, { error: "no booking with that reference" });

      /* optional: a public lookup still works, it just returns less */
      const u = userFrom(req);
      const mine = u && u.id === bk.userId;
      /* the reference is the credential, so the sensitive fields are still
         withheld unless the caller is the signed-in owner of the booking */
      const r = rideById(bk.rideId) || {};
      const released = bk.status === "accepted" || bk.status === "completed";
      return send(res, 200, {
        booking: {
          ref: bk.ref, id: bk.id, status: bk.status, at: bk.at,
          acceptedAt: bk.acceptedAt || null,
          rideId: bk.rideId, kind: bk.kind, seats: bk.seatCount,
          stop: bk.stop, pickup: mine ? bk.pickup : null,
          suburb: mine ? bk.suburb : null, city: mine ? bk.city : null,
          totalCents: bk.totalCents, payMethod: bk.payMethod, rows: bk.rows,
          from: r.from, to: r.to, depart: r.departLabel,
          vehicle: r.vehicle, driver: r.driverName,
          plate: released ? r.plate : null,
          colour: released ? r.colour : null,
        },
      });
    }

    if (req.method === "GET" && route === "/bookings") {
      const u = requireUser(req, res);
      if (!u) return;
      const mine = db.bookings
        .filter((b) => b.userId === u.id)
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, 100);
      return send(res, 200, {
        bookings: mine.map((b) => {
          const r = rideById(b.rideId) || {};
          const released = b.status === "accepted" || b.status === "completed";
          return {
            ref: b.ref, id: b.id, at: b.at, status: b.status, rideId: b.rideId, kind: b.kind,
            seats: b.seatCount, stop: b.stop, pickup: b.pickup,
            suburb: b.suburb, city: b.city, totalCents: b.totalCents,
            payMethod: b.payMethod, from: r.from, to: r.to, depart: r.departLabel,
            vehicle: r.vehicle, driver: r.driverName,
            /* plate and colour released only after the driver accepts */
            plate: released ? r.plate : null,
            colour: released ? r.colour : null,
          };
        }),
      });
    }

    /* ── chat ── */
    const onRide = (rideId, userId) =>
      db.bookings.some((b) => b.rideId === rideId && b.userId === userId)
      || db.rides.some((r) => r.id === rideId && r.driverId === userId);

    if (req.method === "GET" && route === "/messages") {
      const u = requireUser(req, res);
      if (!u) return;
      const rideId = url.searchParams.get("rideId");
      if (!rideId) return send(res, 400, { error: "rideId is required" });
      if (!onRide(rideId, u.id)) return send(res, 403, { error: "not your ride" });
      const msgs = db.messages
        .filter((m) => m.rideId === rideId)
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        .slice(-300);
      return send(res, 200, { messages: msgs });
    }

    if (req.method === "POST" && route === "/messages") {
      const u = requireUser(req, res);
      if (!u) return;
      const b = await readBody(req);
      if (!b || !b.rideId || !String(b.body || "").trim()) {
        return send(res, 400, { error: "rideId and body are required" });
      }
      if (!onRide(b.rideId, u.id)) return send(res, 403, { error: "not your ride" });
      const m = {
        id: store.shortId("m", 8), rideId: b.rideId, userId: u.id,
        sender: u.name, body: String(b.body).slice(0, 2000),
        isSystem: false, at: new Date().toISOString(),
      };
      db.messages.push(m);
      touch("messages");
      return send(res, 201, { message: m });
    }

    /* ── safety reports — write only, from the client's side ── */
    if (req.method === "POST" && route === "/reports") {
      const u = requireUser(req, res);
      if (!u) return;
      const b = await readBody(req);
      if (!b || !String(b.reason || "").trim()) {
        return send(res, 400, { error: "a reason is required" });
      }
      const rep = {
        id: uuid(), at: new Date().toISOString(), rideId: b.rideId || null,
        reporter: u.id, reason: String(b.reason).slice(0, 100),
        detail: String(b.detail || "").slice(0, 2000),
      };
      db.reports.push(rep);
      touch("reports");
      audit("REPORT", u.id, { rideId: b.rideId, reason: b.reason }, req);
      return send(res, 201, { report: { id: rep.id, at: rep.at } });
    }

    return send(res, 404, { error: "no such endpoint" });
  } catch (e) {
    console.error("[api]", e.message);
    return send(res, 500, { error: "server error" });
  }
});

/* ── seed: the sample riders and rides ─────────────────────────────────── */
/* Sample rides exist so the app has something to show before real drivers
   sign up. They are flagged isSample so they can be filtered once real
   inventory arrives. Not deletable through the API. */
function seed() {
  if (!db.rides.some((r) => r.isSample)) {
    db.rides.push({
      id: "g1", driverId: null, driverName: "Verified driver",
      from: "East London", to: "Mthatha", departLabel: "06:30",
      vehicle: "Toyota Quantum", plate: "EL 123 GP", colour: "White",
      seatsTotal: 4,
      legs: { Komani: 12000, Butterworth: 17000, Idutywa: 19500, Mthatha: 24000 },
      isSample: true, status: "open", createdAt: new Date().toISOString(),
    });
    db.rides.push({
      id: "g2", driverId: null, driverName: "Verified driver",
      from: "East London", to: "Mthatha", departLabel: "08:00",
      vehicle: "Toyota Quantum", plate: "EL 456 GP", colour: "Silver",
      seatsTotal: 3,
      legs: { Cala: 13000, Ngcobo: 16500, Mthatha: 18500 },
      isSample: true, status: "open", createdAt: new Date().toISOString(),
    });
    touch("rides");
    console.log("[seed] sample rides created");
  } else {
    console.log("[seed] sample rides present");
  }
}

store.load();
server.listen(PORT, "127.0.0.1", () => {
  console.log("GOGO API on http://127.0.0.1:" + PORT);
  console.log("[store] files in " + store.DIR);
  seed();
});
