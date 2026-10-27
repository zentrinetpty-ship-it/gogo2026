/**
 * GOGO — SEAT INTERVALS
 *
 * The occupancy engine for progressive seat resale. Everything about whether a
 * seat can be sold lives here, and nowhere else.
 *
 * ── WHY INTERVALS ──────────────────────────────────────────────────────────
 * A ride is not "4 seats". It is an ordered list of legs, and a passenger
 * occupies a SPAN of them:
 *
 *   Ride g1: East London → Komani → Butterworth → Idutywa → Mthatha
 *   leg idx:      0         1          2            3         4
 *
 *   Passenger A: boards 0, alights 1   (East London → Komani)
 *   Passenger B: boards 1, alights 4   (Komani → Mthatha)
 *
 * A and B are both valid: they overlap in TIME but not in SPACE. Counting a
 * single integer per ride refuses B, which is a seat the van can physically
 * sell. That is money left on the road.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 * A new booking is checked against every leg it touches, not the whole ride:
 *
 *   for leg in [boardIdx, alightIdx):  if aboard[leg] + n > capacity → reject
 *
 * ── WHAT IS AND IS NOT MUTABLE ─────────────────────────────────────────────
 * Capacity is a CONSTANT from the ride definition. Occupancy is ALWAYS derived
 * from bookings. Nothing increments a seat counter, because a counter drifts the
 * first time a booking is cancelled and somebody forgets to decrement it. That
 * was a live bug: two cancels turned a 4-seat van into an 8-seat one.
 */
"use strict";

/**
 * The ordered stop names for a ride.
 *
 * The ride's `legs` map is authored stop -> fare (insertion ordered), and the
 * origin is implicit. So the sequence is [from, ...legStops].
 */
function stopSequence(ride) {
  const stops = [ride.from];
  Object.keys(ride.legs || {}).forEach((s) => {
    if (!stops.some((x) => sameTown(x, s))) stops.push(s);
  });
  return stops;
}

/** Loose town comparison: "Queenstown" and "Komani" are the same place. */
const ALIASES = {
  queenstown: "komani",
  "port elizabeth": "gqeberha",
  pe: "gqeberha",
  "king williams town": "bhisho",
  "king william's town": "bhisho",
  kwt: "bhisho",
};

function normTown(t) {
  let s = String(t || "").toLowerCase().trim().replace(/[^a-z' ]/g, "");
  return ALIASES[s] || s;
}

function sameTown(a, b) {
  const x = normTown(a);
  const y = normTown(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * How many passengers are aboard on each leg, given the bookings.
 *
 * Returns an array of length (stops - 1): index i is the leg from stop i to
 * stop i+1. Only bookings that are actually holding a seat are counted:
 * cancelled ones are out, and a `pending` request DOES hold an interval,
 * otherwise two riders could request the same last seat and both be accepted.
 */
function aboardPerLeg(ride, bookings, opts) {
  const o = opts || {};
  const stops = stopSequence(ride);
  const legs = Math.max(0, stops.length - 1);
  const aboard = new Array(legs).fill(0);

  (bookings || []).forEach((b) => {
    if (b.status === "cancelled" || b.status === "declined" || b.status === "no_show") return;
    if (b.kind === "parcel") return;                 // parcels use the boot, not seats
    if (o.ignoreBookingId && b.id === o.ignoreBookingId) return;

    const from = b.rideId === ride.id || b.rideId === ride.rideId ? b : null;
    if (!from) return;

    /* Prefer stored indices; fall back to resolving towns so old bookings work. */
    let a = Number.isInteger(b.boardIdx) ? b.boardIdx : stops.findIndex((s) => sameTown(s, b.city || b.from));
    let z = Number.isInteger(b.alightIdx) ? b.alightIdx : stops.findIndex((s) => sameTown(s, b.stop));

    if (a < 0 || z < 0 || z <= a) return;            // cannot place it: do not invent a seat
    const n = Number(b.seats) || 0;
    for (let i = a; i < z && i < legs; i++) aboard[i] += n;
  });

  return { aboard, stops, legs };
}

/**
 * Can `seats` be sold from stop `fromTown` to stop `toTown` on this ride?
 *
 * Returns { ok, boardIdx, alightIdx, blockedOnLeg, seatsFree } — the caller needs
 * the indices to store on the booking, and needs to know WHICH leg was full so
 * the message can be honest ("only 1 seat on the Komani to Butterworth stretch"
 * is far more useful than "not enough seats").
 */
function canBook(ride, bookings, fromTown, toTown, seats) {
  const n = Number(seats);
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: "seats must be a whole number of 1 or more" };
  }

  const stops = stopSequence(ride);
  const boardIdx = stops.findIndex((s) => sameTown(s, fromTown));
  const alightIdx = stops.findIndex((s) => sameTown(s, toTown));

  if (boardIdx < 0) return { ok: false, error: "that boarding town is not on this route" };
  if (alightIdx < 0) return { ok: false, error: "that destination is not on this route" };
  if (alightIdx <= boardIdx) {
    /* Direction matters. A van going East London → Mthatha cannot take someone
       Mthatha → East London, and saying "not enough seats" would be a lie. */
    return { ok: false, error: "wrong_direction", detail: "that stop comes before the boarding point on this route" };
  }

  const { aboard } = aboardPerLeg(ride, bookings);
  const capacity = Number(ride.seats) || 0;

  let tightest = Infinity;
  let blockedOnLeg = -1;
  for (let i = boardIdx; i < alightIdx; i++) {
    const free = capacity - (aboard[i] || 0);
    if (free < tightest) { tightest = free; if (free < n) blockedOnLeg = i; }
    if (aboard[i] + n > capacity) {
      return {
        ok: false,
        error: "not enough seats",
        detail: "only " + Math.max(0, free) + " seat" + (free === 1 ? "" : "s") + " free on the " +
                stops[i] + " to " + stops[i + 1] + " stretch",
        blockedOnLeg: i,
        seatsFree: Math.max(0, free),
      };
    }
  }

  return {
    ok: true,
    boardIdx,
    alightIdx,
    seatsFree: Math.max(0, tightest === Infinity ? capacity : tightest),
    capacity,
    stops,
  };
}

/**
 * Seats free per boarding town, for showing a rider what is actually bookable.
 * A rider in Komani cares about ONE number: how many seats are free on the legs
 * from Komani onward. Showing them the van's total is misleading the moment
 * anyone is aboard.
 */
function seatsFromTown(ride, bookings, town) {
  const stops = stopSequence(ride);
  const idx = stops.findIndex((s) => sameTown(s, town));
  if (idx < 0 || idx >= stops.length - 1) return 0;
  const { aboard } = aboardPerLeg(ride, bookings);
  const capacity = Number(ride.seats) || 0;
  let min = capacity;
  for (let i = idx; i < stops.length - 1; i++) min = Math.min(min, capacity - (aboard[i] || 0));
  return Math.max(0, min);
}

module.exports = {
  stopSequence, sameTown, normTown, aboardPerLeg, canBook, seatsFromTown, ALIASES,
};
