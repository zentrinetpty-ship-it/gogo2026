/**
 * GOGO — DRIVER OPERATIONS
 *
 * The driver half of the product: listings, seat inventory, earnings, payouts.
 * Until now GOGO was passenger-only, with rides as a hardcoded table.
 *
 * ── THE MONEY MODEL, STATED ONCE ──────────────────────────────────────────
 * Every amount in this file is an INTEGER NUMBER OF CENTS. Floats and money do
 * not mix: 0.1 + 0.2 is 0.30000000000000004, and a cent that drifts is a cent a
 * driver will argue about. Conversion happens at the edges only.
 *
 * A seat sale is not revenue the moment it is booked. The sequence is:
 *
 *     requested  -> held     money authorised, not taken
 *     held       -> confirmed  driver accepted; still not taken
 *     confirmed  -> completed  ride happened; money becomes EARNINGS
 *     any        -> refunded   released back to the rider
 *
 * Only `completed` sales count as earnings. That is the honest definition: a
 * seat that was booked and later refunded paid the driver nothing, so counting
 * it would inflate a withdrawal the platform cannot fund.
 *
 * A driver's available balance is therefore:
 *
 *     available = earned - paidOut - reservedForPendingWithdrawals
 *
 * and never includes money from rides that have not completed. Withdrawals are
 * debited at REQUEST time, not at payment time, or a driver can submit the same
 * balance twice before either one settles.
 *
 * ── WHY PAYOUTS ARE A LEDGER, NOT A BALANCE FIELD ─────────────────────────
 * A single `balance` number cannot answer "why is it this?" when a driver
 * queries it. Append-only entries can: every credit and debit is a row with a
 * reason, a timestamp and a reference. The balance is derived. That is slower
 * and it is worth it, because payout disputes are the one place a driver will
 * leave the platform over.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE = path.join(__dirname, "drivers-data.json");
const CHATS = path.join(__dirname, "chats-data.json");

/* ── platform economics ──────────────────────────────────────────────────
   Kept here, next to the math, so they cannot drift from each other. */
const COMMISSION_PCT = 12;          // platform's share of every completed seat
const PAYOUT_MIN_CENTS = 10000;     // R100 — below this, bank fees eat the transfer
const PAYOUT_HOLD_HOURS = 24;       // completed earnings are release-ready after this
const PAYOUT_METHODS = ["eft", "cash"];

/* ── store ───────────────────────────────────────────────────────────────── */
function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch (e) {
    /* ── THIS USED TO RETURN AN EMPTY STORE AND SAY NOTHING ────────────────
       A missing file is genuinely "no data yet" and an empty store is right.
       A file that exists but cannot be READ is a different thing entirely: the
       store is there, it has a driver's earnings in it, and pretending it is
       empty makes the data look deleted. That is exactly what happened when the
       file ended up root-owned and the API ran as www-data — /driver/me
       reported "not a driver yet" to a driver with R880 in his account.

       So: ENOENT -> empty store. Anything else -> log loudly and rethrow, so a
       permissions or corruption problem is a 500 the operator can see, not a
       silent zero. */
    if (e && e.code === "ENOENT") {
      return { drivers: [], rides: [], sales: [], ledger: [], payouts: [], withdrawals: [] };
    }
    console.error(
      "driver-ops: cannot read " + STORE + " — " + (e && e.message) +
      ". Refusing to treat an unreadable store as an empty one."
    );
    throw e;
  }
}
function save(db) {
  const tmp = STORE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STORE);       // atomic: a crash cannot half-write
}

function loadChats() {
  try {
    return JSON.parse(fs.readFileSync(CHATS, "utf8"));
  } catch (e) {
    return { threads: {} };
  }
}
function saveChats(db) {
  const tmp = CHATS + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, CHATS);
}

/* ── ids ─────────────────────────────────────────────────────────────────── */
const rid = (p) => p + "_" + crypto.randomBytes(8).toString("hex");

/* ── money helpers ───────────────────────────────────────────────────────── */
const cents = (rands) => Math.round(Number(rands || 0) * 100);
const rands = (c) => (Number(c || 0) / 100);
const fmt = (c) => "R" + rands(c).toFixed(2);

/** Platform commission on a completed seat, rounded once, at the point of sale. */
function commissionOf(grossCents) {
  return Math.round((grossCents * COMMISSION_PCT) / 100);
}

/** What the driver actually receives for one completed seat. */
function netOf(grossCents) {
  return grossCents - commissionOf(grossCents);
}

/* ── drivers ─────────────────────────────────────────────────────────────── */

