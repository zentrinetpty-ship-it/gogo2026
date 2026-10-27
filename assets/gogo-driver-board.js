/* =========================================================================
   GOGO — DRIVER BOARD

   The screen a driver actually uses while the van is loading. It answers three
   questions and nothing else:

     1. Who wants to join, and where do they want to get on?
     2. How many seats are free on each stretch right now?
     3. Which of my riders has not turned up?

   DESIGN CONSTRAINTS THAT CAME FROM THE PLAN
   · Accept and decline must be as easy as each other, or drivers accept
     everything by default and the queue becomes meaningless.
   · "Not here, move on" must be ONE tap and must never be buried. A driver
     standing at a rank with traffic behind him will not hunt through a menu.
   · The rider's number is shown, because he may need to call ("I'm at the Spar",
     "running 20 late", "can't get into that street"). A masked relay would be
     better and is the recommended follow-up, but hiding it entirely is worse
     than showing it: the driver cannot collect a stranger he cannot reach.
   · Money is stated exactly as the API reports it. While the provider is a mock
     the card says "recorded, collected at boarding", never "charged". A screen
     that lies about money is worse than one that admits it has no provider.
   ========================================================================= */

const GOGODriverBoard = (() => {
  const API = "/api";

  let rideId = "g1";
  let legs = null;
  let requests = [];
  let payInfo = null;
  let busy = false;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const rand = (c) => "R" + (Number(c || 0) / 100).toFixed(2);

  async function fetchJson(path, opts) {
    const r = await fetch(API + path, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.detail || ("HTTP " + r.status));
    return j;
  }

  async function load() {
    const [l, q, p] = await Promise.all([
      fetchJson("/ride/" + encodeURIComponent(rideId) + "/legs"),
      fetchJson("/join/requests?rideId=" + encodeURIComponent(rideId)),
      fetchJson("/payments/status"),
    ]);
    legs = l;
    requests = q.requests || [];
    payInfo = p;
  }

  async function act(path, body) {
    if (busy) return;
    busy = true;
    render();
    try {
      await fetchJson(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      toast(e.message);
    } finally {
      busy = false;
      render();
    }
  }

  function toast(msg) {
    let t = document.getElementById("gdToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "gdToast";
      t.className = "gd-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("on"), 3200);
  }

  /* ── the seat strip ─────────────────────────────────────────────────────
     One row per stretch of road. A driver reads this left to right and sees at a
     glance which part of his route is full. Much better than one number. */
  function seatStrip() {
    if (!legs || !legs.boarding) return "";
    const cap = legs.capacity || 4;
    return `
      <div class="gd-section">
        <div class="gd-label">Seats from each stop</div>
        <div class="gd-strip">
          ${legs.boarding.map((b) => {
            const free = Number(b.seatsFree) || 0;
            const pct = cap ? Math.round((free / cap) * 100) : 0;
            const cls = free === 0 ? "is-full" : free <= 1 ? "is-tight" : "";
            return `
              <div class="gd-stop ${cls} ${b.reachable ? "" : "is-past"}">
                <div class="gd-stop-town">${esc(b.town)}</div>
                <div class="gd-stop-eta">${esc(b.dueAt)}</div>
                <div class="gd-stop-bar"><i style="width:${pct}%"></i></div>
                <div class="gd-stop-free">${free} of ${cap}</div>
              </div>`;
          }).join("")}
        </div>
        <p class="gd-hint">${esc(legs.note || "")}</p>
      </div>`;
  }

  /* ── a request card ─────────────────────────────────────────────────────
     Pending ones are the job. Confirmed ones are the roster. They are visually
     different because they need different actions. */
  function requestCard(r) {
    const pending = r.status === "pending";
    const confirmed = r.status === "confirmed";

    return `
      <div class="gd-req ${pending ? "is-pending" : "is-" + esc(r.status)}">
        <div class="gd-req-top">
          <span class="gd-req-who">
            <b>${esc(r.riderName || "Rider")}</b>
            <span>${esc(r.from)} &rarr; ${esc(r.to)} · ${r.seats} seat${r.seats === 1 ? "" : "s"}</span>
          </span>
          <span class="gd-req-fare">${rand(r.agreedCents)}</span>
        </div>

        <div class="gd-req-meta">
          ${r.boardPoint ? `<span class="gd-pin">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>
            </svg>${esc(r.boardPoint)}</span>` : ""}
          ${r.riderPhone ? `<a class="gd-call" href="tel:${esc(r.riderPhone)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/>
            </svg>${esc(r.riderPhone)}</a>` : ""}
        </div>

        ${pending ? `
          <div class="gd-req-actions">
            <button class="gd-btn gd-accept" data-accept="${esc(r.id)}" ${busy ? "disabled" : ""}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                   stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              Accept
            </button>
            <button class="gd-btn gd-decline" data-decline="${esc(r.id)}" ${busy ? "disabled" : ""}>
              Decline
            </button>
          </div>` : ""}

        ${confirmed ? `
          <div class="gd-req-actions">
            <button class="gd-btn gd-board" data-board="${esc(r.id)}" ${busy ? "disabled" : ""}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21V7l6-3v17"/><path d="M4 21h16"/>
              </svg>
              They boarded
            </button>
            <button class="gd-btn gd-noshow" data-noshow="${esc(r.id)}" ${busy ? "disabled" : ""}>
              Not here, move on
            </button>
          </div>` : ""}

        ${r.status === "no_show" ? `<div class="gd-flag">Marked not present. Seat freed.</div>` : ""}
        ${r.status === "declined" ? `<div class="gd-flag">Declined. Rider refunded.</div>` : ""}
      </div>`;
  }

  function render() {
    const host = document.getElementById("gdRoot");
    if (!host) return;

    const pending = requests.filter((r) => r.status === "pending");
    const confirmed = requests.filter((r) => r.status === "confirmed");
    const closed = requests.filter((r) => !["pending", "confirmed"].includes(r.status));

    /* What we are allowed to say about money. Never guess this. */
    const moneyNote = payInfo && payInfo.isMock
      ? "No card provider is connected yet. Deposits are recorded and collected at boarding."
      : "Card payments are live.";

    host.innerHTML = `
      <div class="gd">
        <header class="gd-head">
          <div>
            <span class="gd-eyebrow">Driver</span>
            <h1 class="gd-h1">${esc(legs ? legs.from + " to " + legs.to : "Your ride")}</h1>
            <p class="gd-sub">${esc(legs ? legs.depart + " · " + (legs.vehicle || "Toyota Quantum") : "")}</p>
          </div>
          <button class="gd-refresh" id="gdRefresh" aria-label="Refresh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 11-3-6.7"/><path d="M21 3v6h-6"/>
            </svg>
          </button>
        </header>

        ${seatStrip()}

        <section class="gd-section">
          <div class="gd-label">
            ${pending.length ? `${pending.length} waiting to join` : "Nobody waiting"}
          </div>
          ${pending.length
            ? pending.map(requestCard).join("")
            : `<p class="gd-empty">New requests appear here the moment a rider asks to join.</p>`}
        </section>

        ${confirmed.length ? `
          <section class="gd-section">
            <div class="gd-label">${confirmed.length} confirmed, on the way</div>
            ${confirmed.map(requestCard).join("")}
          </section>` : ""}

        ${closed.length ? `
          <section class="gd-section">
            <div class="gd-label">Finished today</div>
            ${closed.map(requestCard).join("")}
          </section>` : ""}

        <p class="gd-money">${esc(moneyNote)}</p>
      </div>`;

    host.querySelector("#gdRefresh").addEventListener("click", async () => {
      await load(); render();
      toast("Updated");
    });

    host.querySelectorAll("[data-accept]").forEach((b) =>
      b.addEventListener("click", () => act("/join/decide", { id: b.dataset.accept, action: "accept" })));
    host.querySelectorAll("[data-decline]").forEach((b) =>
      b.addEventListener("click", () => act("/join/decide", { id: b.dataset.decline, action: "decline" })));
    host.querySelectorAll("[data-board]").forEach((b) =>
      b.addEventListener("click", () => act("/join/board", { id: b.dataset.board })));
    host.querySelectorAll("[data-noshow]").forEach((b) =>
      b.addEventListener("click", () => {
        /* one confirm, because it takes the rider's money. Not a modal maze. */
        if (confirm("Mark this rider as not here? Their deposit is forfeited and the seat frees.")) {
          act("/join/no-show", { id: b.dataset.noshow });
        }
      }));
  }

  async function boot(ride) {
    if (ride) rideId = ride;
    try {
      await load();
    } catch (e) {
      const host = document.getElementById("gdRoot");
      if (host) host.innerHTML = `<div class="gd"><p class="gd-empty">Could not load the board: ${esc(e.message)}</p></div>`;
      return;
    }
    render();
    /* a driver should not have to pull to refresh while loading the van */
    setInterval(async () => {
      if (busy) return;
      try { await load(); render(); } catch (e) {}
    }, 20000);
  }

  return { boot, render, load };
})();

window.GOGODriverBoard = GOGODriverBoard;
