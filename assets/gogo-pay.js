/* =========================================================================
   GOGO — Payments & settlement (Phase 0: mock provider, real arithmetic)
   • R5 platform fee per completed booking, card or cash (R10 once GOGO is known)
   • Card: fare + R5 authorised at booking, captured when the ride completes
   • Cash: passenger pays the driver; the R5 becomes a driver receivable
   • Driver payout = card fares − EVERY fee (card and cash) − adjustments − carried balance
   • Balances are DERIVED from an append-only ledger, never stored as a number
   No real card data is ever collected here: the provider is mocked.
   ========================================================================= */

const GOGOPay = (() => {
  const r2 = n => Math.round(n * 100) / 100;
  const money = n => (n < 0 ? "−R" : "R") + Math.abs(r2(n)).toFixed(2).replace(/\.00$/, "");
  const money2 = n => (n < 0 ? "−R" : "R") + Math.abs(r2(n)).toFixed(2);

  /* ── the booking fee ───────────────────────────────────────────────────────
     ONE knob. Launch rate is R5; raise it to R10 once GOGO is known. Changing it
     means two edits: FEE_DEFAULT, and FEE_VERSION + 1. The version matters because
     the config is persisted per browser — without it, anyone who has used the app
     before keeps being charged the old rate. */
  const FEE_DEFAULT = 5;        // rands, per completed booking
  const FEE_VERSION = 1;        // bump this every time FEE_DEFAULT changes

  function cfg() {
    if (!S.payConfig) S.payConfig = {
      fee: FEE_DEFAULT,
      feeVersion: FEE_VERSION,
      vatInclusive: true, vatRate: 0.15,
      pspPct: 0.029, pspFixed: 2.00,      // card processing, absorbed by the platform
      settlement: "monthly",
      negThreshold: 500,
      authorisedHoldHours: 72,
    };
    if (S.payConfig.feeVersion !== FEE_VERSION) {
      S.payConfig.fee = FEE_DEFAULT;
      S.payConfig.feeVersion = FEE_VERSION;
      if (typeof save === "function") save();
    }
    return S.payConfig;
  }
  /* The fee the platform takes on a seat. FEE_CONFIG (gogo-parcel.js) is the
     one source of truth, so there is nothing to keep in sync here — this just
     reads it. The pickup fee is charged separately at booking. */
  const feeOf = () => (typeof FEE_CONFIG !== "undefined" ? FEE_CONFIG.platform : 9.99);
  const feeTxt = () => "R" + feeOf().toFixed(2);

  /* ── the ledger: append-only, the single source of truth ──────────────── */
  function ledger() { if (!S.ledger) S.ledger = []; return S.ledger; }
  function entries() { if (!S.bookings) S.bookings = []; return S.bookings; }
  function payments() { if (!S.payments) S.payments = []; return S.payments; }

  function post(entry) {
    const row = Object.assign({ id: "l" + Date.now() + Math.random().toString(16).slice(2, 5), at: new Date().toISOString(), statementId: null }, entry);
    ledger().push(row);
    save();
    return row;
  }

  /* amounts are always positive here; `sign` decides the direction */
  const KINDS = {
    fare_card: { party: "driver", sign: +1, label: "Card fare" },
    fare_cash: { party: "driver", sign: +1, label: "Cash fare (kept by driver)" },
    fee: { party: "driver", sign: -1, label: "Platform booking fee" },
    fee_charge: { party: "platform", sign: +1, label: "Platform booking fee (from card)" },
    fee_cash_collected: { party: "driver", sign: +1, label: "Booking fee collected in cash" },
    refund: { party: "driver", sign: -1, label: "Refund" },
    chargeback: { party: "driver", sign: -1, label: "Chargeback" },
    payout: { party: "driver", sign: -1, label: "Payout to driver" },
    adjust: { party: "driver", sign: +1, label: "Adjustment" },
  };

  /* ── price breakdown shown to the passenger ─────────────────────────────
     Both fees are charged per passenger, on either method.
     Card seat: the platform charges fare + pickup fee + platform fee.
     Cash seat: the passenger hands the driver all of it in cash — fare, pickup
     fee and platform fee. The driver carries the two fees for the platform and
     they are recovered from their side afterwards, so the platform is paid once
     and never twice. */
  function breakdown(fare, method, seats = 1) {
    const n = Math.max(1, Number(seats) || 1);
    const platform = r2(feeOf() * n);
    const pickup = r2((typeof FEE_CONFIG !== "undefined" ? FEE_CONFIG.pickup : 19.99) * n);
    const f = r2(fare);
    const total = r2(f + pickup + platform);
    if (method === "cash") {
      return { fare: f, pickup, fee: platform, fees: r2(pickup + platform), seats: n,
               total, cardTotal: 0, cash: total,
               line: "Hand the driver the fare plus both fees" };
    }
    return { fare: f, pickup, fee: platform, fees: r2(pickup + platform), seats: n,
             total, cardTotal: total, cash: 0, line: "Charged to your card" };
  }

  function vatOf(amount) {
    const c = cfg();
    if (!c.vatInclusive) return r2(amount * c.vatRate);
    return r2(amount - amount / (1 + c.vatRate));
  }

  /* ── authorise at booking (mock provider) ─────────────────────────────── */
  function authorise(booking) {
    if (booking.paymentMethod !== "card") {
      booking.paymentState = "cash_pending";
      save();
      return booking;
    }
    booking.paymentState = "authorised";
    booking.intentId = "pi_mock_" + Math.random().toString(36).slice(2, 12);
    booking.authAt = new Date().toISOString();
    booking.card = booking.card || { brand: "Visa", last4: "4242" };
    /* the card is authorised for everything the passenger owes: fare plus both
       fees, each charged per passenger */
    const n = Math.max(1, Number(booking.seats) || 1);
    const pickup = r2((typeof FEE_CONFIG !== "undefined" ? FEE_CONFIG.pickup : 19.99) * n);
    const platform = r2(feeOf() * n);
    const fees = r2(pickup + platform);
    payments().push({
      id: booking.intentId, bookingId: booking.id, provider: "mock",
      amount: r2(booking.fare + fees), feeAmount: fees, pickupAmount: pickup,
      state: "authorised", at: booking.authAt,
    });
    save();
    return booking;
  }

  /* ── capture when the ride completes ──────────────────────────────────── */
  function captureForRide(ride) {
    const done = entries().filter(b => b.rideId === ride.id && b.paymentState === "captured");
    if (done.length) return { captured: 0, already: true };

    const accepted = (ride.requests || []).filter(q => q.status === "accepted");
    let captured = 0;
    accepted.forEach(q => {
      const b = entries().find(x => x.rideId === ride.id && x.qid === q.id);
      if (!b || b.paymentState === "captured") return;

      /* The platform fee lands once per completed booking, never twice:
         • card seat  -> the passenger was charged fare + fee; the platform keeps the
                         fee from that charge and the driver keeps the whole fare.
         • cash seat  -> the passenger handed the driver fare + fee, so the driver is
                         holding the platform's fee. It is recovered from their
                         settlement (or invoiced at the end of the trip) so the
                         platform is paid once. */
      if (b.paymentMethod === "card") {
        const n = Math.max(1, Number(b.seats) || 1);
        const pickupN = r2((typeof FEE_CONFIG !== "undefined" ? FEE_CONFIG.pickup : 19.99) * n);
        post({ driver: ride.driver, rideId: ride.id, bookingId: b.id, kind: "fee_charge", amount: pickupN, label: "Pickup fee from card" });
        post({ driver: ride.driver, rideId: ride.id, bookingId: b.id, kind: "fee_charge", amount: feeOf() * n, label: "Platform fee from card" });
        post({ driver: ride.driver, rideId: ride.id, bookingId: b.id, kind: "fare_card", amount: b.fare, label: "Card fare" });
        const p = payments().find(x => x.id === b.intentId);
        if (p) { p.state = "captured"; p.capturedAt = new Date().toISOString(); }
        const c = cfg();
        b.pspFee = r2(b.fare * c.pspPct + c.pspFixed);       // platform absorbs this
      } else {
        /* the driver took fare + pickup fee + platform fee in cash; both fees are
           owed back to the platform */
        const pickupN = r2((typeof FEE_CONFIG !== "undefined" ? FEE_CONFIG.pickup : 19.99) * (b.seats || 1));
        post({ driver: ride.driver, rideId: ride.id, bookingId: b.id, kind: "fare_cash", amount: b.fare, label: "Cash fare kept by driver" });
        post({ driver: ride.driver, rideId: ride.id, bookingId: b.id, kind: "fee_cash_collected", amount: pickupN, label: "Pickup fee collected in cash" });
        post({ driver: ride.driver, rideId: ride.id, bookingId: b.id, kind: "fee", amount: pickupN, label: "Pickup fee owed to platform" });
        post({ driver: ride.driver, rideId: ride.id, bookingId: b.id, kind: "fee_cash_collected", amount: feeOf() * (b.seats || 1), label: "Platform fee collected in cash" });
        post({ driver: ride.driver, rideId: ride.id, bookingId: b.id, kind: "fee", amount: feeOf() * (b.seats || 1), label: "Platform fee owed to platform" });
      }
      b.paymentState = "captured";
      b.capturedAt = new Date().toISOString();
      captured++;
    });
    save();
    return { captured };
  }

  /* everything the passenger paid: fare plus both fees, per passenger */
  function grossFor(b) {
    const n = Math.max(1, Number(b.seats) || 1);
    const pickup = (typeof FEE_CONFIG !== "undefined" ? FEE_CONFIG.pickup : 19.99) * n;
    return r2(b.fare + pickup + feeOf() * n);
  }

  /* refunds and disputes */
  function refund(booking, reason) {
    const b = entries().find(x => x.id === booking.id) || booking;
    if (b.paymentMethod === "card") {
      const p = payments().find(x => x.id === b.intentId);
      if (p) { p.state = "refunded"; p.refundedAt = new Date().toISOString(); }
      post({ driver: b.driver, rideId: b.rideId, bookingId: b.id, kind: "refund", amount: grossFor(b), label: "Refund · " + (reason || "cancelled") });
    }
    b.paymentState = "refunded";
    b.refundReason = reason || "cancelled";
    save();
    return b;
  }

  function chargeback(booking) {
    const b = entries().find(x => x.id === booking.id) || booking;
    post({ driver: b.driver, rideId: b.rideId, bookingId: b.id, kind: "chargeback", amount: grossFor(b), label: "Chargeback · " + (b.id || "") });
    b.paymentState = "disputed";
    save();
    return b;
  }

  /* ── balances derived from the ledger ─────────────────────────────────── */
  function driverTotals(driver, fromISO, toISO) {
    const rows = ledger().filter(l => l.driver === driver && (!fromISO || l.at >= fromISO) && (!toISO || l.at <= toISO));
    const sum = k => r2(rows.filter(l => l.kind === k).reduce((n, l) => n + l.amount, 0));
    const grossCard = sum("fare_card");
    const grossCash = sum("fare_cash");
    /* Fees the driver owes the platform. On a cash seat the passenger handed the
       driver the fee, so it is money the driver is holding for us. */
    const fees = sum("fee");
    const feesCashHeld = sum("fee_cash_collected");
    const feesFromCharge = sum("fee_charge"); // card-seat fees, kept by the platform at the charge
    const platformFees = r2(fees + feesFromCharge);
    const cardMoneyCollected = r2(grossCard + feesFromCharge);
    const refunds = r2(sum("refund") + sum("chargeback"));
    const payouts = sum("payout");
    const adjust = sum("adjust");
    return {
      grossCard, grossCash, fees, feesCashHeld, feesFromCharge, platformFees, cardMoneyCollected, refunds, payouts, adjust,
      /* what this driver has earned, net of platform fees, cash included */
      earned: r2(grossCard + grossCash - fees - refunds + adjust),
      /* what the platform owes them (cash already in hand is identified, not paid again) */
      payoutDue: r2(grossCard - fees - refunds + adjust - payouts),
      /* the platform fee this driver is holding in cash and owes back to us */
      feeOwed: fees,
      gross: r2(grossCard + grossCash),
      cardShare: grossCard, cashShare: grossCash,
      rows,
    };
  }

  const driverBalance = driver => driverTotals(driver).payoutDue;
  const cashFeeDebt = driver => {
    const t = driverTotals(driver);
    return t.payoutDue < 0 ? r2(-t.payoutDue) : 0;
  };
  const isCashBlocked = driver => cashFeeDebt(driver) >= cfg().negThreshold;

  /* ── statements (the monthly invoice) ─────────────────────────────────── */
  function periodFor(offset = 0) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59);
    const start = new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0);
    return { start, end, label: end.toLocaleDateString([], { month: "long", year: "numeric" }) };
  }

  function statement(driver, offset = 0) {
    const { start, end, label } = periodFor(offset);
    const t = driverTotals(driver, start.toISOString(), end.toISOString());
    const prior = driverTotals(driver, null, new Date(start.getTime() - 1).toISOString());
    const bf = prior.payoutDue;
    return Object.assign({}, t, {
      driver, label, start, end, bf,
      closing: r2(bf + t.payoutDue),
      vat: vatOf(t.fees),
      feesExVat: r2(t.fees - vatOf(t.fees)),
      completed: entries().filter(b => b.driver === driver && b.paymentState === "captured").length,
    });
  }

  function allDrivers() {
    const set = new Set(ledger().map(l => l.driver).filter(Boolean));
    S.rides.forEach(r => { if (r.driver) set.add(r.driver); });
    return Array.from(set);
  }

  function reconciliation() {
    const platformFees = r2(ledger().filter(l => l.kind === "fee" || l.kind === "fee_charge").reduce((n, l) => n + l.amount, 0));
    const feesFromCharge = r2(ledger().filter(l => l.kind === "fee_charge").reduce((n, l) => n + l.amount, 0));
    const feesFromDrivers = r2(ledger().filter(l => l.kind === "fee").reduce((n, l) => n + l.amount, 0));
    const cardCaptured = r2(payments().filter(p => p.state === "captured").reduce((n, p) => n + p.amount, 0));
    /* On a cash seat the passenger hands over fare + fee, so both are cash the
       driver is holding — the fee included, because the platform is owed it. */
    const cashKept = r2(ledger().filter(l => l.kind === "fare_cash" || l.kind === "fee_cash_collected").reduce((n, l) => n + l.amount, 0));
    const owedToDrivers = r2(allDrivers().reduce((n, d) => n + Math.max(0, driverBalance(d)), 0));
    const owedToPlatform = r2(allDrivers().reduce((n, d) => n + Math.max(0, -driverBalance(d)), 0));
    const pspFees = r2(entries().reduce((n, b) => n + (b.pspFee || 0), 0));
    /* money in (card captured + cash collected) = driver take-home + platform fees
       + whatever cash fee the drivers still owe back. */
    const cashFeesHeld = r2(ledger().filter(l => l.kind === "fee_cash_collected").reduce((n, l) => n + l.amount, 0));
    const driverTake = r2(allDrivers().reduce((n, d) => n + driverTotals(d).earned, 0));
    const moneyIn = r2(cardCaptured + cashKept);
    return { platformFees, feesFromCharge, feesFromDrivers, cardCaptured, cashKept, cashFeesHeld, owedToDrivers, owedToPlatform, pspFees,
             driverTake, moneyIn, invariantHolds: Math.abs(r2(driverTake + platformFees + cashFeesHeld) - moneyIn) < 0.01,
             netPlatform: r2(platformFees - pspFees) };
  }

  /* ── booking record for a ride request ────────────────────────────────── */
  function bookingFor(ride, request) {
    let b = entries().find(x => x.rideId === ride.id && x.qid === request.id);
    if (!b) {
      b = {
        id: "b" + Date.now() + Math.random().toString(16).slice(2, 5),
        qid: request.id, rideId: ride.id, driver: ride.driver,
        passenger: request.name, phone: request.phone,
        seats: request.seats, fare: r2(request.fare), fee: feeOf(),
        paymentMethod: request.paymentMethod || "card",
        paymentState: "none", createdAt: new Date().toISOString(),
      };
      entries().push(b);
      /* the fee is an authorisation only until the ride completes */
      authorise(b);
      save();
    }
    return b;
  }

  return { cfg, feeOf, feeTxt, breakdown, vatOf, authorise, captureForRide, refund, chargeback,
           ledger, entries, payments, post, driverTotals, driverBalance, cashFeeDebt, isCashBlocked,
           statement, periodFor, allDrivers, reconciliation, bookingFor, money, money2 };
})();

window.GOGOPay = GOGOPay;
