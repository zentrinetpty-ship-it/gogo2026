/**
 * GOGO — DRIVER + CHAT ROUTES
 *
 * Mounted into booking-server.js. Every route that touches a driver resolves
 * the caller from the session token and then checks that the driver record
 * belongs to that account. A driver id in the request body is never trusted —
 * that is the whole class of bug that lets someone withdraw another driver's
 * money.
 *
 * CHAT is deliberately separate from the booking flow: a rider can message a
 * driver BEFORE booking, so the thread is keyed by (rider phone, ride id) and
 * needs no booking to exist.
 */

"use strict";

module.exports = function driverRoutes(req, res, route, url, ctx) {
  const {
    auth,            // ./auth — userFromToken(token)
    ops,             // ./driver-ops
    json,            // (res, code, obj)
    body,            // (req) => Promise<object|null>
    bearer,          // (req) => token from the Authorization header
    cookieSession,   // (req) => token from the gogo_session cookie
  } = ctx;

  /* ── path matching ──────────────────────────────────────────────────────
     The server hands us the already-stripped route, so "/api/driver/rides/abc"
     arrives as "/driver/rides/abc". This matches it against a template and
     returns the captured params, or null. Only :segments are special; nothing
     else is interpolated, so a ride id containing a slash simply does not match
     rather than escaping somewhere it should not. */
  function match(template) {
    const t = template.split("/").filter(Boolean);
    const a = route.split("/").filter(Boolean);
    if (t.length !== a.length) return null;
    const params = {};
    for (let i = 0; i < t.length; i++) {
      if (t[i].charAt(0) === ":") {
        params[t[i].slice(1)] = decodeURIComponent(a[i]);
      } else if (t[i] !== a[i]) {
        return null;
      }
    }
    return params;
  }

  /* Route declaration helper. Returns true if it dispatched, so the caller can
     `if (...) return;` for each one. */
  function dispatch(method, template, handler) {
    if (req.method !== method) return false;
    const params = match(template);
    if (!params) return false;
    Promise.resolve(handler(req, res, params)).catch(function (e) {
      console.error("driver route failed", method, template, e);
      try { json(res, 500, { ok: false, error: "Something went wrong." }); } catch (_) {}
    });
    return true;
  }

  /* One place that answers "who is calling". The cookie is checked second
     because the Authorization header is explicit and should win if both exist. */
  function requireUser(req) {
    const tok = bearer(req) || cookieSession(req);
    return tok ? auth.userFromToken(tok) : null;
  }

  /* The server's body() resolves null on malformed JSON rather than throwing, so
     every caller has to cope with null. Wrapping it once removes that noise from
     twenty handlers. */
  async function readBody(req) {
    const b = await body(req);
    return b && typeof b === "object" ? b : {};
  }

  /* ── identity guard ─────────────────────────────────────────────────────
     Returns the driver record owned by the signed-in account, or null.

     ── WHY THIS RE-READS ON EVERY CALL ────────────────────────────────────
     Every handler used to call ops.load() once at the top, mutate, then
     ops.save(). That is a read-modify-write against a file with no lock, so two
     requests arriving together each loaded the same snapshot and the second
     save() silently discarded the first one's driver, sales and ledger. It cost
     a whole test account's earnings before I caught it.

     The session's `user` object is stable, so the driver record is looked up
     from a FRESH load inside this function, and callers mutate that snapshot
     only for the duration of one request. Writes are still last-one-wins, but
     the window shrinks from "everything since load" to "this one handler".

     `create` still falls back to creating a stub, because a passenger switching
     to driver mode should get a record without a separate signup step. */
  function driverOrCreate(req, create) {
    const user = requireUser(req);
    if (!user) return { error: "auth" };
    const db = ops.load();
    let d = db.drivers.find((x) => x.phone === user.phone) || null;
    if (!d && create) {
      d = ops.driverForUser(db, user, { name: user.name });
      ops.save(db);
    }
    if (!d) return { error: "no_driver" };
    return { driver: d, db, user };
  }

  /* ══ DRIVER PROFILE ═══════════════════════════════════════════════════ */

  if (dispatch("GET", "/driver/me", async (req, res, params) => {
    const r = driverOrCreate(req, false);
    if (r.error === "auth") return json(res, 401, { ok: false, error: "Sign in first." });
    if (!r.driver) {
      /* Not a driver yet: report the shell so the UI can offer onboarding
         instead of guessing from a 404. */
      return json(res, 200, { ok: true, driver: null, onboardingRequired: true });
    }
    const bal = ops.balance(r.db, r.driver.id);
    return json(res, 200, {
      ok: true,
      driver: ops.publicDriver(r.driver),
      onboarding: r.driver.onboarding,
      balance: bal,
      canWithdraw: bal.canWithdraw,
    });
  })) return true;

  if (dispatch("POST", "/driver/register", async (req, res, params) => {
    const user = requireUser(req);
    if (!user) return json(res, 401, { ok: false, error: "Sign in first." });
    const body = await readBody(req);
    const db = ops.load();

    let d = db.drivers.find((x) => x.phone === user.phone);
    if (!d) {
      d = ops.driverForUser(db, user, { name: body.name || user.name });
    }

    /* Validation is per-field so the UI can mark the exact input that failed
       rather than showing one generic error. */
    const errors = {};
    const name = String(body.name || d.name || "").trim();
    const vehicle = String(body.vehicle || "").trim();
    const plate = String(body.plate || "").trim();
    const licence = String(body.licence || "").trim();
    const seats = Number(body.seats);

    if (name.length < 2) errors.name = "Enter the name riders will see.";
    if (vehicle.length < 2) errors.vehicle = "Which vehicle are you driving?";
    /* South African plates are not one format. Seen in the wild:
         EC 4521        province letters + digits (old)
         ECA 12345      three letters
         CA 123-456     Western Cape with a dash
         ND 12345 GP    Gauteng suffix
         JHB 4521       municipal
       Rejecting anything but "AB 1234" would turn away real drivers, so this
       accepts letters, digits, spaces and dashes and only insists there is at
       least one of each. "test" is caught; a valid plate is not. */
    const plateClean = plate.toUpperCase().replace(/\s+/g, " ").trim();
    if (!/^[A-Z0-9][A-Z0-9 -]{3,11}$/.test(plateClean) || !/[A-Z]/.test(plateClean) || !/\d/.test(plateClean)) {
      errors.plate = "That does not look like a number plate. Include the letters and numbers.";
    }
    if (!licence || licence.length < 4) errors.licence = "Enter your licence number.";
    if (!Number.isInteger(seats) || seats < 1 || seats > 22) errors.seats = "Seats must be between 1 and 22.";

    if (Object.keys(errors).length) {
      return json(res, 400, { ok: false, errors, error: "Check the highlighted fields." });
    }

    d.name = name;
    d.vehicle = vehicle;
    d.plate = plate.toUpperCase();
    d.colour = String(body.colour || "").trim();
    d.seats = seats;
    d.licenceNumber = licence;
    d.onboarding = { profile: true, vehicle: true, plate: true, licence: true };
    d.updatedAt = new Date().toISOString();
    ops.save(db);

    return json(res, 200, { ok: true, driver: ops.publicDriver(d) });
  })) return true;

  /* ══ RIDES ════════════════════════════════════════════════════════════ */

  if (dispatch("GET", "/driver/rides", async (req, res, params) => {
    const r = driverOrCreate(req, false);
    if (r.error === "auth") return json(res, 401, { ok: false, error: "Sign in first." });
    if (!r.driver) return json(res, 200, { ok: true, rides: [] });

    const rides = r.db.rides
      .filter((x) => x.driverId === r.driver.id)
      .sort((a, b) => String(a.date + a.depart).localeCompare(String(b.date + b.depart)))
      .map((x) => ops.rideSummary(r.db, x));

    return json(res, 200, { ok: true, rides });
  })) return true;

  if (dispatch("POST", "/driver/rides", async (req, res, params) => {
    const r = driverOrCreate(req, true);
    if (r.error === "auth") return json(res, 401, { ok: false, error: "Sign in first." });
    const { db, driver } = r;

    /* A driver who has not finished onboarding must not be able to list. This is
       the server-side half of that rule — hiding the button is not a control. */
    const ready = driver.onboarding && Object.values(driver.onboarding).every(Boolean);
    if (!ready) {
      return json(res, 403, {
        ok: false,
        code: "onboarding",
        error: "Finish your vehicle details before listing a ride.",
      });
    }

    const body = await readBody(req);
    const errors = {};
    const from = String(body.from || "").trim();
    const to = String(body.to || "").trim();
    const date = String(body.date || "").trim();
    const depart = String(body.depart || "").trim();
    const fare = Number(body.fare);
    const seatsTotal = Number(body.seatsTotal);

    if (!from) errors.from = "Where does it leave from?";
    if (!to) errors.to = "Where does it go?";
    if (from && to && from.toLowerCase() === to.toLowerCase()) errors.to = "Origin and destination are the same.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "Pick a date.";
    if (!/^\d{2}:\d{2}$/.test(depart)) errors.depart = "Pick a departure time.";
    if (!Number.isFinite(fare) || fare <= 0) errors.fare = "Enter the fare per seat.";
    if (!Number.isInteger(seatsTotal) || seatsTotal < 1 || seatsTotal > 22) errors.seatsTotal = "Between 1 and 22 seats.";

    /* A departure in the past cannot be booked, so accepting it would create a
       listing that is dead on arrival. */
    if (date && depart && !errors.date && !errors.depart) {
      const when = new Date(date + "T" + depart + ":00");
      if (!isNaN(when) && when.getTime() < Date.now() - 60 * 1000) {
        errors.depart = "That time has already passed.";
      }
    }

    if (Object.keys(errors).length) {
      return json(res, 400, { ok: false, errors, error: "Check the highlighted fields." });
    }

    const ride = {
      id: ops.rid("ride"),
      driverId: driver.id,
      from, to, date, depart,
      fare: ops.cents(fare),
      seatsTotal,
      vehicle: driver.vehicle,
      plate: driver.plate,
      stops: Array.isArray(body.stops) ? body.stops.slice(0, 8) : [],
      status: "open",
      createdAt: new Date().toISOString(),
    };
    db.rides.push(ride);
    ops.save(db);

    return json(res, 201, { ok: true, ride: ops.rideSummary(db, ride) });
  })) return true;

  if (dispatch("PATCH", "/driver/rides/:id", async (req, res, params) => {
    const r = driverOrCreate(req, false);
    if (r.error === "auth") return json(res, 401, { ok: false, error: "Sign in first." });
    const { db, driver } = r;
    const ride = db.rides.find((x) => x.id === params.id);
    if (!ride) return json(res, 404, { ok: false, error: "Ride not found." });
    /* ownership, not just existence */
    if (ride.driverId !== driver.id) return json(res, 403, { ok: false, error: "That is not your ride." });

    const body = await readBody(req);
    const booked = db.sales.filter((s) => s.rideId === ride.id && s.state !== "refunded").length;

    if (body.status && ["open", "cancelled", "completed"].includes(body.status)) {
      /* Cancelling a ride with paid seats needs a refund path, so it is refused
         here and handled deliberately rather than silently stranding riders. */
      if (body.status === "cancelled" && booked > 0) {
        return json(res, 409, {
          ok: false,
          code: "has_bookings",
          error:
            "This ride has " + booked + " booked seat" + (booked === 1 ? "" : "s") +
            ". Cancel each booking first so every rider gets their money back.",
        });
      }
      ride.status = body.status;
    }
    if (body.fare != null) {
      const f = Number(body.fare);
      if (!Number.isFinite(f) || f <= 0) return json(res, 400, { ok: false, error: "Fare must be more than zero." });
      ride.fare = ops.cents(f);
    }
    if (body.depart && /^\d{2}:\d{2}$/.test(body.depart)) ride.depart = body.depart;
    if (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) ride.date = body.date;

    ride.updatedAt = new Date().toISOString();
    ops.save(db);
    return json(res, 200, { ok: true, ride: ops.rideSummary(db, ride) });
  })) return true;

  /* ── seat sale lifecycle, driver side ──────────────────────────────────
     Held -> confirmed is "I have seen this passenger". Confirmed -> completed
     is what actually creates earnings. Both are explicit taps, because a
     driver's earnings must never depend on a timer. */
  if (dispatch("POST", "/driver/sales/:id/:action", async (req, res, params) => {
    const r = driverOrCreate(req, false);
    if (r.error === "auth") return json(res, 401, { ok: false, error: "Sign in first." });
    const { db, driver } = r;
    const sale = db.sales.find((s) => s.id === params.id);
    if (!sale) return json(res, 404, { ok: false, error: "Booking not found." });
    if (sale.driverId !== driver.id) return json(res, 403, { ok: false, error: "That is not your booking." });

    const action = params.action;

    if (action === "confirm") {
      if (sale.state !== "held") return json(res, 409, { ok: false, error: "That booking is " + sale.state + "." });
      sale.state = "confirmed";
      sale.confirmedAt = new Date().toISOString();
    } else if (action === "complete") {
      if (sale.state === "completed") return json(res, 409, { ok: false, error: "Already completed." });
      if (sale.state === "refunded") return json(res, 409, { ok: false, error: "That booking was refunded." });
      ops.completeSeat(db, sale);
    } else if (action === "refund") {
      const body = await readBody(req);
      ops.reverseSale(db, sale, body.reason || "");
    } else {
      return json(res, 400, { ok: false, error: "Unknown action." });
    }

    ops.save(db);
    const ride = db.rides.find((x) => x.id === sale.rideId);
    return json(res, 200, {
      ok: true,
      sale: { id: sale.id, state: sale.state },
      balance: ops.balance(db, driver.id),
      ride: ride ? ops.rideSummary(db, ride) : null,
    });
  })) return true;

  /* ══ EARNINGS ═════════════════════════════════════════════════════════ */

  if (dispatch("GET", "/driver/earnings", async (req, res, params) => {
    const r = driverOrCreate(req, false);
    if (r.error === "auth") return json(res, 401, { ok: false, error: "Sign in first." });
    if (!r.driver) return json(res, 200, { ok: true, balance: null, analytics: null });

    const { db, driver } = r;
    return json(res, 200, {
      ok: true,
      balance: ops.balance(db, driver.id),
      analytics: ops.analytics(db, driver.id),
      withdrawals: db.withdrawals
        .filter((w) => w.driverId === driver.id)
        .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
        .map((w) => ({
          id: w.id,
          amountPretty: w.amountPretty,
          method: w.method,
          account: w.account,
          status: w.status,
          requestedAt: w.requestedAt,
          paidAt: w.paidAt || null,
          reference: w.reference || null,
        })),
      ledger: db.ledger
        .filter((e) => e.driverId === driver.id)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .slice(0, 50)
        .map((e) => ({
          at: e.at,
          kind: e.kind,
          cents: e.cents,
          pretty: ops.fmt(Math.abs(e.cents)),
          sign: e.cents < 0 ? "-" : "+",
          note: e.note,
        })),
    });
  })) return true;

  if (dispatch("POST", "/driver/withdraw", async (req, res, params) => {
    const r = driverOrCreate(req, false);
    if (r.error === "auth") return json(res, 401, { ok: false, error: "Sign in first." });
    const { db, driver } = r;

    const body = await readBody(req);
    const amount = Number(body.amount);

    /* The amount arrives in rands from the form and is converted once, here. */
    const result = ops.requestWithdrawal(
      db,
      driver.id,
      ops.cents(amount),
      String(body.method || ""),
      body.account
    );

    if (!result.ok) {
      return json(res, 400, { ok: false, code: result.code, error: result.message });
    }

    ops.save(db);
    return json(res, 201, {
      ok: true,
      withdrawal: {
        id: result.withdrawal.id,
        amountPretty: result.withdrawal.amountPretty,
        method: result.withdrawal.method,
        status: result.withdrawal.status,
      },
      balance: result.balance,
    });
  })) return true;

  /* ══ CHAT — rider to driver, before or after booking ══════════════════ */

  function threadKey(rideId, phone) {
    return rideId + "::" + phone;
  }

  if (dispatch("GET", "/chat/:rideId", async (req, res, params) => {
    const user = requireUser(req);
    if (!user) return json(res, 401, { ok: false, error: "Sign in to message the driver." });

    const db = ops.load();
    const ride = db.rides.find((x) => x.id === params.rideId);
    /* Chats also hang off the static ride catalogue, which lives in
       booking-server's RIDES table, so a missing driver-ops ride is not fatal. */
    const driverId = ride ? ride.driverId : null;

    const chats = ops.loadChats();
    const key = threadKey(params.rideId, user.phone);
    const thread = chats.threads[key] || { messages: [] };

    return json(res, 200, {
      ok: true,
      rideId: params.rideId,
      driverId,
      /* The rider's own number is never echoed back into a thread — only their
         side of it. The driver sees the number only after a seat is confirmed,
         which is enforced in the booking flow, not here. */
      messages: thread.messages.slice(-100),
    });
  })) return true;

  if (dispatch("POST", "/chat/:rideId", async (req, res, params) => {
    const user = requireUser(req);
    if (!user) return json(res, 401, { ok: false, error: "Sign in to message the driver." });

    const body = await readBody(req);
    const text = String(body.text || "").trim().slice(0, 1000);

    if (!text) return json(res, 400, { ok: false, error: "Type a message first." });

    /* Rate limit: a chat box that can be scripted is a way to spam a driver's
       phone. Ten messages a minute per thread is generous for a conversation
       and useless for anything else. */
    const chats = ops.loadChats();
    const key = threadKey(params.rideId, user.phone);
    const thread = chats.threads[key] || { rideId: params.rideId, phone: user.phone, messages: [] };

    const cutoff = Date.now() - 60 * 1000;
    const recent = thread.messages.filter((m) => m.from === "rider" && new Date(m.at).getTime() > cutoff);
    if (recent.length >= 10) {
      return json(res, 429, { ok: false, error: "Slow down a moment — too many messages." });
    }

    const msg = {
      id: ops.rid("msg"),
      from: "rider",
      name: user.name || "Rider",
      text,
      at: new Date().toISOString(),
    };
    thread.messages.push(msg);
    chats.threads[key] = thread;
    ops.saveChats(chats);

    return json(res, 201, { ok: true, message: msg });
  })) return true;

  /* ── driver's inbox: every thread pointed at one of their rides ─────── */
  if (dispatch("GET", "/driver/chats", async (req, res, params) => {
    const r = driverOrCreate(req, false);
    if (r.error === "auth") return json(res, 401, { ok: false, error: "Sign in first." });
    if (!r.driver) return json(res, 200, { ok: true, threads: [] });

    const myRides = new Set(r.db.rides.filter((x) => x.driverId === r.driver.id).map((x) => x.id));
    const chats = ops.loadChats();

    const threads = Object.values(chats.threads)
      .filter((t) => myRides.has(t.rideId))
      .map((t) => {
        const last = t.messages[t.messages.length - 1] || null;
        return {
          rideId: t.rideId,
          phone: t.phone,
          riderName: (last && last.from === "rider" && last.name) || "Rider",
          count: t.messages.length,
          last: last ? { text: last.text, at: last.at, from: last.from } : null,
        };
      })
      .sort((a, b) => String((b.last && b.last.at) || "").localeCompare(String((a.last && a.last.at) || "")));

    return json(res, 200, { ok: true, threads });
  })) return true;

  /* Driver replies into a rider's thread. */
  if (dispatch("POST", "/driver/chat/:rideId/:phone", async (req, res, params) => {
    const r = driverOrCreate(req, false);
    if (r.error === "auth") return json(res, 401, { ok: false, error: "Sign in first." });
    const { db, driver } = r;

    const ride = db.rides.find((x) => x.id === params.rideId);
    if (!ride || ride.driverId !== driver.id) {
      return json(res, 403, { ok: false, error: "That is not your ride." });
    }

    const body = await readBody(req);
    const text = String(body.text || "").trim().slice(0, 1000);
    if (!text) return json(res, 400, { ok: false, error: "Type a message first." });

    const chats = ops.loadChats();
    const key = params.rideId + "::" + params.phone;
    const thread = chats.threads[key];
    if (!thread) return json(res, 404, { ok: false, error: "No conversation with that rider." });

    const msg = {
      id: ops.rid("msg"),
      from: "driver",
      name: driver.name,
      text,
      at: new Date().toISOString(),
    };
    thread.messages.push(msg);
    ops.saveChats(chats);

    return json(res, 201, { ok: true, message: msg });
  })) return true;

  /* nothing here matched: let the server's own routes run */
  return false;
};
