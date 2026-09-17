/* =========================================================================
   GOGO — FEES + PARCEL SERVICE
   Two things live here:
     1. FEE_CONFIG — one source of truth for every rand the platform takes.
     2. The parcel engine — a sender moves a parcel city to city without ever
        touching a passenger seat. Boot space is its own capacity.
   State additions hang off the same localStorage blob as the rest of the app.
   ========================================================================= */

/* ── 1. fees ────────────────────────────────────────────────────────────── */

const FEE_CONFIG = {
  /* passenger booking */
  pickup: 19.99,
  platform: 9.99,
  /* parcel booking (charge /kg is negotiated, never platform-set) */
  parcelBooking: 19.99,
  version: 2,
};

const FEE_VERSION = FEE_CONFIG.version;

const rands = n => "R" + Number(n || 0).toFixed(2);

/* Passenger booking total: fare + pickup + platform. R2 has no hidden rounding. */
/* Passenger booking total: fare + the two fees, each charged per passenger.
   Booking 3 seats means 3 pickup fees and 3 platform fees on top of 3 fares. */
function fareLines(fare, seats = 1) {
  const f = Number(fare || 0);
  const n = Math.max(1, Number(seats) || 1);
  const pickup = FEE_CONFIG.pickup * n, platform = FEE_CONFIG.platform * n;
  const per = n > 1 ? ` × ${n} passengers` : "";
  return {
    kind: "passenger",
    seats: n,
    perPassenger: true,
    rows: [
      { label: "Card fare" + (n > 1 ? ` × ${n} seats` : ""), val: f },
      { label: "Pickup fee" + per, val: pickup },
      { label: "Platform fee" + per, val: platform },
    ],
    total: f + pickup + platform,
    feeVersion: FEE_VERSION,
  };
}

/* Parcel booking total: agreed /kg carriage + the parcel booking fee. */
function parcelLines(agreedCarriage) {
  const c = Number(agreedCarriage || 0);
  return {
    kind: "parcel",
    rows: [
      { label: "Parcel carriage (agreed)", val: c },
      { label: "Parcel booking fee", val: FEE_CONFIG.parcelBooking },
    ],
    total: c + FEE_CONFIG.parcelBooking,
    feeVersion: FEE_VERSION,
  };
}

/* ── 2. parcel engine ───────────────────────────────────────────────────── */

/* size classes are advisory only — the driver is the one who can see the boot */
const PARCEL_SIZES = [
  { id: "small", label: "Small", hint: "Shoebox to backpack" },
  { id: "medium", label: "Medium", hint: "Suitcase to crate" },
  { id: "large", label: "Large", hint: "Tyre, fridge, furniture" },
];

/* the negotiation state machine, in order */
const PARCEL_STATES = ["draft", "requested", "negotiating", "agreed", "accepted", "booked", "collected", "in_transit", "delivered"];
const PARCEL_EXITS = ["declined", "withdrawn", "expired"];

const PARCEL_LABEL = {
  draft: "Draft", requested: "Waiting for a driver", negotiating: "Negotiating",
  agreed: "Price agreed", accepted: "Driver accepted", booked: "Booked",
  collected: "Collected", in_transit: "In transit", delivered: "Delivered",
  declined: "Declined", withdrawn: "Withdrawn", expired: "Expired",
};

/* an offer is only good for so long, or haggling never ends */
const OFFER_MINUTES = 60;
const MAX_COUNTERS = 5;

const parcelId = () => "p" + (++S.seq);
const parcel = id => (S.parcels || []).find(p => p.id === id);

/* ── boot space: a capacity of its own, never a stand-in for seats ────── */

function bootUsed(rideRef) {
  /* accepts a ride object or a ride id — a mixed-up call must never silently
     read 0kg, which is how a full boot gets double-sold */
  const id = rideRef && typeof rideRef === "object" ? rideRef.id : rideRef;
  return (S.parcels || [])
    .filter(p => p.rideId === id && ["agreed", "accepted", "booked", "collected", "in_transit"].includes(p.status))
    .reduce((n, p) => n + Number(p.weightKg || 0), 0);
}
const bootTotal = r => Number(r.bootCapacityKg == null ? 50 : r.bootCapacityKg);
const bootLeft = r => Math.max(0, bootTotal(r) - bootUsed(r.id));

/* Parcels never decrement seats; passengers never decrement boot. */
const parcelsOn = r => (S.parcels || []).filter(p => p.rideId === r.id && !["withdrawn", "declined", "expired", "delivered"].includes(p.status));

/* capacity line the driver reads before deciding */
const capacityLine = r => `${seatsOpen(r)} seat${seatsOpen(r) === 1 ? "" : "s"} left · ${bootLeft(r)}kg boot left`;

/* ── the rate suggestion: weight x the driver's own rate per kg ────────── */
function suggestCarriage(p, r) {
  const rate = Number((r && r.ratePerKg) || p.ratePerKg || 12);
  return Math.round(Number(p.weightKg || 0) * rate);
}

/* ── threads: free text chats, but only typed events can set a price ──── */

