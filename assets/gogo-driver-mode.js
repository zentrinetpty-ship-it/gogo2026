/**
 * GOGO — DRIVER MODE
 *
 * The other half of the app. A rider and a driver are the same account with a
 * different view, so the switch lives on the dashboard rather than in a separate
 * app — one number, one history, one place to look.
 *
 * WHAT A DRIVER NEEDS, IN THE ORDER THEY NEED IT
 *   1. am I earning?            balance + today's takings
 *   2. what am I running?       listings with load factor, who is booked
 *   3. get paid                  withdraw, with the rules stated plainly
 *   4. is it working?           load factor, revenue trend, best route
 *
 * A dashboard that leads with a chart before showing the balance is a dashboard
 * written by someone who has never needed the money.
 *
 * ── WHY EVERY NUMBER COMES FROM THE SERVER ────────────────────────────────
 * The client never computes a balance. Money arithmetic in two places is two
 * answers to the same question, and the one the driver believes will be the
 * larger. The server owns the ledger; this file only renders it.
 */
(function () {
  "use strict";

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const R = (n) => "R" + Number(n || 0).toFixed(2);

  function token() {
    try { return localStorage.getItem("gogo_token") || ""; } catch (e) { return ""; }
  }

  async function api(path, opts) {
    const t = token();

    /* ── a request that never finishes is a screen that never loads ─────────
       fetch() has no default timeout. If the tunnel stalls, a train goes into a
       cutting, or the API is mid-restart, the promise simply never settles and
       the driver stares at "Loading your driver account…" forever with no
       reload button and no error. That is the "hangs and nothing works" report,
       and it is not a rendering problem — it is a missing timeout.

       AbortController turns a silent forever-wait into a failure the UI can
       report and offer a retry for. Ten seconds is generous for a JSON GET on a
       phone and short enough that nobody gives up first. */
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);

    try {
      const res = await fetch("/api" + path, Object.assign({
        headers: Object.assign(
          { "Content-Type": "application/json" },
          t ? { Authorization: "Bearer " + t } : {}
        ),
        signal: ctrl.signal,
      }, opts || {}));

      let j = {};
      try { j = await res.json(); } catch (e) { j = {}; }
      return { ok: res.ok && j.ok !== false, status: res.status, data: j };
    } catch (e) {
      /* an abort is a timeout, not a network error — say so, because "check your
         connection" when the connection is fine is a lie the driver cannot act
         on */
      const timedOut = e && e.name === "AbortError";
      return {
        ok: false,
        status: 0,
        data: {
          error: timedOut
            ? "That took too long. Check your signal and try again."
            : "Could not reach GOGO. Check your connection.",
        },
        timedOut,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── mode persistence ─────────────────────────────────────────────────────
     Remembered per account so a driver who mostly drives does not have to switch
     every time they open the app. Stored on the device, not the account: the
     same person may want passenger mode on their own phone and driver mode on
     the one bolted to the dashboard. */
  function getMode() {
    try { return localStorage.getItem("gogo_mode") === "driver" ? "driver" : "passenger"; }
    catch (e) { return "passenger"; }
  }
  function setMode(m) {
    try { localStorage.setItem("gogo_mode", m); } catch (e) {}
  }

  /* ── icons ─────────────────────────────────────────────────────────────── */
  const I = {
    van: '<svg viewBox="0 0 44 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 19.4V9.6c0-1 .5-1.9 1.4-2.4L9.6 4.6c.5-.3 1.1-.4 1.7-.4h20.9c.6 0 1.2.2 1.6.6l4.4 3.7c.5.4.8 1 .8 1.6v9.3"/><path d="M3.2 19.4h38.6"/><circle cx="11.4" cy="20.2" r="2.7"/><circle cx="33.4" cy="20.2" r="2.7"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.4" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="M13 6.5 18.5 12 13 17.5"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.8" y="6.2" width="18.4" height="11.6" rx="2.2"/><circle cx="12" cy="12" r="2.6"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.2V4.8"/><path d="M4 19.2h16"/><path d="M8.4 19.2v-5.6"/><path d="M13 19.2V9.2"/><path d="M17.6 19.2v-3.4"/></svg>',
    seat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v9a2 2 0 0 0 2 2h9"/><path d="M6 19h12"/><path d="M15 11v6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  /* ══ the mode switch ═══════════════════════════════════════════════════ */
  function switchHtml(mode) {
    return `
      <div class="gmode" role="tablist" aria-label="Mode">
        <button class="gmode-b${mode === "passenger" ? " on" : ""}" role="tab"
                aria-selected="${mode === "passenger"}" data-mode="passenger" type="button">
          ${I.user}<span>Passenger</span>
        </button>
        <button class="gmode-b${mode === "driver" ? " on" : ""}" role="tab"
                aria-selected="${mode === "driver"}" data-mode="driver" type="button">
          ${I.van}<span>Driver</span>
        </button>
      </div>`;
  }

  /* ══ balance detail ════════════════════════════════════════════════════
     The card shows four numbers. A driver who taps it wants to know how those
     numbers were arrived at and what is coming, so this sheet states the
     arithmetic plainly instead of hiding it behind trust.
   */
  function openBalance(d, onDone) {
    const sheet = getSheet();
    const b = d.balance || {};
    const an = d.analytics || {};
    const ws = (d.withdrawals || []).filter(w => w.status !== "paid");

    sheet.host.innerHTML = `
      <div class="gwd gride">
        <h2 class="gwd-h">Your money</h2>
        <p class="gwd-avail">${esc(b.availablePretty || "R0.00")} available to withdraw</p>

        <div class="gride-money">
          <div class="gride-mrow gride-mrow-total"><span>Available now</span><strong>${esc(b.availablePretty || "R0.00")}</strong></div>
          <div class="gride-mrow"><span>Earned in total</span><strong>${esc(b.earnedPretty || "R0.00")}</strong></div>
          <div class="gride-mrow"><span>On hold (${esc(String(b.holdHours || 24))}h)</span><strong>${esc(b.holdingPretty || "R0.00")}</strong></div>
          <div class="gride-mrow"><span>Reserved for withdrawals</span><strong>${esc(b.reservedPretty || "R0.00")}</strong></div>
          <div class="gride-mrow gride-mrow-neg"><span>Already paid out</span><strong>${esc(b.paidOutPretty || "R0.00")}</strong></div>
        </div>

        <p class="gwd-note">
          GOGO takes ${esc(String(an.commissionPct || 12))}% of every completed seat. Money from a
          finished trip becomes withdrawable ${esc(String(b.holdHours || 24))} hours later, so a
          refund can still be honoured. The minimum withdrawal is ${esc(b.minimumPretty || "R100")}.
        </p>

        ${ws.length ? `
          <div class="gride-sec">
            <span class="grdr-k">Withdrawals waiting</span>
            ${ws.map(w => `
              <div class="gride-person">
                <span class="gride-pn">
                  <span class="gride-pname">${esc(w.amountPretty)} · ${esc(String(w.method).toUpperCase())}</span>
                  <span class="gride-pst">Requested ${esc(String(w.requestedAt || "").slice(0, 10))}</span>
                </span>
                <span class="gride-pa">${esc(w.status)}</span>
              </div>`).join("")}
          </div>` : ""}

        ${b.canWithdraw ? '<button class="gwd-btn" id="grideW" type="button">Withdraw</button>' : ""}
      </div>`;

    const w = sheet.host.querySelector("#grideW");
    if (w) w.addEventListener("click", () => { sheet.hide(); openWithdraw(b, onDone); });

    sheet.show();
  }

  /* ══ analytics detail ══════════════════════════════════════════════════
     Load factor and seats sold are the two numbers that tell a driver whether
     the route is working. This sheet adds the temporal view the card cannot:
     which days earn, which routes earn, and what that means in rand per seat.
   */
  function openStats(d, onDone) {
    const sheet = getSheet();
    const an = d.analytics || {};
    const trend = an.trend || [];
    const max = Math.max(...trend.map(t => t.cents), 1);

    sheet.host.innerHTML = `
      <div class="gwd gride">
        <h2 class="gwd-h">How you are doing</h2>
        <p class="gwd-avail">${esc(String(an.ridesListed || 0))} rides · ${esc(String(an.seatsSold || 0))} seats sold</p>

        <div class="gride-grid">
          <div><span class="grdr-k">Load factor</span><span class="gride-v">${esc(String(an.loadPct || 0))}%</span></div>
          <div><span class="grdr-k">Revenue</span><span class="gride-v">${esc(an.netPretty || "R0.00")}</span></div>
          <div><span class="grdr-k">Per seat</span><span class="gride-v">${esc(an.avgFarePretty || R(0))}</span></div>
          <div><span class="grdr-k">Rating</span><span class="gride-v">${Number(an.rating || 0).toFixed(1)}</span></div>
        </div>

        ${trend.length > 1 ? `
          <div class="gride-sec">
            <span class="grdr-k">Earnings by day</span>
            <div class="gdr-trend" style="margin-top:10px">
              ${trend.map(t => `<div class="gdr-bar-col" title="${esc(t.day)}: ${R(t.cents / 100)}">
                <i style="height:${Math.max(4, Math.round((t.cents / max) * 48))}px"></i></div>`).join("")}
            </div>
          </div>` : ""}

        ${an.routes && an.routes.length ? `
          <div class="gride-sec">
            <span class="grdr-k">By route</span>
            ${an.routes.map(r => `
              <div class="gride-person">
                <span class="gride-pn">
                  <span class="gride-pname">${esc(r.route)}</span>
                  <span class="gride-pst">${esc(String(r.seats))} seats</span>
                </span>
                <span class="gride-pa">${esc(r.netPretty)}</span>
              </div>`).join("")}
          </div>` : ""}

        <p class="gwd-note">
          Load factor is seats sold divided by seats offered. Below about 50% the
          route is not paying for the trip; a full van is the only way a minibus
          makes money.
        </p>
      </div>`;

    sheet.show();
  }

  /* ══ onboarding — a driver cannot list until this is done ═════════════ */
  function onboardingHtml() {
    return `
      <section class="gdr-on" data-anim="1">
        <h1 class="gdr-h1">Start driving with GOGO</h1>
        <p class="gdr-sub">Tell us about your van once, then list as many rides as you like.
           Riders see your name, vehicle and plate before they book.</p>

        <form class="gdr-form" id="gdrRegForm" novalidate>
          <label class="gdr-f">
            <span class="gdr-l">Your name</span>
            <input class="gdr-i" name="name" autocomplete="name" placeholder="Sipho Mthethwa" required>
            <em class="gdr-e" data-e="name"></em>
          </label>
          <label class="gdr-f">
            <span class="gdr-l">Vehicle</span>
            <input class="gdr-i" name="vehicle" placeholder="Toyota Quantum" required>
            <em class="gdr-e" data-e="vehicle"></em>
          </label>
          <div class="gdr-row2">
            <label class="gdr-f">
              <span class="gdr-l">Number plate</span>
              <input class="gdr-i" name="plate" placeholder="EC 4521" required>
              <em class="gdr-e" data-e="plate"></em>
            </label>
            <label class="gdr-f">
              <span class="gdr-l">Seats</span>
              <input class="gdr-i" name="seats" type="number" min="1" max="22" value="7" required>
              <em class="gdr-e" data-e="seats"></em>
            </label>
          </div>
          <label class="gdr-f">
            <span class="gdr-l">Driver licence number</span>
            <input class="gdr-i" name="licence" placeholder="L1234567" required>
            <em class="gdr-e" data-e="licence"></em>
          </label>
          <button class="gdr-btn gdr-btn-lime" type="submit">Save and continue</button>
        </form>
      </section>`;
  }

  /* ══ driver home ══════════════════════════════════════════════════════ */
  function driverHomeHtml(d) {
    const bal = d.balance || {};
    const an = d.analytics || {};
    const rides = d.rides || [];

    return `
      <section class="gdr-hero gdr-tap" data-anim="1" id="gdrBalanceCard" role="button" tabindex="0"
               aria-label="Money details">
        <span class="gdr-label">Available to withdraw<span class="gdr-more">Details</span></span>
        <div class="gdr-bal">
          <strong>${esc(bal.availablePretty || "R0.00")}</strong>
          ${bal.canWithdraw
            ? '<button class="gdr-withdraw" id="gdrWithdraw" type="button">Withdraw</button>'
            : `<span class="gdr-min">min ${esc(bal.minimumPretty || "R100")}</span>`}
        </div>
        <div class="gdr-split">
          <div><span class="gdr-k">Earned</span><span class="gdr-v">${esc(bal.earnedPretty || "R0.00")}</span></div>
          <div><span class="gdr-k">Pending release</span><span class="gdr-v">${esc(bal.holdingPretty || "R0.00")}</span></div>
          <div><span class="gdr-k">Paid out</span><span class="gdr-v">${esc(bal.paidOutPretty || "R0.00")}</span></div>
        </div>
        ${bal.holdingCents ? `<p class="gdr-note">Money from a completed ride becomes withdrawable
          ${bal.holdHours} hours after the trip, so a refund can still be honoured.</p>` : ""}
      </section>

      <div class="gdr-stats gdr-tap" data-anim="2" id="gdrStatsCard" role="button" tabindex="0"
           aria-label="Performance details">
        <div class="gdr-stat"><span class="gdr-stat-n">${an.loadPct || 0}<i>%</i></span><span class="gdr-stat-l">Load factor</span></div>
        <div class="gdr-stat"><span class="gdr-stat-n">${an.seatsSold || 0}</span><span class="gdr-stat-l">Seats sold</span></div>
        <div class="gdr-stat"><span class="gdr-stat-n">${Number(an.rating || 0).toFixed(1)}</span><span class="gdr-stat-l">Rating</span></div>
      </div>

      <div class="gdr-head" data-anim="3">
        <h2 class="gdr-h2">Your rides</h2>
        <button class="gdr-add" id="gdrNewRide" type="button">${I.plus}<span>List a ride</span></button>
      </div>

      <div class="gdr-rides">
        ${rides.length
          ? rides.map(rideCard).join("")
          : `<div class="gdr-empty">
               <p class="gdr-empty-t">No rides listed</p>
               <p class="gdr-empty-s">List a departure and riders on this corridor will see it.</p>
             </div>`}
      </div>

      ${an.trend && an.trend.length > 1 ? trendHtml(an) : ""}
      ${an.routes && an.routes.length ? routesHtml(an) : ""}
      ${historyHtml(d)}
    `;
  }

  function rideCard(r) {
    /* ── the whole card is the tap target ───────────────────────────────────
       A driver glancing at their list wants to open a ride and see who is on
       it, not hunt for a small link. The card is a <article> wrapping one
       overlay button so the entire surface is clickable AND the row still reads
       as an article to a screen reader. The per-passenger complete button stops
       propagation, so marking someone as boarded does not also open the sheet.
    */
    return `
      <article class="grdr" data-ride="${esc(r.id)}">
        <button class="grdr-hit" type="button" data-open-ride="${esc(r.id)}"
                aria-label="Open ${esc(r.from)} to ${esc(r.to)} on ${esc(r.date)}">
        </button>

        <header class="grdr-top">
          <div>
            <p class="grdr-route">${esc(r.from)} <span>→</span> ${esc(r.to)}</p>
            <p class="grdr-when">${esc(r.date)} · ${esc(r.depart)} · ${esc(r.vehicle || "")}</p>
          </div>
          <span class="grdr-pill ${r.status === "open" ? "" : "off"}">${esc(r.status)}</span>
        </header>

        <div class="grdr-bar-wrap">
          <div class="grdr-bar"><i style="width:${r.loadPct}%"></i></div>
          <span class="grdr-bar-l">${r.seatsSold}/${r.seatsTotal} seats · ${r.loadPct}% full${
            r.seatsOpen ? ` · ${r.seatsOpen} open` : " · full"}</span>
        </div>

        <div class="grdr-facts">
          <div><span class="grdr-k">Fare</span><span class="grdr-v">${esc(r.farePretty)}</span></div>
          <div><span class="grdr-k">Earned</span><span class="grdr-v">${esc(r.earnings.netPretty)}</span></div>
          <div><span class="grdr-k">Pending</span><span class="grdr-v">${esc(r.earnings.pendingPretty)}</span></div>
        </div>

        ${r.sales.length ? `
          <div class="grdr-sales">
            ${r.sales.map(s => `
              <div class="grdr-sale">
                <span class="grdr-sale-n">${esc(s.passenger)}</span>
                <span class="grdr-sale-s">${esc(s.state)}</span>
                <span class="grdr-sale-a">${esc(s.netPretty)}</span>
                ${s.state === "held" || s.state === "confirmed" ? `
                  <button class="grdr-act" data-sale="${esc(s.id)}" data-act="complete"
                          type="button" title="Mark ${esc(s.passenger)} as boarded">
                    ${I.check}
                  </button>` : ""}
              </div>`).join("")}
          </div>` : ""}
      </article>`;
  }

  /* ══ ride detail sheet ══════════════════════════════════════════════════
     What the driver needs about ONE ride, which the list card cannot hold: every
     passenger and their state, the money broken down against commission, the
     seats still unsold, and the actions that change any of it.
   */
  function openRide(r, onDone) {
    const sheet = getSheet();
    const host = sheet.host;

    const stateLabel = { held: "Holding", confirmed: "Confirmed", completed: "Boarded", refunded: "Refunded", forfeited: "No-show" };

    host.innerHTML = `
      <div class="gwd gride">
        <div class="gride-top">
          <div>
            <h2 class="gwd-h">${esc(r.from)} <span class="gride-arrow">→</span> ${esc(r.to)}</h2>
            <p class="gwd-avail">${esc(r.date)} · departs ${esc(r.depart)} · ${esc(r.vehicle || "")}</p>
          </div>
          <span class="grdr-pill ${r.status === "open" ? "" : "off"}">${esc(r.status)}</span>
        </div>

        <div class="gride-grid">
          <div><span class="grdr-k">Fare</span><span class="gride-v">${esc(r.farePretty)}</span></div>
          <div><span class="grdr-k">Seats</span><span class="gride-v">${r.seatsSold}/${r.seatsTotal}</span></div>
          <div><span class="grdr-k">Open</span><span class="gride-v">${r.seatsOpen}</span></div>
          <div><span class="grdr-k">Load</span><span class="gride-v">${r.loadPct}%</span></div>
        </div>

        <div class="gride-money">
          <div class="gride-mrow"><span>Gross taken</span><strong>${esc(r.earnings.grossPretty)}</strong></div>
          <div class="gride-mrow gride-mrow-neg"><span>Commission</span><strong>-${esc(R(r.earnings.commissionCents / 100))}</strong></div>
          <div class="gride-mrow gride-mrow-total"><span>Your earnings</span><strong>${esc(r.earnings.netPretty)}</strong></div>
          ${r.earnings.pendingCents ? `<div class="gride-mrow"><span>Still pending</span><strong>${esc(r.earnings.pendingPretty)}</strong></div>` : ""}
        </div>

        <div class="gride-sec">
          <span class="grdr-k">Passengers${r.sales.length ? ` · ${r.sales.length}` : ""}</span>
          ${r.sales.length ? `
            <div class="gride-people">
              ${r.sales.map(s => `
                <div class="gride-person">
                  <span class="gride-pav">${esc(initialsOf(s.passenger))}</span>
                  <span class="gride-pn">
                    <span class="gride-pname">${esc(s.passenger)}</span>
                    <span class="gride-pst gride-pst-${esc(s.state)}">${esc(stateLabel[s.state] || s.state)}</span>
                  </span>
                  <span class="gride-pa">${esc(s.netPretty)}</span>
                  ${s.state === "held" || s.state === "confirmed" ? `
                    <button class="grdr-act" data-sale="${esc(s.id)}" data-act="complete" type="button"
                            title="Mark as boarded">${I.check}</button>` : ""}
                </div>`).join("")}
            </div>` : `<p class="gride-none">No passengers yet. This ride is on the board and riders can see it.</p>`}
        </div>

        ${r.seatsOpen > 0 ? `
          <p class="gride-hint">${r.seatsOpen} ${r.seatsOpen === 1 ? "seat" : "seats"} still open.
             At ${esc(r.farePretty)} each that is another ${esc(R((r.seatsOpen * r.fare * 0.88) / 100))} if they sell.</p>` : ""}
      </div>`;

    host.querySelectorAll("[data-sale]").forEach(b => {
      b.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        b.disabled = true;
        await api(`/driver/sales/${b.getAttribute("data-sale")}/${b.getAttribute("data-act")}`, { method: "POST" });
        sheet.hide();
        if (onDone) onDone();
      });
    });

    sheet.show();
  }

  function initialsOf(name) {
    return String(name || "?").split(/\s+/).filter(Boolean)
      .map(p => p.charAt(0)).slice(0, 2).join("").toUpperCase() || "?";
  }

  /* one sheet instance, shared by every driver overlay */
  function getSheet() {
    let sheet = document.querySelector(".gsheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "gsheet";
      sheet.innerHTML = '<div class="gsheet-scrim" data-close></div><div class="gsheet-body"><div class="gsheet-grab"></div><div id="gsheetIn"></div></div>';
      document.body.appendChild(sheet);
    }

    /* ── last-resort inline geometry ────────────────────────────────────────
       The sheet has to be a viewport overlay. Its rules live in this page's own
       stylesheet now, but this guard means a missing or stale stylesheet can
       never again render it as a static block at the foot of the document —
       which is what happened when .gsheet was only defined in a CSS file the
       dashboard did not load, and cost a visible sheet entirely. If the computed
       position is not 'fixed', the essentials are written inline, because a sheet
       nobody can see is worse than a slightly unstyled one. */
    const cs = window.getComputedStyle(sheet);
    if (cs.position !== "fixed") {
      sheet.style.position = "fixed";
      sheet.style.inset = "0";
      sheet.style.zIndex = "900";
      const body = sheet.querySelector(".gsheet-body");
      if (body) {
        body.style.position = "absolute";
        body.style.left = "0";
        body.style.right = "0";
        body.style.bottom = "0";
        body.style.maxHeight = "82dvh";
        body.style.overflowY = "auto";
        body.style.background = "#fff";
        body.style.borderRadius = "22px 22px 0 0";
        body.style.padding = "10px 20px 24px";
      }
    }

    const host = sheet.querySelector("#gsheetIn") || sheet.querySelector(".gsheet-body");

    /* ── make it obvious the sheet can be dismissed and scrolled ────────────
       A close button pinned inside the scroller, plus a foot cue that appears
       only while there is more content below. Both are wired here rather than in
       each sheet so every overlay — ride, money, stats, withdraw, new ride —
       gets the same way out for free. */
    const bodyEl = sheet.querySelector(".gsheet-body");
    if (bodyEl && !bodyEl.querySelector(".gsheet-close")) {
      const btn = document.createElement("button");
      btn.className = "gsheet-close";
      btn.type = "button";
      btn.setAttribute("aria-label", "Close");
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      btn.addEventListener("click", (e) => { e.stopPropagation(); hide(); });
      bodyEl.insertBefore(btn, bodyEl.firstChild);

      const cue = document.createElement("div");
      cue.className = "gsheet-foot-cue";
      bodyEl.appendChild(cue);

      const syncCue = () => {
        const scrollable = bodyEl.scrollHeight > bodyEl.clientHeight + 4;
        const atEnd = bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 6;
        bodyEl.classList.toggle("is-scrollable", scrollable && !atEnd);
        bodyEl.classList.toggle("at-end", !scrollable || atEnd);
      };
      bodyEl.addEventListener("scroll", syncCue, { passive: true });
      sheet.__syncCue = syncCue;
    }

    function hide() {
      sheet.classList.remove("shown");
      document.documentElement.style.overflow = "";
      setTimeout(() => sheet.classList.remove("on"), 220);
    }
    function show() {
      sheet.classList.add("on");
      document.documentElement.style.overflow = "hidden";
      requestAnimationFrame(() => {
        sheet.classList.add("shown");
        /* the cue is decided from the content height, which is only measurable
           once the sheet is laid out — hence a frame later, not at build time */
        if (sheet.__syncCue) setTimeout(sheet.__syncCue, 60);
      });
    }
    if (!sheet.__wired) {
      sheet.addEventListener("click", e => { if (e.target.closest("[data-close]")) hide(); });
      sheet.__wired = true;
    }
    return { host, show, hide };
  }

  function trendHtml(an) {
    const max = Math.max(...an.trend.map(t => t.cents), 1);
    return `
      <section class="gdr-card" data-anim="4">
        <span class="gdr-label">Earnings, last ${an.trend.length} days</span>
        <div class="gdr-trend">
          ${an.trend.map(t => `
            <div class="gdr-bar-col" title="${esc(t.day)}: ${R(t.cents / 100)}">
              <i style="height:${Math.max(4, Math.round((t.cents / max) * 48))}px"></i>
            </div>`).join("")}
        </div>
        <p class="gdr-trend-l">${esc(an.netPretty)} after ${esc(String(an.commissionPretty))} commission</p>
      </section>`;
  }

  function routesHtml(an) {
    return `
      <section class="gdr-card" data-anim="5">
        <span class="gdr-label">Best routes</span>
        <div class="gdr-routes">
          ${an.routes.map(r => `
            <div class="gdr-route-row">
              <span class="gdr-route-n">${esc(r.route)}</span>
              <span class="gdr-route-s">${r.seats} seats</span>
              <span class="gdr-route-v">${esc(r.netPretty)}</span>
            </div>`).join("")}
        </div>
      </section>`;
  }

  function historyHtml(d) {
    const ws = d.withdrawals || [];
    const ledger = d.ledger || [];
    if (!ws.length && !ledger.length) return "";
    return `
      <section class="gdr-card" data-anim="6">
        <span class="gdr-label">History</span>
        ${ws.length ? `
          <div class="gdr-h-sub">Withdrawals</div>
          ${ws.map(w => `
            <div class="gdr-h-row">
              <span class="gdr-h-t">${esc(w.amountPretty)} <em>${esc(w.method.toUpperCase())}</em></span>
              <span class="gdr-h-s">${w.status === "paid" ? "Paid" : "Pending"}${w.reference ? " · " + esc(w.reference) : ""}</span>
            </div>`).join("")}` : ""}
        ${ledger.length ? `
          <div class="gdr-h-sub">Ledger</div>
          ${ledger.slice(0, 8).map(e => `
            <div class="gdr-h-row">
              <span class="gdr-h-t ${e.sign === "-" ? "neg" : "pos"}">${e.sign}${esc(e.pretty)}</span>
              <span class="gdr-h-s">${esc(e.note)}</span>
            </div>`).join("")}` : ""}
      </section>`;
  }

  /* ══ withdraw sheet ═══════════════════════════════════════════════════ */
  function openWithdraw(bal, onDone) {
    let sheet = document.querySelector(".gsheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "gsheet";
      sheet.innerHTML = '<div class="gsheet-scrim" data-close></div><div class="gsheet-body"><div class="gsheet-grab"></div><div id="gsheetIn"></div></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener("click", e => { if (e.target.closest("[data-close]")) hide(); });
    }
    const host = sheet.querySelector("#gsheetIn") || sheet.querySelector(".gsheet-body");

    host.innerHTML = `
      <div class="gwd">
        <h2 class="gwd-h">Withdraw</h2>
        <p class="gwd-avail">${esc(bal.availablePretty)} available</p>

        <form id="gwdForm">
          <label class="gwd-f">
            <span class="gwd-l">Amount</span>
            <div class="gwd-amt">
              <span>R</span>
              <input class="gwd-i" id="gwdAmt" type="number" min="1" step="0.01"
                     inputmode="decimal" placeholder="${(bal.availableCents / 100).toFixed(2)}">
            </div>
            <em class="gwd-e" id="gwdErr"></em>
          </label>

          <div class="gwd-f">
            <span class="gwd-l">Send to</span>
            <div class="gwd-methods">
              <button class="gwd-m on" type="button" data-m="eft">Bank (EFT)</button>
              <button class="gwd-m" type="button" data-m="cash">Cash at the rank</button>
            </div>
          </div>

          <label class="gwd-f" id="gwdAcctWrap">
            <span class="gwd-l">Account reference</span>
            <input class="gwd-i" id="gwdAcct" placeholder="FNB ****4521" maxlength="40">
          </label>

          <button class="gwd-btn" type="submit">Request ${esc(bal.availablePretty)}</button>
        </form>

        <p class="gwd-note">
          The minimum is ${esc(bal.minimumPretty)}. Money from completed rides is released
          ${bal.holdHours} hours after the trip. Requests are reviewed and paid on the next
          business day.
        </p>
      </div>`;

    let method = "eft";
    const amt = host.querySelector("#gwdAmt");
    const err = host.querySelector("#gwdErr");
    const acctWrap = host.querySelector("#gwdAcctWrap");
    const submit = host.querySelector(".gwd-btn");

    /* prefill the whole balance: most withdrawals are "everything" */
    amt.value = (bal.availableCents / 100).toFixed(2);

    host.querySelectorAll(".gwd-m").forEach(b => {
      b.addEventListener("click", () => {
        host.querySelectorAll(".gwd-m").forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        method = b.getAttribute("data-m");
        acctWrap.style.display = method === "eft" ? "" : "none";
      });
    });

    function check() {
      const v = Math.round(Number(amt.value || 0) * 100);
      let msg = "";
      if (!v || v <= 0) msg = "Enter an amount.";
      else if (v < bal.minimumCents) msg = "Minimum is " + bal.minimumPretty + ".";
      else if (v > bal.availableCents) msg = "Only " + bal.availablePretty + " is available.";
      err.textContent = msg;
      submit.textContent = msg ? "Request withdrawal" : "Request " + R(v / 100);
      return !msg;
    }
    amt.addEventListener("input", check);
    check();

    host.querySelector("#gwdForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!check()) return;
      submit.disabled = true;
      submit.textContent = "Requesting…";

      const res = await api("/driver/withdraw", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(amt.value),
          method,
          account: (host.querySelector("#gwdAcct") || {}).value || "",
        }),
      });

      if (!res.ok) {
        err.textContent = res.data.error || "Could not request that withdrawal.";
        submit.disabled = false;
        submit.textContent = "Request withdrawal";
        return;
      }

      hide();
      if (onDone) onDone(res.data);
    });

    sheet.classList.add("on");
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => sheet.classList.add("shown"));

    function hide() {
      sheet.classList.remove("shown");
      document.documentElement.style.overflow = "";
      setTimeout(() => sheet.classList.remove("on"), 220);
    }
  }

  /* ══ new ride sheet ═══════════════════════════════════════════════════ */
  function openNewRide(onDone) {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);

    let sheet = document.querySelector(".gsheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "gsheet";
      sheet.innerHTML = '<div class="gsheet-scrim" data-close></div><div class="gsheet-body"><div class="gsheet-grab"></div><div id="gsheetIn"></div></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener("click", e => { if (e.target.closest("[data-close]")) hide(); });
    }
    const host = sheet.querySelector("#gsheetIn") || sheet.querySelector(".gsheet-body");

    host.innerHTML = `
      <div class="gwd">
        <h2 class="gwd-h">List a ride</h2>
        <p class="gwd-avail">Riders on this corridor will see it straight away.</p>
        <form id="gnewRide" novalidate>
          <div class="gwd-row2">
            <label class="gwd-f"><span class="gwd-l">From</span><input class="gwd-i" name="from" placeholder="East London" required><em class="gwd-e" data-e="from"></em></label>
            <label class="gwd-f"><span class="gwd-l">To</span><input class="gwd-i" name="to" placeholder="Mthatha" required><em class="gwd-e" data-e="to"></em></label>
          </div>
          <div class="gwd-row2">
            <label class="gwd-f"><span class="gwd-l">Date</span><input class="gwd-i" name="date" type="date" value="${iso}" required><em class="gwd-e" data-e="date"></em></label>
            <label class="gwd-f"><span class="gwd-l">Depart</span><input class="gwd-i" name="depart" type="time" value="06:30" required><em class="gwd-e" data-e="depart"></em></label>
          </div>
          <div class="gwd-row2">
            <label class="gwd-f"><span class="gwd-l">Fare per seat (R)</span><input class="gwd-i" name="fare" type="number" min="1" step="1" placeholder="240" required><em class="gwd-e" data-e="fare"></em></label>
            <label class="gwd-f"><span class="gwd-l">Seats</span><input class="gwd-i" name="seatsTotal" type="number" min="1" max="22" value="7" required><em class="gwd-e" data-e="seatsTotal"></em></label>
          </div>
          <button class="gwd-btn" type="submit">List this ride</button>
        </form>
      </div>`;

    const form = host.querySelector("#gnewRide");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      host.querySelectorAll(".gwd-e").forEach(x => (x.textContent = ""));
      const fd = new FormData(form);
      const payload = {
        from: (fd.get("from") || "").trim(),
        to: (fd.get("to") || "").trim(),
        date: fd.get("date"),
        depart: fd.get("depart"),
        fare: Number(fd.get("fare")),
        seatsTotal: Number(fd.get("seatsTotal")),
      };
      const btn = form.querySelector(".gwd-btn");
      btn.disabled = true;
      btn.textContent = "Listing…";

      const res = await api("/driver/rides", { method: "POST", body: JSON.stringify(payload) });

      if (!res.ok) {
        const errs = res.data.errors || {};
        Object.keys(errs).forEach(k => {
          const el = host.querySelector(`[data-e="${k}"]`);
          if (el) el.textContent = errs[k];
        });
        if (!Object.keys(errs).length) {
          const first = host.querySelector(".gwd-e");
          if (first) first.textContent = res.data.error || "Could not list that ride.";
        }
        btn.disabled = false;
        btn.textContent = "List this ride";
        return;
      }

      hide();
      if (onDone) onDone(res.data);
    });

    sheet.classList.add("on");
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => sheet.classList.add("shown"));

    function hide() {
      sheet.classList.remove("shown");
      document.documentElement.style.overflow = "";
      setTimeout(() => sheet.classList.remove("on"), 220);
    }
  }

  /* ══ render ═══════════════════════════════════════════════════════════ */
  async function renderDriver(host) {
    host.innerHTML = `<div class="gdr"><div class="gdr-loading">Loading your driver account…</div></div>`;

    const me = await api("/driver/me");
    if (!me.ok && me.status === 401) {
      host.innerHTML = `<div class="gdr"><p class="gdr-sub">Sign in to switch to driver mode.</p>
        <a class="gdr-btn gdr-btn-lime" href="auth.html?next=dashboard">Sign in</a></div>`;
      return;
    }

    /* ── a failed load must not look like a slow one ────────────────────────
       Without this, a timeout or a 500 left the "Loading…" line on screen
       forever: the driver cannot tell a dead page from a slow one, and there is
       nothing to tap. Any non-auth failure now says what happened and offers the
       one action that can fix it. */
    if (!me.ok) {
      host.innerHTML = `
        <div class="gdr">
          ${switchHtml("driver")}
          <div class="gdr-error">
            <p class="gdr-error-t">Could not load your driver account</p>
            <p class="gdr-error-s">${esc(me.data.error || "Something went wrong.")}</p>
            <button class="gdr-btn gdr-btn-lime" id="gdrRetry" type="button">Try again</button>
            <button class="gdr-btn gdr-btn-quiet" id="gdrBack" type="button">Back to passenger</button>
          </div>
        </div>`;
      const retry = host.querySelector("#gdrRetry");
      if (retry) retry.addEventListener("click", () => renderDriver(host));
      const back = host.querySelector("#gdrBack");
      if (back) back.addEventListener("click", () => {
        setMode("passenger");
        if (window.GOGODashboard && GOGODashboard.boot) GOGODashboard.boot();
      });
      return;
    }

    /* not a driver yet: onboarding, which is the only useful thing to offer */
    if (me.data.onboardingRequired || !me.data.driver) {
      host.innerHTML = `<div class="gdr">${switchHtml("driver")}${onboardingHtml()}</div>`;
      wireModeSwitch(host);
      wireOnboarding(host);
      return;
    }

    const [earn, rides] = await Promise.all([api("/driver/earnings"), api("/driver/rides")]);

    const d = {
      driver: me.data.driver,
      balance: earn.data.balance || {},
      analytics: earn.data.analytics || {},
      withdrawals: earn.data.withdrawals || [],
      ledger: earn.data.ledger || [],
      rides: rides.data.rides || [],
    };

    host.innerHTML = `<div class="gdr">${switchHtml("driver")}${driverHomeHtml(d)}</div>`;
    wireModeSwitch(host);

    const reload = () => renderDriver(host);

    const wbtn = host.querySelector("#gdrWithdraw");
    if (wbtn) wbtn.addEventListener("click", () => openWithdraw(d.balance, reload));

    const nbtn = host.querySelector("#gdrNewRide");
    if (nbtn) nbtn.addEventListener("click", () => openNewRide(reload));

    host.querySelectorAll("[data-sale]").forEach(b => {
      b.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        b.disabled = true;
        await api(`/driver/sales/${b.getAttribute("data-sale")}/${b.getAttribute("data-act")}`, { method: "POST" });
        reload();
      });
    });

    /* ── open a ride ──────────────────────────────────────────────────────
       The card is the tap target, so this is the one handler the list needs.
       Looked up by id from the data we already hold rather than stashed in a
       closure per card — one source of truth, and a completed sale updates the
       same object the sheet reopens from. */
    host.querySelectorAll("[data-open-ride]").forEach(b => {
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = b.getAttribute("data-open-ride");
        const ride = d.rides.find(x => x.id === id);
        if (ride) openRide(ride, reload);
      });
    });

    /* the stats and balance cards are informative, but a driver will still tap
       them — so give them somewhere useful to go rather than nothing */
    const balCard = host.querySelector("#gdrBalanceCard");
    if (balCard) balCard.addEventListener("click", () => openBalance(d, reload));
    const statsCard = host.querySelector("#gdrStatsCard");
    if (statsCard) statsCard.addEventListener("click", () => openStats(d, reload));
  }

  function wireOnboarding(host) {
    const form = host.querySelector("#gdrRegForm");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      host.querySelectorAll(".gdr-e").forEach(x => (x.textContent = ""));
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      payload.seats = Number(payload.seats);

      const btn = form.querySelector(".gdr-btn");
      btn.disabled = true;
      btn.textContent = "Saving…";

      const res = await api("/driver/register", { method: "POST", body: JSON.stringify(payload) });

      if (!res.ok) {
        const errs = res.data.errors || {};
        Object.keys(errs).forEach(k => {
          const el = host.querySelector(`[data-e="${k}"]`);
          if (el) el.textContent = errs[k];
        });
        btn.disabled = false;
        btn.textContent = "Save and continue";
        return;
      }
      renderDriver(host.parentElement || document.getElementById("main"));
    });
  }

  function wireModeSwitch(host) {
    host.querySelectorAll("[data-mode]").forEach(b => {
      b.addEventListener("click", () => {
        const m = b.getAttribute("data-mode");
        setMode(m);
        const main = document.getElementById("main");
        if (m === "driver") {
          renderDriver(main);
        } else if (window.GOGODashboard && GOGODashboard.boot) {
          GOGODashboard.boot();
        }
      });
    });
  }

  /* ══ entry point, called by the dashboard ═════════════════════════════ */
  window.GOGODriver = {
    getMode,
    setMode,
    render: renderDriver,
    switchHtml,
    wireModeSwitch,
  };
})();