/** A driver's public profile, safe to show a passenger before booking. */
function publicDriver(d) {
  if (!d) return null;
  return {
    id: d.id,
    name: d.name,
    phonePretty: d.phonePretty || "",
    initials: (d.name || "?")
      .split(/\s+/)
      .map((p) => p.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase(),
    rating: d.rating || 0,
    trips: d.trips || 0,
    vehicle: d.vehicle || "",
    plate: d.plate || "",
    colour: d.colour || "",
    seats: d.seats || 0,
    verified: !!d.verified,
    memberSince: d.memberSince || null,
    /* Deliberately NOT included: idNumber, bank details, home address,
       earnings. Those are the driver's own, and a passenger booking a seat has
       no reason to see any of them. */
  };
}

function findDriver(db, id) {
  return db.drivers.find((d) => d.id === id) || null;
}

/** The driver record attached to a signed-in account, creating a stub on first use. */
function driverForUser(db, user, profile) {
  let d = db.drivers.find((x) => x.phone === user.phone);
  if (d) return d;

  d = {
    id: rid("drv"),
    phone: user.phone,
    phonePretty: user.phonePretty || "",
    name: (profile && profile.name) || user.name || "",
    rating: 0,
    trips: 0,
    vehicle: "",
    plate: "",
    colour: "",
    seats: 7,
    verified: false,
    memberSince: new Date().toISOString(),
    /* onboarding checklist — a driver cannot list a ride until these are done */
    onboarding: { profile: false, vehicle: false, plate: false, licence: false },
    createdAt: new Date().toISOString(),
  };
  db.drivers.push(d);
  return d;
}

/* ── rides ───────────────────────────────────────────────────────────────── */

/**
 * A listing as the driver's own board needs it: every seat, every sale, what it
 * has earned so far and what is still open.
 */
function rideSummary(db, r) {
  const sales = db.sales.filter((s) => s.rideId === r.id);
  const completed = sales.filter((s) => s.state === "completed");
  const held = sales.filter((s) => s.state === "held" || s.state === "confirmed");
  const grossCompleted = completed.reduce((n, s) => n + s.grossCents, 0);
  const netCompleted = completed.reduce((n, s) => n + s.netCents, 0);
  const potential = held.reduce((n, s) => n + s.netCents, 0);

  const seatsTotal = Number(r.seatsTotal) || 0;
  const seatsSold = completed.length + held.length;

  return {
    id: r.id,
    driverId: r.driverId,
    from: r.from,
    to: r.to,
    depart: r.depart,
    date: r.date,
    vehicle: r.vehicle,
    fare: r.fare,                    // cents
    farePretty: fmt(r.fare),
    seatsTotal,
    seatsSold,
    seatsOpen: Math.max(0, seatsTotal - seatsSold),
    status: r.status || "open",
    /* load factor: how full the van is. The single most useful number a driver
       has, because an empty seat is the only inventory that expires worthless. */
    loadPct: seatsTotal ? Math.round((seatsSold / seatsTotal) * 100) : 0,
    stops: r.stops || [],
    earnings: {
      completedSeats: completed.length,
      grossCents: grossCompleted,
      grossPretty: fmt(grossCompleted),
      commissionCents: completed.reduce((n, s) => n + s.commissionCents, 0),
      netCents: netCompleted,
      netPretty: fmt(netCompleted),
      /* money that is real but not yet earned — worth showing separately so a
         driver never mistakes held money for spendable money */
      pendingCents: potential,
      pendingPretty: fmt(potential),
    },
    sales: sales.map((s) => ({
      id: s.id,
      passenger: s.passengerName || "Passenger",
      seats: s.seats,
      state: s.state,
      grossPretty: fmt(s.grossCents),
      netPretty: fmt(s.netCents),
      createdAt: s.createdAt,
    })),
  };
}

/* ── earnings and balance ────────────────────────────────────────────────── */

/**
 * The driver's balance, derived from the ledger rather than stored.
 *
 *   earned      sum of net credits from completed seats
 *   released    earned minus anything still inside the hold window
 *   reserved    money committed to withdrawals that have not paid out yet
 *   available   released - reserved - already paid out
 */
function balance(db, driverId) {
  const entries = db.ledger.filter((e) => e.driverId === driverId);

  /* earned is credits MINUS reversals. A refunded seat paid the driver nothing,
     so a number called "earned" that ignores refunds is a lie a payout would
     eventually expose. Reversals are negative entries, so they net here. */
  const credits = entries.filter((e) => e.kind === "earning").reduce((n, e) => n + e.cents, 0);
  const reversals = entries.filter((e) => e.kind === "reversal").reduce((n, e) => n + Math.abs(e.cents), 0);
  const earned = credits - reversals;

  /* Settled withdrawals are money that has actually gone. */
  const paidOut = db.withdrawals
    .filter((w) => w.driverId === driverId && w.status === "paid")
    .reduce((n, w) => n + w.amountCents, 0);

  /* Pending withdrawals are money promised but not yet gone. This is the ONLY
     place requested money is held back — it must not also be subtracted through
     the ledger, or a driver loses the same rand twice. */
  const reserved = db.withdrawals
    .filter((w) => w.driverId === driverId && w.status === "pending")
    .reduce((n, w) => n + w.amountCents, 0);

  /* Earnings inside the hold window are the driver's, but not yet movable. */
  const cutoff = Date.now() - PAYOUT_HOLD_HOURS * 3600 * 1000;
  const holdingEntries = entries.filter(
    (e) => e.kind === "earning" && new Date(e.at).getTime() > cutoff
  );
  const holding = holdingEntries.reduce((n, e) => n + e.cents, 0);

  /* One subtraction per state:
       earned    what completed seats paid, net of refunds and commission
       - holding money still inside the release window
       - reserved money promised to a pending withdrawal
       - paidOut  money already gone
  */
  const available = Math.max(0, earned - holding - reserved - paidOut);

  return {
    earnedCents: earned,
    earnedPretty: fmt(earned),
    holdingCents: holding,
    holdingPretty: fmt(holding),
    reservedCents: reserved,
    reservedPretty: fmt(reserved),
    paidOutCents: paidOut,
    paidOutPretty: fmt(paidOut),
    availableCents: available,
    availablePretty: fmt(available),
    canWithdraw: available >= PAYOUT_MIN_CENTS,
    minimumCents: PAYOUT_MIN_CENTS,
    minimumPretty: fmt(PAYOUT_MIN_CENTS),
    holdHours: PAYOUT_HOLD_HOURS,
    commissionPct: COMMISSION_PCT,
  };
}

/** Record a completed seat. This is the only path that creates earnings. */
function completeSeat(db, sale) {
  const gross = sale.grossCents;
  const commission = commissionOf(gross);
  const net = netOf(gross);

  sale.state = "completed";
  sale.completedAt = new Date().toISOString();
  sale.commissionCents = commission;
  sale.netCents = net;

  db.ledger.push({
    id: rid("led"),
    driverId: sale.driverId,
    kind: "earning",
    cents: net,
    saleId: sale.id,
    rideId: sale.rideId,
    at: new Date().toISOString(),
    note: "Seat completed · " + fmt(gross) + " less " + commissionPctLabel() + " commission (" + fmt(commission) + ")",
  });
  return sale;
}

function commissionPctLabel() {
  return COMMISSION_PCT + "%";
}

/** Reverse a completed seat (refund after completion). Creates a negative entry. */
function reverseSale(db, sale, reason) {
  if (sale.state === "refunded") return sale;
  const wasCompleted = sale.state === "completed";

  sale.state = "refunded";
  sale.refundedAt = new Date().toISOString();
  sale.refundReason = reason || "";

  if (wasCompleted) {
    db.ledger.push({
      id: rid("led"),
      driverId: sale.driverId,
      kind: "reversal",
      cents: -sale.netCents,
      saleId: sale.id,
      rideId: sale.rideId,
      at: new Date().toISOString(),
      note: "Refund after completion" + (reason ? ": " + reason : ""),
    });
  }
  return sale;
}

/* ── withdrawals ─────────────────────────────────────────────────────────── */

/**
 * Request a payout.
 *
 * The amount is debited from the available balance AT REQUEST TIME by writing a
 * `reserved` withdrawal row. Without that, a driver can tap Withdraw twice in a
 * second and end up owed twice what they earned — the classic double-spend in a
 * UI without a server-side hold.
 */
function requestWithdrawal(db, driverId, amountCents, method, account) {
  const bal = balance(db, driverId);

  if (!PAYOUT_METHODS.includes(method)) {
    return { ok: false, code: "bad_method", message: "Choose how you want to be paid." };
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, code: "bad_amount", message: "Enter an amount to withdraw." };
  }
  if (amountCents < PAYOUT_MIN_CENTS) {
    return {
      ok: false,
      code: "below_minimum",
      message: "The smallest withdrawal is " + fmt(PAYOUT_MIN_CENTS) + ".",
    };
  }
  if (amountCents > bal.availableCents) {
    return {
      ok: false,
      code: "insufficient",
      message:
        "You can withdraw " + bal.availablePretty + " right now. " +
        "That is your completed earnings, less money already requested and less anything still inside the " +
        PAYOUT_HOLD_HOURS + "-hour hold.",
    };
  }

  const w = {
    id: rid("wdr"),
    driverId,
    amountCents,
    amountPretty: fmt(amountCents),
    method,
    account: method === "eft" ? String(account || "").slice(0, 40) : "Cash collection",
    status: "pending",
    requestedAt: new Date().toISOString(),
  };
  db.withdrawals.push(w);
  return { ok: true, withdrawal: w, balance: balance(db, driverId) };
}

