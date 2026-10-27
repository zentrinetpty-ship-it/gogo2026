/* =========================================================================
   GOGO — JOIN A MOVING RIDE  (rider side)

   The screen for someone standing in Komani who wants the van that left East
   London at 06:30. It answers, in this order:

     1. What is still coming through my town, and when does it get here?
     2. How many seats, and what does it cost?
     3. Can I talk to the driver before I commit?
     4. Request, and what exactly happens to my money?

   THE COPY IS THE FEATURE
   The plan's biggest risk is a rider believing they have been charged when a
   mock provider merely wrote a row. So the money line is generated from
   /api/payments/status, never hard-coded: if the provider is a mock it says the
   deposit is collected at boarding. It cannot say "charged" until Stripe is live,
   because the API will not tell it to.

   WHY CHAT COMES BEFORE THE REQUEST
   The price is negotiated, not computed. A rider needs to agree a number with the
   driver before tapping request, so the chat is a step in the flow and not a
   support feature bolted on afterwards.
   ========================================================================= */

const GOGOJoin = (() => {
  const API = "/api";

  let from = "";
  let to = "";
  let rides = [];
  let payInfo = null;
  let activeRide = null;
  let agreedRands = "";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const rand = (c) => "R" + (Number(c || 0) / 100).toFixed(2);

  async function get(path) {
    const r = await fetch(API + path, { headers: { Accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.detail || ("HTTP " + r.status));
    return j;
  }

  async function post(path, body) {
    const r = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || j.error || ("HTTP " + r.status));
    return j;
  }

  /* ── the money sentence, derived from the API ───────────────────────────── */
  function moneyLine() {
    if (!payInfo) return "";
    if (payInfo.isMock) {
      return "A R50 deposit and a R9.99 booking fee are recorded when you request. " +
             "No card is charged because no payment provider is connected yet, so both are collected at boarding.";
    }
    return "A R50 deposit and a R9.99 booking fee are held on your card when you request. " +
           "The deposit is returned in full if the driver declines. The fare itself is paid to the driver at boarding.";
  }

  function searchPanel() {
    return `
      <div class="gj-card">
        <span class="gj-label">Join a ride already going</span>
        <h1 class="gj-h1">Catch a van that is already on the road</h1>
        <p class="gj-lede">If you are standing in a town on the route, a seat can still be yours. Tell us where you are and where you are going.</p>

        <div class="gj-fields">
          <label class="gj-field">
            <span>I am in</span>
            <input id="gjFrom" class="gj-input" type="text" autocomplete="off" placeholder="Komani" value="${esc(from)}" />
          </label>
          <label class="gj-field">
            <span>Going to</span>
            <input id="gjTo" class="gj-input" type="text" autocomplete="off" placeholder="Mthatha" value="${esc(to)}" />
          </label>
        </div>

        <button class="gj-btn gj-btn-ink" id="gjSearch">Find a van</button>
        <div id="gjResults"></div>
      </div>`;
  }

  function rideCard(r) {
    return `
      <button class="gj-ride ${r.bookable ? "" : "is-full"}" data-ride="${esc(r.rideId)}">
        <span class="gj-ride-when">
          <b>${esc(r.dueAtTheirTown)}</b>
          <span>at ${esc(r.from)}</span>
        </span>
        <span class="gj-ride-mid">
          <b>${esc(r.from)} &rarr; ${esc(r.to)}</b>
          <span>left ${esc(r.originDepart)} · ${esc(r.vehicle || "Toyota Quantum")}</span>
        </span>
        <span class="gj-ride-seats ${r.seatsFree ? "" : "none"}">
          ${r.seatsFree ? r.seatsFree + " seat" + (r.seatsFree === 1 ? "" : "s") : "Full"}
        </span>
      </button>`;
  }

  function resultsPanel() {
    if (!rides.length) return "";
    return `
      <div class="gj-results">
        ${rides.map(rideCard).join("")}
        <p class="gj-hint">Times are from the timetable, not live tracking.</p>
      </div>`;
  }

  /* ── the request panel: price, chat, request ───────────────────────────── */
  function requestPanel(r) {
    return `
      <div class="gj-card gj-request">
        <button class="gj-back" id="gjBack">&larr; All vans</button>
        <span class="gj-label">${esc(r.from)} &rarr; ${esc(r.to)}</span>
        <h2 class="gj-h2">Van due at ${esc(r.dueAtTheirTown)}</h2>
        <p class="gj-lede">${r.seatsFree} seat${r.seatsFree === 1 ? "" : "s"} free. Agree a price with the driver, then request the seat.</p>

        <div class="gj-price">
          <label class="gj-field">
            <span>Price you agreed with the driver</span>
            <div class="gj-rand">
              <i>R</i>
              <input id="gjAgreed" class="gj-input" type="number" inputmode="numeric"
                     min="0" step="10" placeholder="150" value="${esc(agreedRands)}" />
            </div>
          </label>
          <p class="gj-hint">The driver keeps this. GOGO adds the R9.99 fee on top, it is not taken out of the price.</p>
        </div>

        <div class="gj-chat-note">
          <span class="gj-chat-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9.9 9.9 0 01-4-.8L3 21l1.9-4.6a8.4 8.4 0 01-.9-3.9 8.4 8.4 0 018.5-8.4 8.4 8.4 0 018.5 8.4z"/>
            </svg>
          </span>
          <span>Not sure what to offer? <a href="/gogo/messages.html">Chat to the driver</a> and agree a price first.</span>
        </div>

        <div class="gj-money">${esc(moneyLine())}</div>

        <button class="gj-btn gj-btn-lime" id="gjRequest">Request this seat</button>
        <div id="gjOutcome"></div>
      </div>`;
  }

  function render() {
    const host = document.getElementById("gjRoot");
    if (!host) return;

    host.innerHTML = activeRide ? requestPanel(activeRide) : searchPanel();

    if (activeRide) {
      host.querySelector("#gjBack").addEventListener("click", () => {
        activeRide = null; render();
      });
      host.querySelector("#gjAgreed").addEventListener("input", (e) => {
        agreedRands = e.target.value;
      });
      host.querySelector("#gjRequest").addEventListener("click", submitRequest);
      return;
    }

    const doSearch = async () => {
      from = (host.querySelector("#gjFrom").value || "").trim();
      to = (host.querySelector("#gjTo").value || "").trim();
      const box = host.querySelector("#gjResults");
      if (!from || !to) { box.innerHTML = `<p class="gj-hint">Fill in both towns.</p>`; return; }
      box.innerHTML = `<p class="gj-hint">Looking…</p>`;
      try {
        const j = await get("/match/midroute?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to));
        rides = j.rides || [];
        box.innerHTML = rides.length
          ? resultsPanel()
          : `<p class="gj-hint">Nothing still coming through ${esc(from)} toward ${esc(to)} right now.</p>`;
        box.querySelectorAll("[data-ride]").forEach((b) => {
          b.addEventListener("click", () => {
            activeRide = rides.find((x) => x.rideId === b.dataset.ride);
            render();
          });
        });
      } catch (e) {
        box.innerHTML = `<p class="gj-hint">${esc(e.message)}</p>`;
      }
    };

    host.querySelector("#gjSearch").addEventListener("click", doSearch);
    ["gjFrom", "gjTo"].forEach((id) =>
      host.querySelector("#" + id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); doSearch(); }
      }));

    if (rides.length) {
      const box = host.querySelector("#gjResults");
      box.innerHTML = resultsPanel();
      box.querySelectorAll("[data-ride]").forEach((b) => {
        b.addEventListener("click", () => {
          activeRide = rides.find((x) => x.rideId === b.dataset.ride);
          render();
        });
      });
    }
  }

  async function submitRequest() {
    const host = document.getElementById("gjRoot");
    const out = host.querySelector("#gjOutcome");
    const btn = host.querySelector("#gjRequest");
    const agreed = Number(agreedRands);

    if (!agreed || agreed <= 0) {
      out.innerHTML = `<p class="gj-err">Put in the price you agreed with the driver.</p>`;
      return;
    }

    btn.disabled = true;
    out.innerHTML = `<p class="gj-hint">Sending your request…</p>`;

    try {
      const j = await post("/join/request", {
        rideId: activeRide.rideId,
        from: activeRide.from,
        to: activeRide.to,
        seats: 1,
        agreedCents: Math.round(agreed * 100),
        phone: (localStorage.getItem("gogo_phone") || "").trim(),
        name: (localStorage.getItem("gogo_name") || "").trim(),
      });

      payInfo = j.payment || payInfo;
      out.innerHTML = `
        <div class="gj-done">
          <span class="gj-done-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </span>
          <b>Request sent</b>
          <span>Waiting for the driver to accept. You will not be charged the fare until you board.</span>
        </div>`;
      btn.textContent = "Request sent";
    } catch (e) {
      btn.disabled = false;
      out.innerHTML = `<p class="gj-err">${esc(e.message)}</p>`;
    }
  }

  async function boot() {
    try { payInfo = await get("/payments/status"); } catch (e) { payInfo = { isMock: true }; }
    render();
  }

  return { boot, render };
})();

window.GOGOJoin = GOGOJoin;
