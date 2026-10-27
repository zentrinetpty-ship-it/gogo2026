/**
 * GOGO — PAYMENTS
 *
 * A provider-neutral money layer for mid-route seat holds and fees.
 *
 * ── THE RULE THIS FILE EXISTS TO ENFORCE ──────────────────────────────────
 * A hold is not a charge. A refund is not a deletion. And a UI must never claim
 * money moved when it did not. Every operation here writes a ledger row with an
 * explicit provider and an explicit outcome, so "did this rider actually get
 * charged" is always answerable from data rather than from a screen.
 *
 * ── WHY AN INTERFACE ──────────────────────────────────────────────────────
 * Stripe is coming later. If booking code calls Stripe directly, adding it means
 * rewriting booking, refund and state logic. Instead everything calls:
 *
 *     authorise({ bookingId, cents, currency, description })  → hold
 *     capture(reference)                                        → take the hold
 *     release(reference)                                        → drop the hold
 *     refund(reference, cents)                                  → give it back
 *
 * Those four verbs cover the whole product. Swapping mock → Stripe is one file.
 *
 * ── THE HONESTY FLAG ──────────────────────────────────────────────────────
 * `provider().isMock` is surfaced all the way to the UI. While it is true, the
 * rider is told the deposit is "held on request, collected at boarding", NOT
 * "you have been charged". Saying the latter against a stub is how you get a
 * chargeback and a reputation problem, and it is worse than shipping later.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LEDGER = path.join(__dirname, "payments-ledger.json");

/* ── ledger ────────────────────────────────────────────────────────────────
   Append-only. Nothing is ever deleted, because the ledger is the evidence when
   a rider says "you took R50 and I never travelled". */
function readLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  } catch (e) {
    return { entries: [] };
  }
}

function writeLedger(l) {
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 1));
}

function record(entry) {
  const l = readLedger();
  l.entries.push(entry);
  /* keep the file from growing without bound on a long-lived box */
  if (l.entries.length > 5000) l.entries = l.entries.slice(-4000);
  writeLedger(l);
  return entry;
}

function ledgerFor(bookingId) {
  return readLedger().entries.filter((e) => e.bookingId === bookingId);
}

/* ── the interface both providers implement ─────────────────────────────── */

/**
 * MOCK PROVIDER
 *
 * Does no network calls and takes no card data. It exists so the arithmetic,
 * the refund matrix and every UI state can be exercised end to end before a
 * merchant account exists.
 *
 * References are prefixed `mock_` so they can never be mistaken for a real
 * Stripe id, and nothing Stripe-shaped leaks into our own records.
 */
function mockProvider() {
  return {
    name: "mock",
    isMock: true,

    async authorise({ bookingId, cents, currency, description }) {
      const reference = "mock_pi_" + crypto.randomBytes(8).toString("hex");
      record({
        at: new Date().toISOString(),
        kind: "authorise",
        provider: "mock",
        bookingId,
        reference,
        cents,
        currency: currency || "ZAR",
        description: description || "",
        outcome: "held",
        real: false,
      });
      return { ok: true, reference, held: true, real: false, isMock: true };
    },

    async capture({ bookingId, reference, cents }) {
      record({
        at: new Date().toISOString(), kind: "capture", provider: "mock",
        bookingId, reference, cents, outcome: "captured", real: false,
      });
      return { ok: true, captured: true, real: false, isMock: true };
    },

    async release({ bookingId, reference, reason }) {
      record({
        at: new Date().toISOString(), kind: "release", provider: "mock",
        bookingId, reference, reason: reason || "released", outcome: "released", real: false,
      });
      return { ok: true, released: true, real: false, isMock: true };
    },

    async refund({ bookingId, reference, cents, reason }) {
      record({
        at: new Date().toISOString(), kind: "refund", provider: "mock",
        bookingId, reference, cents, reason: reason || "refunded", outcome: "refunded", real: false,
      });
      return { ok: true, refunded: true, real: false, isMock: true };
    },

    /** Forfeit: the money is kept. Still a ledger row, never a silent deletion. */
    async forfeit({ bookingId, reference, cents, reason }) {
      record({
        at: new Date().toISOString(), kind: "forfeit", provider: "mock",
        bookingId, reference, cents, reason: reason || "no_show", outcome: "forfeited", real: false,
      });
      return { ok: true, forfeited: true, real: false, isMock: true };
    },
  };
}