function parcelThread(p) {
  if (!S.threads) S.threads = [];
  let t = S.threads.find(x => x.parcelId === p.id);
  if (!t) {
    t = { id: "t" + (++S.seq), parcelId: p.id, msgs: [], lockedPrice: null, counters: 0 };
    S.threads.push(t);
  }
  return t;
}

function parcelSay(p, role, kind, body, amount) {
  const t = parcelThread(p);
  const exp = new Date(Date.now() + OFFER_MINUTES * 60000).toISOString();
  const m = {
    id: "m" + (++S.seq), role, kind, body: body || "", at: new Date().toISOString(),
    amount: amount == null ? null : Number(amount),
    expiresAt: (kind === "offer" || kind === "counter") ? exp : null,
  };
  t.msgs.push(m);

  if (kind === "offer" || kind === "counter") {
    p.status = "negotiating";
    p.offeredPrice = m.amount;
    p.offerExpiresAt = exp;
    p.lastOfferBy = role;
    if (kind === "counter") t.counters = (t.counters || 0) + 1;
    /* only the *other* side may accept the latest offer */
    p.offerOpen = true;
  }
  if (kind === "accept") {
    /* accepting the other side's latest offer locks that figure in */
    p.status = "agreed";
    p.agreedPrice = p.offeredPrice;
    p.offerOpen = false;
    t.lockedPrice = p.agreedPrice;
  }
  if (kind === "decline") {
    p.offeredPrice = null;
    p.offerOpen = false;
    p.status = "negotiating";
  }
  p.updatedAt = new Date().toISOString();
  save();
  return m;
}

/* an expired offer can never be accepted — checked, not assumed */
function offerLive(p) {
  if (!p.offerOpen || !p.offerExpiresAt) return false;
  return new Date(p.offerExpiresAt).getTime() > Date.now();
}

/* the driver commits to the job, separately from agreeing the number */
function driverAccept(p) {
  if (p.status !== "agreed") return { ok: false, why: "Agree a price first" };
  const r = ride(p.rideId);
  if (r && Number(p.weightKg) > bootLeft(r) + Number(p.weightKg)) {
    return { ok: false, why: `Only ${bootLeft(r)}kg boot space left on this ride` };
  }
  p.status = "accepted";
  p.acceptedAt = new Date().toISOString();
  save();
  return { ok: true };
}

/* ── weight is what decides whether it fits; size is advisory ──────────── */
function fitsBoot(p, r) {
  const left = bootLeft(r) + (p.status === "agreed" ? 0 : 0);
  return Number(p.weightKg || 0) <= left;
}

/* ── landing draft: never ask twice ────────────────────────────────────── */
function draft() {
  if (!S.bookingDraft) {
    S.bookingDraft = {
      mode: "passenger", pickup: "", destination: "", when: "today", slot: "",
      seats: "1", luggage: "hand", pickupDate: "", pickupTime: "",
      weightKg: "", size: "small", description: "", updatedAt: null,
    };
  }
  return S.bookingDraft;
}
function draftSet(patch) {
  const d = draft();
  Object.assign(d, patch, { updatedAt: new Date().toISOString() });
  save();
  return d;
}
const draftHas = () => {
  const d = draft();
  return !!(d.pickup || d.destination || d.weightKg || d.description);
};
function draftClear() {
  S.bookingDraft = null;
  save();
}

/* ── a parcel request is created from the draft, with nothing re-asked ─── */
function parcelFromDraft() {
  const d = draft();
  if (!d.pickup || !d.destination) return null;
  const p = {
    id: parcelId(),
    senderName: S.me.name, senderPhone: S.me.phone,
    pickupAddress: d.pickup,
    destinationCity: d.destination,
    pickupDate: d.pickupDate || new Date().toISOString().slice(0, 10),
    pickupTime: d.pickupTime || (d.slot ? String(d.slot).padStart(2, "0") + ":00" : ""),
    weightKg: Number(d.weightKg || 0),
    sizeClass: d.size || "small",
    description: d.description || "",
    ratePerKg: 12,
    status: "requested",
    offeredPrice: null, agreedPrice: null,
    driverId: null, offerExpiresAt: null, offerOpen: false,
    counterCount: 0, bookingFeePaid: false, feeVersion: FEE_VERSION,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  if (!S.parcels) S.parcels = [];
  S.parcels.unshift(p);
  save();
  return p;
}

/* parcels a driver on this corridor would see */
function parcelInbox(r) {
  return (S.parcels || []).filter(p =>
    p.status === "requested" &&
    window.GOGOPlaces ? GOGOPlaces.same(p.destinationCity, r.to) || (r.stops || []).some(s => GOGOPlaces.same(s.city, p.destinationCity)) : p.destinationCity === r.to
  );
}

/* who owes whom, once a price is locked */
function parcelPayout(p) {
  if (p.agreedPrice == null) return null;
  const L = parcelLines(p.agreedPrice);
  return { platform: FEE_CONFIG.parcelBooking, driver: p.agreedPrice, sender: L.total, feeVersion: p.feeVersion };
}
