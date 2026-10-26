/* =========================================================================
   GOGO — Payments UI
   Method choice at booking, the R5 shown as a line item, a mock card sheet
   (no real card data is ever entered), passenger receipts, and the driver's
   earnings + monthly statement showing card money versus payout.
   ========================================================================= */

const GOGOPayUI = (() => {
  const M = () => GOGOPay.money;
  const M2 = () => GOGOPay.money2;

  /* ── method choice + breakdown inside the join form ───────────────────── */
  function renderChoice(form, ride) {
    if (!form || form.querySelector("#payChoice")) return;
    const state = { method: "card" };

    const wrap = document.createElement("div");
    wrap.id = "payChoice";
    wrap.className = "g-mt-sm";
    wrap.innerHTML = `
      <span class="g-label">How will you pay?</span>
      <div class="g-pay-methods g-mt-sm" role="radiogroup" aria-label="Payment method">
        <button type="button" class="g-pay active" data-m="card">
          <span class="g-ic g-ic-sm" aria-hidden>${GICON("card")}</span>
          <div><div class="g-t">Card</div><div class="g-list-s">Charged in the app</div></div>
        </button>
        <button type="button" class="g-pay" data-m="cash">
          <span class="g-ic g-ic-sm" aria-hidden>card</span>
          <div><div class="g-t">Cash</div><div class="g-list-s">Pay the driver on boarding</div></div>
        </button>
      </div>
      <div class="g-breakdown g-mt-sm" id="payBreakdown"></div>
      <p class="g-s-sm g-mt-sm" id="payNote"></p>`;

    const submit = form.querySelector("button[type=submit]");
    form.insertBefore(wrap, submit);

    function paint() {
      const stops = ride.stops.find(s => s.city === (form.querySelector("#jOff") || {}).value);
      const fare = stops ? stops.fare : ride.fare;
      const seats = Number((form.querySelector("#jSeats") || {}).value || 1);
      const bd = GOGOPay.breakdown(fare * seats, state.method, seats);
      const seatWord = seats === 1 ? "" : ` × ${seats}`;
      $('#payBreakdown').innerHTML = `
        <div class="g-bd-row"><span>Fare${seatWord}</span><b>${M2()(bd.fare)}</b></div>
        <div class="g-bd-row"><span>Pickup fee${seatWord}</span><b>${M2()(bd.pickup)}</b></div>
        <div class="g-bd-row"><span>Platform fee${seatWord}</span><b>${M2()(bd.fee)}</b></div>
        <div class="g-bd-row total"><span>${state.method === "card" ? "Charged to your card" : "Cash to the driver"}</span><b>${M2()(state.method === "card" ? bd.cardTotal : bd.cash)}</b></div>`;
      $('#payNote').innerHTML = state.method === "card"
        ? "Your card is authorised now and only captured when the trip completes. Cancel more than 2 hours before departure and nothing is charged."
        : "On a cash seat you hand the driver the fare plus both fees on boarding. The driver carries those fees for the platform, and they are recovered from their side when the trip settles, so the fees are collected once and never twice.";
      $$(".g-pay").forEach(b => b.classList.toggle("active", b.dataset.m === state.method));
    }

    /* The seat and drop-off selects are owned by the join form's own fare
       breakdown (gogo.js). Binding paint() here used to overwrite that handler,
       which is why changing seats stopped re-pricing. The pay panel only
       repaints when the payment method changes. */
    wrap.querySelectorAll(".g-pay").forEach(b => b.onclick = () => {
      state.method = b.dataset.m;
      paint();
      if (state.method === "card") cardSheet();
    });
    paint();

    form.addEventListener("submit", e => {
      if (state.method === "card" && !form.dataset.cardReady) {
        const card = (S.cards || [])[0];
        if (!card) { e.preventDefault(); e.stopImmediatePropagation(); cardSheet(); return; }
      }
      form.dataset.method = state.method;
    }, true);

    form.dataset.method = state.method;
    form.__paintPay = paint;
    form.__getMethod = () => state.method;
  }

  /* mock card sheet — deliberately collects nothing sensitive */
  function cardSheet() {
    if (document.querySelector("#cardSheet")) return;
    const existing = (S.cards || [])[0];
    const sheet = document.createElement("div");
    sheet.className = "g-sheet"; sheet.id = "cardSheet";
    sheet.innerHTML = `
      <div class="g-sheet-card" style="max-width:420px">
        <div class="g-between" style="margin-bottom:12px">
          <div><span class="g-label">Payment</span><div class="g-t g-mt-sm">How you pay</div></div>
          <span class="g-stamp g-stamp-open">cash today</span>
        </div>
        <div class="g-card g-card-dark" style="padding:16px">
          <div class="g-label">Card on file</div>
          <div class="g-kpi-val g-mt-sm" style="font-size:var(--t-xl)">${existing ? "•••• •••• •••• " + existing.last4 : "•••• •••• •••• 4242"}</div>
          <div class="g-list-s" style="margin-top:6px">${existing ? existing.brand + " · saved " + new Date(existing.at).toLocaleDateString([], { day: "numeric", month: "short" }) : "Visa · expires 04/29"}</div>
        </div>
        <p class="g-s g-mt-sm">Every seat is paid in cash to the driver. Card payments switch on with the GOGO payment provider, and this sheet then becomes the provider's own secure card field, so card details never reach GOGO.</p>
        <div class="g-row g-mt">
          <button class="g-btn g-btn-ink" id="useCard" type="button"><span aria-hidden>${GICON("check")}</span> Keep card on file</button>
          <button class="g-btn g-btn-outline" id="cardCancel" type="button">Not now</button>
        </div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector("#useCard").onclick = () => {
      if (!S.cards) S.cards = [];
      if (!S.cards.length) S.cards.push({ brand: "Visa", last4: "4242", at: new Date().toISOString(), token: "pm_mock_" + Math.random().toString(36).slice(2, 10) });
      save();
      const form = document.querySelector("#joinForm");
      if (form) { form.dataset.cardReady = "1"; if (form.__paintPay) form.__paintPay(); }
      sheet.remove();
      toast("<b>Test card saved</b> · ending 4242");
    };
    sheet.querySelector("#cardCancel").onclick = () => sheet.remove();
  }

  /* ── passenger receipt on the rider page ─────────────────────────────── */
  function renderReceipt(host, ride, booking) {
    if (!host || !booking) return;
    const label = { authorised: "Authorised · charged when the trip completes", captured: "Paid", cash_pending: "Pay the driver in cash", refunded: "Refunded", disputed: "In dispute" };
    const stamp = { authorised: "g-stamp-open", captured: "g-stamp-full", cash_pending: "g-stamp-idle", refunded: "g-stamp-ink", disputed: "g-stamp-ink" };
    const card = document.createElement("div");
    card.className = "g-card g-mt";
    card.innerHTML = `
      <div class="g-head"><span class="g-label">Your payment</span><span class="g-stamp ${stamp[booking.paymentState] || "g-stamp-idle"}">${booking.paymentMethod === "card" ? "card" : "cash"}</span></div>
      <div class="g-bd-row"><span>Fare · ${booking.seats} seat${booking.seats === 1 ? "" : "s"}</span><b>${M2()(booking.fare)}</b></div>
      <div class="g-bd-row"><span>Platform booking fee</span><b>${M2()(booking.fee)}</b></div>
      <div class="g-bd-row total"><span>${booking.paymentMethod === "card" ? "On your card" : "Cash to driver"}</span><b>${M2()(booking.paymentMethod === "card" ? booking.fare + booking.fee : booking.fare)}</b></div>
      <div class="g-list-row g-mt-sm"><span class="g-ic g-ic-sm" aria-hidden>${booking.paymentMethod === "card" ? "💳" : "card"}</span>
        <div><div class="g-list-t">${label[booking.paymentState] || booking.paymentState}</div>
          <div class="g-list-s">${booking.intentId ? "Reference " + booking.intentId : "No card reference · cash booking"}</div></div></div>
      ${ride && ride.safe && ride.safe[booking.phone] ? `<p class="g-s-sm g-mt-sm">Safe confirmed. Nothing further is charged.</p>` : ""}`;
    host.appendChild(card);
  }

  /* ── driver earnings + statement ─────────────────────────────────────── */
  function renderEarnings(host, ride) {
    if (!host || !ride) return;
    const driver = ride.driver;
    const accepted = (ride.requests || []).filter(q => q.status === "accepted");
    const myBookings = accepted.map(q => GOGOPay.entries().find(b => b.rideId === ride.id && b.qid === q.id)).filter(Boolean);
    const cardFares = myBookings.filter(b => b.paymentMethod === "card").reduce((n, b) => n + b.fare, 0);
    const cashFares = myBookings.filter(b => b.paymentMethod === "cash").reduce((n, b) => n + b.fare, 0);
    const fees = myBookings.filter(b => b.paymentState === "captured").length * GOGOPay.feeOf();
    const st = GOGOPay.statement(driver, 0);
    const debt = GOGOPay.cashFeeDebt(driver);
    const blocked = GOGOPay.isCashBlocked(driver);

    const card = document.createElement("div");
    card.className = "g-card g-mt";
    card.innerHTML = `
      <div class="g-head"><span class="g-label">Money · this ride</span><span class="g-stamp ${ride.status === "completed" ? "g-stamp-full" : "g-stamp-open"}">${ride.status}</span></div>`;
    host.appendChild(card);

    /* per-ride breakdown, only meaningful once bookings exist */
    card.insertAdjacentHTML("beforeend", `
      <div class="g-bd-row"><span>Card fares earned</span><b>${M2()(cardFares)}</b></div>
      <div class="g-bd-row"><span>Cash already in your hand</span><b>${M2()(cashFares)}</b></div>
      <div class="g-bd-row"><span>Platform fees (${myBookings.filter(b => b.paymentState === "captured").length} × ${GOGOPay.feeTxt()})</span><b>−${M2()(fees)}</b></div>
      <div class="g-bd-row total"><span>${ride.status === "completed" ? "Lands in your next payout" : "Provisional"}</span><b>${M2()(Math.max(0, cardFares - fees))}</b></div>
      ${cashFares ? `<p class="g-s-sm g-mt-sm">Keep the ${M()(cashFares)} cash — the fees on those seats come off the card side, so you never hand money back.</p>` : ""}
    `);

    const stmt = document.createElement("div");
    stmt.className = "g-card g-mt";
    stmt.innerHTML = `
      <div class="g-head"><span class="g-label">Statement · ${st.label}</span><span class="g-ic g-ic-sm" aria-hidden>${GICON("receipt")}</span></div>
      <div class="g-bd-row"><span>Card fares</span><b>${M2()(st.cardShare)}</b></div>
      <div class="g-bd-row"><span>Cash fares (kept by you)</span><b>${M2()(st.cashShare)}</b></div>
      <div class="g-bd-row"><span>Platform fees</span><b>−${M2()(st.fees)}</b></div>
      ${st.refunds ? `<div class="g-bd-row"><span>Refunds & chargebacks</span><b>−${M2()(st.refunds)}</b></div>` : ""}
      <div class="g-bd-row"><span>Brought forward</span><b>${M2()(st.bf)}</b></div>
      <div class="g-bd-row total"><span>Payout due</span><b>${M2()(st.closing)}</b></div>
      <div class="g-proof g-mt">
        <div><span class="g-label">Card money collected</span><div class="g-t">${M2()(st.cardShare + st.fees)}</div></div>
        <div><span class="g-label">Your payout</span><div class="g-t">${M2()(st.closing)}</div></div>
        <div><span class="g-label">Difference = fees + cash</span><div class="g-t">${M2()(st.cardShare + st.fees - st.closing)}</div></div>
      </div>
      <p class="g-s-sm g-mt-sm">The two numbers never match, by design: the R5s you owe on cash seats are taken off the card side. VAT on fees: ${M2()(st.feesExVat)} + ${M2()(st.vat)} VAT = ${M2()(st.fees)}.</p>
      <div class="g-row g-mt">
        <button class="g-btn g-btn-outline g-btn-sm" id="printStmt" type="button">Save statement</button>
        <a class="g-btn g-btn-ghost g-btn-sm" href="ops">Ops view</a>
      </div>`;

    /* the cash-fee receivable, so it is never a surprise */
    if (cashFares || debt) {
      stmt.insertAdjacentHTML("beforeend", `
        <div class="g-safe g-mt" style="border-color:${blocked ? "rgba(192,57,43,.45)" : "rgba(141,182,0,.5)"};background:${blocked ? "rgba(192,57,43,.06)" : "var(--lime-wash)"}">
          <div class="g-t">${blocked ? "Cash bookings paused" : "Cash fee balance"}</div>
          <div class="g-list-s">You owe GOGO ${M2()(debt)} in booking fees for cash seats. It is taken off your next card payout${blocked ? `. Past the ${M()(GOGOPay.cfg().negThreshold)} threshold, so new cash bookings are paused until it clears — you can still take card bookings.` : "."}</div>
        </div>`);
    }

    host.appendChild(stmt);
    const p = stmt.querySelector("#printStmt");
    if (p) p.onclick = () => { window.print(); };
  }

  /* any request without a booking (seeded, or created before payments existed)
     gets one, so every seat on the ledger is accounted for */
  function hydrate() {
    S.rides.forEach(r => (r.requests || []).forEach(q => {
      if (!GOGOPay.entries().find(b => b.rideId === r.id && b.qid === q.id)) GOGOPay.bookingFor(r, q);
    }));
  }

  function boot() {
    const page = document.body.dataset.page;
    try { hydrate(); } catch (e) { console.warn("booking hydrate failed", e); }

    if (page === "ride") {
      const id = new URLSearchParams(location.search).get("id");
      const ride = S.rides.find(r => r.id === id);
      const form = document.querySelector("#joinForm");
      if (ride && form) renderChoice(form, ride);
    }

    if (page === "rider") {
      const my = [];
      S.rides.forEach(r => (r.requests || []).forEach(q => { if (q.phone === S.me.phone && q.status !== "declined") my.push({ r, q }); }));
      const live = my.find(x => x.q.status === "accepted") || my[0];
      if (live) {
        const b = GOGOPay.entries().find(x => x.rideId === live.r.id && x.qid === live.q.id);
        if (b) renderReceipt(document.querySelector("#main .g-8"), live.r, b);
      }
    }

    if (page === "driver") {
      const ride = S.rides.find(x => x.driver === "Sipho M." || (x.requests || []).some(q => q.status !== "declined")) || S.rides[0];
      renderEarnings(document.querySelector("#main .g-5"), ride);
    }
  }

  return { boot, hydrate, renderChoice, cardSheet, renderReceipt, renderEarnings };
})();

window.GOGOPayUI = GOGOPayUI;
document.addEventListener("DOMContentLoaded", () => { try { GOGOPayUI.boot(); } catch (e) { console.error("GOGOPayUI boot failed", e); } });