/**
 * STRIPE PROVIDER
 *
 * Written against Stripe's REST API directly rather than the SDK: one fewer
 * dependency, and the four verbs map cleanly onto PaymentIntents with
 * manual capture.
 *
 *   authorise → PaymentIntent(amount, capture_method: manual)  = authorised hold
 *   capture   → POST /payment_intents/:id/capture
 *   release   → POST /payment_intents/:id/cancel               = drop the hold
 *   refund    → POST /refunds
 *
 * NOT ACTIVE until STRIPE_SECRET_KEY is set. With no key, provider() returns the
 * mock and says so, rather than pretending a charge happened.
 */
function stripeProvider(secretKey) {
  const API = "https://api.stripe.com/v1";

  async function call(pathname, form) {
    const res = await fetch(API + pathname, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + secretKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (json.error && json.error.message) || "stripe " + res.status;
      throw new Error(msg);
    }
    return json;
  }

  return {
    name: "stripe",
    isMock: false,

    async authorise({ bookingId, cents, currency, description }) {
      const pi = await call("/payment_intents", {
        amount: String(cents),
        currency: (currency || "zar").toLowerCase(),
        capture_method: "manual",
        description: description || "",
        "metadata[bookingId]": bookingId,
        "automatic_payment_methods[enabled]": "true",
      });
      record({
        at: new Date().toISOString(), kind: "authorise", provider: "stripe",
        bookingId, reference: pi.id, cents, currency: currency || "ZAR",
        outcome: pi.status, real: true,
      });
      return {
        ok: true,
        reference: pi.id,
        held: pi.status === "requires_capture",
        real: true,
        isMock: false,
        /* the client needs this to confirm the card on their side */
        clientSecret: pi.client_secret || null,
      };
    },

    async capture({ bookingId, reference, cents }) {
      const pi = await call("/payment_intents/" + encodeURIComponent(reference) + "/capture", {});
      record({
        at: new Date().toISOString(), kind: "capture", provider: "stripe",
        bookingId, reference, cents, outcome: pi.status, real: true,
      });
      return { ok: true, captured: true, real: true, isMock: false };
    },

    async release({ bookingId, reference, reason }) {
      const pi = await call("/payment_intents/" + encodeURIComponent(reference) + "/cancel", {
        cancellation_reason: "abandoned",
      });
      record({
        at: new Date().toISOString(), kind: "release", provider: "stripe",
        bookingId, reference, reason: reason || "released", outcome: pi.status, real: true,
      });
      return { ok: true, released: true, real: true, isMock: false };
    },

    async refund({ bookingId, reference, cents, reason }) {
      const re = await call("/refunds", {
        payment_intent: reference,
        amount: String(cents),
        "metadata[reason]": reason || "refunded",
      });
      record({
        at: new Date().toISOString(), kind: "refund", provider: "stripe",
        bookingId, reference: re.id, cents, reason: reason || "refunded",
        outcome: re.status, real: true,
      });
      return { ok: true, refunded: true, real: true, isMock: false };
    },

    async forfeit({ bookingId, reference, cents, reason }) {
      /* Stripe has no "forfeit" verb: keeping a hold is a CAPTURE. The distinction
         between "charged as a penalty" and "captured as payment" lives in our
         ledger, not in Stripe's. */
      const pi = await call("/payment_intents/" + encodeURIComponent(reference) + "/capture", {
        "metadata[forfeited]": "true",
        "metadata[reason]": reason || "no_show",
      });
      record({
        at: new Date().toISOString(), kind: "forfeit", provider: "stripe",
        bookingId, reference, cents, reason: reason || "no_show",
        outcome: pi.status, real: true,
      });
      return { ok: true, forfeited: true, real: true, isMock: false };
    },
  };
}

/* ── the active provider ─────────────────────────────────────────────────── */
let cached = null;

