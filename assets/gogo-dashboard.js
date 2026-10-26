/* =========================================================================
   GOGO — DASHBOARD

   The Cleanic dashboard's design language, carrying GOGO's content. Same
   structure, same feel, same numbers-driven layout:

     navy hero banner        #0A192F, 16px radius, lime hairline
     tab strip               uppercase, lime underline on the active tab
     stat cards              4 across, white, 1px lime border, 8px radius
     slot pickers            navy when chosen, lime CTA below
     accordion panels        for the parts that can stay folded away

   Colours come from Cleanic's own tokens: navy #0A192F, lime #8DB600, the
   quiet surface #F4F6FB and the lime hairline rgba(141,182,0,.45).
   ========================================================================= */

function pageDashboard() {
  /* ── signed-in only ──────────────────────────────────────────────────────
     The dashboard is the rider's own trips, parcels and points. Without an
     account there is nothing to show and nothing to keep, so it asks for one
     rather than rendering an empty shell that looks broken. */
  if (window.GOGOAuth && GOGOAuth.require) {
    if (!GOGOAuth.isIn()) {
      GOGOAuth.require("Sign in to see your trips", "dashboard");
      return;
    }
  }

  const R = n => "R" + Number(n).toFixed(2);

  /* whatever the rider has booked, if anything. Everything degrades to zero
     rather than pretending there is data that is not there. */
  const store = (typeof Store !== "undefined" && Store.get) ? Store.get() : {};
  const bookings = Array.isArray(store.bookings) ? store.bookings : [];
  const parcels  = Array.isArray(store.parcels)  ? store.parcels  : [];
  const chats    = Array.isArray(store.chats)    ? store.chats    : [];
  const live     = bookings.filter(b => b && b.status && b.status !== "done").length;
  const done     = bookings.filter(b => b && b.status === "done").length;

  const name = (store.name || "").trim();
  const hello = name ? name.split(" ")[0] : "there";

  /* ── which city the rider is in ─────────────────────────────────────────
     Taken from the most recent booking's pickup town, then their saved home
     town, then the default. GOGOPlaces normalises whatever it finds, so
     "KuGompo City", "East London" and "east london" all land on one key. */
  const rawCity = (bookings[0] && (bookings[0].from || bookings[0].pickupTown))
    || store.homeTown            /* the town chosen at signup wins over a guess */
    || store.home
    || (store.bookingDraft && store.bookingDraft.pickupTown)
    || "East London";
  const city = (window.GOGOPlaces && GOGOPlaces.match)
    ? ((GOGOPlaces.match(rawCity) || {}).city || rawCity)
    : rawCity;

  /* the four journeys people actually make from there */
  const routes = (window.GOGORoutes && GOGORoutes.forCity)
    ? GOGORoutes.forCity(city).slice(0, 4)
    : [];

  /* ── the stat row: four cards, exactly like the reference ─────────────── */
  const STATS = [
    { ic: "🚐", k: "Hikes",     sub: "all time",       n: bookings.length, href: "rides" },
    { ic: "📦", k: "Parcels",   sub: "sent and coming", n: parcels.length,  href: "parcel" },
    { ic: "🎫", k: "Seats",     sub: "booked",          n: live,            href: "rider" },
    { ic: "⭐", k: "Points",    sub: "loyalty balance", n: done * 10,       href: "more" },
  ];

  /* ── the four tabs ────────────────────────────────────────────────────── */
  const TABS = [
    { k: "overview", t: "Overview" },
    { k: "trips",    t: "My trips" },
    { k: "parcels",  t: "Parcels" },
    { k: "plan",     t: "Plan" },
  ];

  const panel = (k, label, sub, body, open) => `
    <section class="g-db-panel${open ? " is-open" : ""}" data-panel="${k}">
      <button type="button" class="g-db-panel-h" aria-expanded="${!!open}">
        <span class="g-db-panel-k">${k}</span>
        <span class="g-db-panel-t">${label}</span>
        <span class="g-db-chev" aria-hidden>›</span>
      </button>
      <div class="g-db-panel-b">
        <p class="g-db-panel-sub">${sub}</p>
        <div class="g-db-panel-in">${body}</div>
      </div>
    </section>`;

  $('#main').innerHTML = `
  <div class="g-wrap g-db">

    <!-- ── hero: navy banner, the same shape as the reference ── -->
    <section class="g-db-hero">
      <div class="g-db-hero-l">
        <span class="g-db-hero-ic" aria-hidden>${GICON("van")}</span>
        <p class="g-db-hero-eyebrow">Welcome back, ${hello}</p>
        <h1 class="g-db-hero-h">Ready for your next hike?</h1>
        <p class="g-db-hero-p">Long-distance seats and parcels, door to door.</p>
      </div>
      <div class="g-db-hero-a">
        <a class="g-db-btn g-db-btn-lime" href="/gogo/?mode=passenger"><span aria-hidden>${GICON("search")}</span> Find a ride</a>
        <a class="g-db-btn g-db-btn-ghost" href="/gogo/?mode=parcel"><span aria-hidden>${GICON("parcel")}</span> Send a parcel</a>
      </div>
    </section>

    <!-- ── the tab strip ── -->
    <div class="g-db-tabs" role="tablist">
      ${TABS.map((t, i) => `<button type="button" role="tab" class="g-db-tab${i === 0 ? " is-on" : ""}"
        aria-selected="${i === 0}" data-tab="${t.k}">${t.t}</button>`).join("")}
    </div>

    <!-- ── overview ── -->
    <div class="g-db-view is-on" data-view="overview">
      <p class="g-db-k">Summary</p>
      <div class="g-db-stats">
        ${STATS.map(s => `
          <a class="g-db-stat" href="${s.href}">
            <span class="g-db-stat-ic" aria-hidden>${s.ic}</span>
            <span class="g-db-stat-k">${s.k}</span>
            <span class="g-db-stat-n">${s.n}</span>
            <span class="g-db-stat-sub">${s.sub}</span>
          </a>`).join("")}
      </div>

      <div class="g-db-cols">
        <section class="g-db-card g-db-card-wide">
          <h2 class="g-db-card-h">Popular from ${city || "your city"}</h2>
          <!-- the six journeys people actually make from the rider's own city -->
          <div class="g-db-routes">
            ${routes.map(([to, why]) => `
              <a class="g-db-route" href="rides?from=${encodeURIComponent(city || "East London")}&to=${encodeURIComponent(to)}">
                <span class="g-db-route-ic" aria-hidden>${GICON("van")}</span>
                <span class="g-db-route-t">
                  <b>${city || "East London"} → ${to}</b>
                  <span>${why}</span>
                </span>
                <span class="g-db-route-go" aria-hidden>→</span>
              </a>`).join("")}
          </div>
          <p class="g-db-note">Door collection on every hike. The driver comes to your street.</p>
        </section>

      </div>
    </div>

    <!-- ── trips ── -->
    <div class="g-db-view" data-view="trips">
      <p class="g-db-k">Your bookings</p>
      ${bookings.length ? `
        <div class="g-db-list">
          ${bookings.map(b => `
            <a class="g-db-row" href="ride.html?id=${b.rideId || ""}">
              <span class="g-db-row-ic" aria-hidden>${GICON("van")}</span>
              <span class="g-db-row-t">
                <b>${b.to || "Ride"}</b>
                <span>${b.when || ""}${b.seats ? ` · ${b.seats} seat${b.seats > 1 ? "s" : ""}` : ""}</span>
              </span>
              <span class="g-db-row-go" aria-hidden>→</span>
            </a>`).join("")}
        </div>` : `
        <div class="g-db-empty">
          <span aria-hidden>${GICON("van")}</span>
          <b>No hikes yet</b>
          <p>Once you book a seat it shows here, with the driver and the live arrival time.</p>
          <a class="g-db-btn g-db-btn-lime" href="/gogo/?mode=passenger">Find a ride</a>
        </div>`}
    </div>

    <!-- ── parcels ── -->
    <div class="g-db-view" data-view="parcels">
      <p class="g-db-k">Parcels</p>
      ${parcels.length ? `
        <div class="g-db-list">
          ${parcels.map(p => `
            <a class="g-db-row" href="track.html?id=${p.id || ""}">
              <span class="g-db-row-ic" aria-hidden>${GICON("parcel")}</span>
              <span class="g-db-row-t">
                <b>${p.to || "Parcel"}</b>
                <span>${p.kg ? p.kg + " kg · " : ""}${p.status || "in transit"}</span>
              </span>
              <span class="g-db-row-go" aria-hidden>→</span>
            </a>`).join("")}
        </div>` : `
        <div class="g-db-empty">
          <span aria-hidden>${GICON("parcel")}</span>
          <b>No parcels yet</b>
          <p>Send something in the boot of a hike already going that way.</p>
          <a class="g-db-btn g-db-btn-lime" href="/gogo/?mode=parcel">Send a parcel</a>
        </div>`}
    </div>

    <!-- ── plan ── -->
    <div class="g-db-view" data-view="plan">
      <p class="g-db-k">Plan</p>
      <div class="g-db-cols">
        <section class="g-db-card">
          <h2 class="g-db-card-h">Where GOGO runs</h2>
          <p class="g-db-note">The N2 corridor and the towns around it. Every stop has its own fare.</p>
          <a class="g-db-link" href="rides">See every route <span aria-hidden>→</span></a>
        </section>
        <section class="g-db-card">
          <h2 class="g-db-card-h">Drive with GOGO</h2>
          <p class="g-db-note">List the trip you are already making and carry people heading your way.</p>
          <a class="g-db-link" href="driver">List a ride <span aria-hidden>→</span></a>
        </section>
      </div>
    </div>

    <!-- ── the folded-away detail, same accordion pattern as the reference ── -->
    ${panel("why", "Every ride, every time", "What the driver sees, and what you pay for.",
      `<ul class="g-db-bullets">
         <li>Your pickup address goes to the driver before they set off.</li>
         <li>The fare is set per stop, so hopping off early costs less.</li>
         <li>Card is held on booking and charged when the trip completes.</li>
         <li>Cash works too — fare plus both fees on boarding.</li>
       </ul>`)}
    ${panel("offer", "Refer a friend", "Give a friend their first ride and you both get points.",
      `<p class="g-db-note">Share your code, and points land in your balance once their first hike completes.</p>
       <a class="g-db-link" href="messages">Share it in a chat <span aria-hidden>→</span></a>`)}
  </div>`;

  /* ── the tab strip switches the view ──────────────────────────────────── */
  const tabs = document.querySelectorAll(".g-db-tab");
  const views = document.querySelectorAll(".g-db-view");
  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => {
      const on = x === t;
      x.classList.toggle("is-on", on);
      x.setAttribute("aria-selected", String(on));
    });
    views.forEach(v => v.classList.toggle("is-on", v.dataset.view === t.dataset.tab));
  }));

  /* ── the folded panels ────────────────────────────────────────────────── */
  document.querySelectorAll(".g-db-panel").forEach(p => {
    const head = p.querySelector(".g-db-panel-h");
    head.addEventListener("click", () => {
      const open = p.classList.toggle("is-open");
      head.setAttribute("aria-expanded", String(open));
    });
  });
}