/** Mark a withdrawal paid. This is the debit that closes it out. */
function settleWithdrawal(db, withdrawalId, reference) {
  const w = db.withdrawals.find((x) => x.id === withdrawalId);
  if (!w) return { ok: false, code: "not_found" };
  if (w.status !== "pending") return { ok: false, code: "already_settled" };

  w.status = "paid";
  w.paidAt = new Date().toISOString();
  w.reference = reference || rid("ref");

  /* Audit only. balance() derives paidOut from the withdrawals table, so this
     row must not be counted a second time — it exists so the history reads as a
     story rather than a list of state changes. */
  db.ledger.push({
    id: rid("led"),
    driverId: w.driverId,
    kind: "payout",
    cents: -w.amountCents,
    withdrawalId: w.id,
    at: new Date().toISOString(),
    note: "Withdrawal paid · " + w.method.toUpperCase() + " · " + w.reference,
    auditOnly: true,
  });

  return { ok: true, withdrawal: w };
}

/* ── driver analytics ────────────────────────────────────────────────────── */

/**
 * The numbers a driver actually needs to decide whether to keep driving.
 *
 * Not vanity metrics. Each one answers a decision:
 *   loadPct        should I run this route again?
 *   revenuePerSeat is my fare too low?
 *   cancelRate     am I losing money to no-shows?
 *   bestRoute      where should I add a second van?
 */