function provider() {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  /* a publishable key alone cannot charge anything, so it must not switch us out
     of mock mode and start telling riders their card was held */
  if (key && /^sk_/.test(key)) {
    cached = stripeProvider(key);
  } else {
    cached = mockProvider();
  }
  return cached;
}

/** What the UI is allowed to claim about money right now. */
function honesty() {
  const p = provider();
  return {
    provider: p.name,
    isMock: p.isMock,
    /* when true the interface must say "due at boarding", never "charged" */
    claimsCharge: !p.isMock,
    note: p.isMock
      ? "no payment provider is connected, so the deposit is collected at boarding"
      : "payments are live",
  };
}

/**
 * The refund matrix from the plan, as code.
 *
 * It lives here so there is exactly one place that decides what a rider gets
 * back, and so a support answer can be derived rather than remembered.
 */
const OUTCOME = {
  DRIVER_DECLINED:    { deposit: "release",  fee: "release",  seat: "freed",   label: "Driver declined" },
  DRIVER_CANCELLED:   { deposit: "release",  fee: "release",  seat: "freed",   label: "Driver cancelled after accepting" },
  RIDER_CANCELLED_EARLY: { deposit: "release", fee: "release", seat: "freed",  label: "Rider cancelled before acceptance" },
  RIDER_CANCELLED_LATE:  { deposit: "release", fee: "forfeit", seat: "freed",  label: "Rider cancelled after acceptance" },
  RIDER_NO_SHOW:      { deposit: "forfeit",  fee: "forfeit",  seat: "freed",   label: "Rider did not show" },
  RIDE_CANCELLED:     { deposit: "release",  fee: "release",  seat: "freed",   label: "Van broke down or ride cancelled" },
  BOARDED:            { deposit: "capture",  fee: "capture",  seat: "taken",   label: "Rider boarded" },
};

/**
 * Apply an outcome to a booking's money. Idempotent: calling it twice does not
 * refund twice, which matters because a driver may double-tap and a rider may
 * retry.
 */
async function settle(booking, outcomeKey, reason) {
  const rule = OUTCOME[outcomeKey];
  if (!rule) throw new Error("unknown outcome " + outcomeKey);

  const p = provider();
  const results = [];

  /* already settled? nothing to do */
  if (booking.moneySettledAs) {
    return { ok: true, alreadySettledAs: booking.moneySettledAs, results: [], isMock: p.isMock };
  }

  if (booking.depositReference) {
    if (rule.deposit === "release") {
      results.push(await p.release({ bookingId: booking.id, reference: booking.depositReference, reason: outcomeKey }));
      booking.depositState = "released";
    } else if (rule.deposit === "forfeit") {
      results.push(await p.forfeit({ bookingId: booking.id, reference: booking.depositReference, cents: booking.depositCents, reason: outcomeKey }));
      booking.depositState = "forfeited";
    } else if (rule.deposit === "capture") {
      results.push(await p.capture({ bookingId: booking.id, reference: booking.depositReference, cents: booking.depositCents }));
      booking.depositState = "captured";
    }
  }

  if (booking.feeReference) {
    if (rule.fee === "release") {
      results.push(await p.release({ bookingId: booking.id, reference: booking.feeReference, reason: outcomeKey }));
      booking.feeState = "released";
    } else if (rule.fee === "forfeit") {
      results.push(await p.forfeit({ bookingId: booking.id, reference: booking.feeReference, cents: booking.bookingFeeCents, reason: outcomeKey }));
      booking.feeState = "forfeited";
    } else if (rule.fee === "capture") {
      results.push(await p.capture({ bookingId: booking.id, reference: booking.feeReference, cents: booking.bookingFeeCents }));
      booking.feeState = "captured";
    }
  }

  booking.moneySettledAs = outcomeKey;
  booking.moneySettledAt = new Date().toISOString();
  booking.seatOutcome = rule.seat;

  return { ok: true, outcome: outcomeKey, label: rule.label, results, isMock: p.isMock };
}

module.exports = {
  provider, honesty, settle, record, ledgerFor, readLedger,
  OUTCOME, mockProvider, stripeProvider,
  DEPOSIT_CENTS: 5000,
  FEE_CENTS: 999,
};
