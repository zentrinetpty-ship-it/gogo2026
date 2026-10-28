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
    const res = await fetch("/api" + path, Object.assign({
      headers: Object.assign(
        { "Content-Type": "application/json" },
        t ? { Authorization: "Bearer " + t } : {}
      ),
    }, opts || {}));
    let j = {};
    try { j = await res.json(); } catch (e) { j = {}; }
    return { ok: res.ok && j.ok !== false, status: res.status, data: j };
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
      <section class="gdr-hero" data-anim="1">
        <span class="gdr-label">Available to withdraw</span>
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

      <div class="gdr-stats" data-anim="2">
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
    return `
      <article class="grdr" data-ride="${esc(r.id)}">
        <header class="grdr-top">
          <div>
            <p class="grdr-route">${esc(r.from)} <span>→</span> ${esc(r.to)}</p>
            <p class="grdr-when">${esc(r.date)} · ${esc(r.depart)} · ${esc(r.vehicle || "")}</p>
          </div>
          <span class="grdr-pill ${r.status === "open" ? "" : "off"}">${esc(r.status)}</span>
        </header>

        <div class="grdr-bar-wrap">
          <div class="grdr-bar"><i style="width:${r.loadPct}%"></i></div>
          <span class="grdr-bar-l">${r.seatsSold}/${r.seatsTotal} seats · ${r.loadPct}% full</span>
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
                  <button class="grdr-act" data-sale="${esc(s.id)}" data-act="complete" type="button" title="Mark as completed">
                    ${I.check}
                  </button>` : ""}
              </div>`).join("")}
          </div>` : ""}
      </article>`;
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
      b.addEventListener("click", async () => {
        b.disabled = true;
        await api(`/driver/sales/${b.getAttribute("data-sale")}/${b.getAttribute("data-act")}`, { method: "POST" });
        reload();
      });
    });
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