function analytics(db, driverId) {
  const rides = db.rides.filter((r) => r.driverId === driverId);
  const sales = db.sales.filter((s) => s.driverId === driverId);

  const completed = sales.filter((s) => s.state === "completed");
  const refunded = sales.filter((s) => s.state === "refunded");
  const held = sales.filter((s) => s.state === "held" || s.state === "confirmed");

  const gross = completed.reduce((n, s) => n + s.grossCents, 0);
  const net = completed.reduce((n, s) => n + s.netCents, 0);
  const seatsOffered = rides.reduce((n, r) => n + (Number(r.seatsTotal) || 0), 0);

  /* revenue by day, newest last, for a sparkline */
  const byDay = {};
  for (const s of completed) {
    const day = String(s.completedAt || s.createdAt || "").slice(0, 10);
    if (!day) continue;
    byDay[day] = (byDay[day] || 0) + s.netCents;
  }
  const trend = Object.keys(byDay).sort().slice(-14).map((d) => ({ day: d, cents: byDay[d] }));

  /* which route earns best — per route, not per ride, because a route repeated
     three times is one decision */
  const byRoute = {};
  for (const s of completed) {
    const r = rides.find((x) => x.id === s.rideId);
    if (!r) continue;
    const key = r.from + " → " + r.to;
    byRoute[key] = byRoute[key] || { route: key, seats: 0, netCents: 0 };
    byRoute[key].seats += s.seats;
    byRoute[key].netCents += s.netCents;
  }
  const routes = Object.values(byRoute).sort((a, b) => b.netCents - a.netCents);

  const driver = findDriver(db, driverId);
  const avgFare = completed.length
    ? Math.round(gross / completed.reduce((n, s) => n + s.seats, 0) || 0)
    : 0;

  return {
    ridesListed: rides.length,
    ridesCompleted: new Set(completed.map((s) => s.rideId)).size,
    seatsOffered,
    seatsSold: completed.length,
    loadPct: seatsOffered ? Math.round((completed.length / seatsOffered) * 100) : 0,
    grossCents: gross, grossPretty: fmt(gross),
    netCents: net, netPretty: fmt(net),
    commissionCents: gross - net, commissionPretty: fmt(gross - net),
    avgFareCents: avgFare, avgFarePretty: fmt(avgFare),
    refundedCount: refunded.length,
    /* no-shows and refunds as a share of every seat that was ever committed */
    cancelRate: sales.length ? Math.round((refunded.length / sales.length) * 100) : 0,
    pendingSeats: held.length,
    rating: (driver && driver.rating) || 0,
    trips: (driver && driver.trips) || 0,
    trend,
    routes: routes.slice(0, 5).map((r) => ({
      route: r.route,
      seats: r.seats,
      netPretty: fmt(r.netCents),
      netCents: r.netCents,
    })),
  };
}

module.exports = {
  COMMISSION_PCT,
  PAYOUT_MIN_CENTS,
  PAYOUT_HOLD_HOURS,
  PAYOUT_METHODS,
  load, save,
  loadChats, saveChats,
  rid,
  cents, rands, fmt,
  commissionOf, netOf,
  publicDriver, findDriver, driverForUser,
  rideSummary, balance,
  completeSeat, reverseSale,
  requestWithdrawal, settleWithdrawal,
  analytics,
};
