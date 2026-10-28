/* =========================================================================
   GOGO — DASHBOARD

   Rewritten. The old page was four separate bordered stat cards, a 2x2 route
   grid, and a tab strip that only filtered one of those blocks; the tabs looked
   interactive but three of the four showed the same content. It also inherited
   Cleanic's navy in places and used three different corner radii.

   THE SHAPE NOW
       hero          signed-in greeting, one primary action
       stat rail     one continuous rail, hairline dividers, no card-per-number
       tabs          four panels that each show real, different content
       footer rows   external links, quiet

   WHY A RAIL AND NOT FOUR CARDS
   Four equal cards with a border each is four boxes competing. The numbers are
   one thing — "your activity" — so they sit in one bordered rail divided by
   hairlines. Less ink, easier to scan, and it scales down to a phone without
   reflowing into a 2x2 of cramped boxes.

   MOTION
   Everything animates once, on entry, and never again. A dashboard is read, not
   performed: staggered fade-and-rise on the sections, a count-up on the
   numbers, and a left-to-right reveal on tab switching. All of it is disabled
   under prefers-reduced-motion.
   ========================================================================= */

const GOGODashboard = (() => {

  /* ── tiny helpers ─────────────────────────────────────────────────────── */
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const R = (n) => "R" + Number(n || 0).toFixed(2);

  function timeOfDay() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  function first(tok) {
    const s = String(tok || "").trim();
    if (!s) return "";
    return s.split(/\s+/)[0];
  }

  /* ── data ─────────────────────────────────────────────────────────────────
     Everything degrades to empty rather than inventing numbers. A dashboard
     that shows a fake "3" is worse than one that shows a real zero. */
  function readStore() {
    let store = {};
    try {
      if (typeof Store !== "undefined" && Store.get) store = Store.get() || {};
    } catch (e) { /* a broken store is an empty dashboard, not a crash */ }

    const bookings = Array.isArray(store.bookings) ? store.bookings : [];
    const parcels = Array.isArray(store.parcels) ? store.parcels : [];
    const chats = Array.isArray(store.chats) ? store.chats : [];

    const live = bookings.filter((b) => b && b.status && b.status !== "done");
    const seats = bookings.reduce((n, b) => n + (Number(b && b.seats) || 1), 0);
    const parcelsLive = parcels.filter((p) => p && p.status && p.status !== "delivered");

    return {
      bookings, parcels, chats,
      liveBookings: live,
      seats,
      parcelsSent: parcels.length,
      parcelsLive,
      points: Number(store.points) || 0,
    };
  }

  /* ── icons ────────────────────────────────────────────────────────────────
     Inline SVG with the same stroke grammar as the rest of GOGO: 24 viewBox,
     1.75 stroke, round caps. No emoji, no icon font. */
  const I = {
    seat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v9a2 2 0 0 0 2 2h9"/><path d="M6 19h12"/><path d="M15 11v6"/></svg>',
    parcel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.2 12 3.6l8.5 4.6v7.6L12 20.4l-8.5-4.6Z"/><path d="M3.5 8.2 12 12.8l8.5-4.6"/><path d="M12 12.8v7.6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 10.9 10.1 9Z"/></svg>',
    route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8.4 18h4.1a3 3 0 0 0 3-3V8.4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="M13 6.5 18.5 12 13 17.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.6V12l3 1.8"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.4"/><path d="M3.5 10h17"/><path d="M8 3v3.4"/><path d="M16 3v3.4"/></svg>',
  };

  /* ── routes ───────────────────────────────────────────────────────────── */
  const ROUTES = [
    { to: "Mthatha", via: "N2", dur: "3h" },
    { to: "Komani", via: "N6", dur: "2h" },
    { to: "Gqeberha", via: "N2", dur: "3h30" },
    { to: "Butterworth", via: "N2", dur: "1h30" },
  ];

  /* ── the page ─────────────────────────────────────────────────────────── */
  function render(user, data) {
    const name = first(user && (user.name || user.phonePretty)) || "there";
    const onboarded = !!(user && user.onboarded);
    const home = (user && user.home) || "East London";

    return `
    <div class="gdb">

      <!-- ── hero ──────────────────────────────────────────────────────── -->
      <section class="gdb-hero" data-anim="1">
        <p class="gdb-eyebrow">${esc(timeOfDay())}${onboarded ? ", " + esc(name) : ""}</p>
        <h1 class="gdb-h1">${onboarded
          ? "Where are you going today?"
          : "Welcome to GOGO"}</h1>
        <p class="gdb-sub">${onboarded
          ? "Seats and parcels, door to door, along the corridor."
          : "Finish your profile and your trips will start showing up here."}</p>

        <div class="gdb-actions">
          <a class="gdb-btn gdb-btn-lime" href="/gogo/">
            ${I.plus}<span>Find a ride</span>
          </a>
          <a class="gdb-btn gdb-btn-ghost" href="/gogo/parcel.html">
            ${I.parcel}<span>Send a parcel</span>
          </a>
        </div>
      </section>

      <!-- ── stat rail: one thing, not four boxes ─────────────────────── -->
      <section class="gdb-rail" data-anim="2" aria-label="Your activity">
        ${railItem("Seats", data.seats, "booked", I.seat, "/gogo/dashboard.html?tab=trips")}
        ${railItem("Parcels", data.parcelsSent, data.parcelsLive.length ? data.parcelsLive.length + " in transit" : "sent", I.parcel, "/gogo/dashboard.html?tab=parcels")}
        ${railItem("Points", data.points, "balance", I.spark, "/gogo/dashboard.html?tab=plan")}
      </section>

      <!-- ── tabs ─────────────────────────────────────────────────────── -->
      <div class="gdb-tabs" role="tablist" aria-label="Dashboard sections" data-anim="3">
        ${tab("overview", "Overview", true)}
        ${tab("trips", "My trips", false)}
        ${tab("parcels", "Parcels", false)}
        ${tab("plan", "Plan", false)}
      </div>

      <div class="gdb-panels">
        ${panel("overview", true, overviewPane(home, data))}
        ${panel("trips", false, tripsPane(data))}
        ${panel("parcels", false, parcelsPane(data))}
        ${panel("plan", false, planPane(home))}
      </div>

      <!-- ── quiet footer rows ────────────────────────────────────────── -->
      <section class="gdb-foot" data-anim="4">
        <a class="gdb-row" href="/gogo/why.html">
          <span class="gdb-row-t">How GOGO works</span>
          <span class="gdb-row-a">${I.arrow}</span>
        </a>
        <a class="gdb-row" href="/gogo/safety.html">
          <span class="gdb-row-t">Safety centre</span>
          <span class="gdb-row-a">${I.arrow}</span>
        </a>
      </section>

    </div>`;
  }

  function railItem(label, value, caption, icon, href) {
    return `
      <a class="gdb-stat" href="${href}">
        <span class="gdb-stat-ic" aria-hidden="true">${icon}</span>
        <span class="gdb-stat-n" data-count="${Number(value) || 0}">0</span>
        <span class="gdb-stat-l">${esc(label)}</span>
        <span class="gdb-stat-s">${esc(caption)}</span>
      </a>`;
  }

  function tab(id, label, on) {
    return `<button class="gdb-tab${on ? " on" : ""}" role="tab" type="button"
              id="gdb-tab-${id}" aria-controls="gdb-panel-${id}"
              aria-selected="${on ? "true" : "false"}" data-tab="${id}">${esc(label)}</button>`;
  }

  function panel(id, on, inner) {
    return `<section class="gdb-panel${on ? " on" : ""}" role="tabpanel"
              id="gdb-panel-${id}" aria-labelledby="gdb-tab-${id}"
              ${on ? "" : "hidden"} data-panel="${id}">${inner}</section>`;
  }

  /* ── panes ────────────────────────────────────────────────────────────── */

  function emptyState(title, line, cta) {
    return `
      <div class="gdb-empty">
        <span class="gdb-empty-ic" aria-hidden="true">${I.empty}</span>
        <p class="gdb-empty-t">${esc(title)}</p>
        <p class="gdb-empty-s">${esc(line)}</p>
        ${cta ? `<a class="gdb-btn gdb-btn-ink gdb-btn-sm" href="${cta.href}">${esc(cta.label)}</a>` : ""}
      </div>`;
  }

  function overviewPane(home, data) {
    const nextTrip = data.liveBookings[0];
    return `
      ${nextTrip ? `
        <div class="gdb-card gdb-next">
          <span class="gdb-label">Next trip</span>
          <div class="gdb-next-top">
            <span class="gdb-next-time">${esc(nextTrip.time || "06:30")}</span>
            <span class="gdb-pill">${esc(nextTrip.status || "Confirmed")}</span>
          </div>
          <p class="gdb-next-route">${esc(nextTrip.from || home)} → ${esc(nextTrip.to || "")}</p>
        </div>` : ""}

      <div class="gdb-card">
        <div class="gdb-card-head">
          <span class="gdb-label">Popular from ${esc(home)}</span>
          <a class="gdb-link" href="/gogo/rides.html">See all</a>
        </div>
        <div class="gdb-routes">
          ${ROUTES.map((r) => `
            <a class="gdb-route" href="/gogo/rides.html?to=${encodeURIComponent(r.to)}">
              <span class="gdb-route-main">
                <span class="gdb-route-to">${esc(r.to)}</span>
                <span class="gdb-route-via">${esc(r.via)}</span>
              </span>
              <span class="gdb-route-dur">${esc(r.dur)}</span>
            </a>`).join("")}
        </div>
      </div>`;
  }

  function tripsPane(data) {
    if (!data.liveBookings.length && !data.bookings.length) {
      return emptyState(
        "No trips yet",
        "Once you book a seat it appears here with the pickup time and driver.",
        { href: "/gogo/", label: "Find a ride" }
      );
    }
    const list = data.bookings.slice(0, 8);
    return `
      <div class="gdb-list">
        ${list.map((b) => `
          <a class="gdb-item" href="/gogo/track.html">
            <span class="gdb-item-ic" aria-hidden="true">${I.seat}</span>
            <span class="gdb-item-body">
              <span class="gdb-item-t">${esc(b.from || "")} → ${esc(b.to || "")}</span>
              <span class="gdb-item-s">${esc(b.time || "")}${b.status ? " · " + esc(b.status) : ""}</span>
            </span>
            <span class="gdb-item-r">${b.price ? R(b.price) : ""}</span>
          </a>`).join("")}
      </div>`;
  }

  function parcelsPane(data) {
    if (!data.parcels.length) {
      return emptyState(
        "No parcels",
        "Send something in a boot going your way and track it from here.",
        { href: "/gogo/parcel.html", label: "Send a parcel" }
      );
    }
    return `
      <div class="gdb-list">
        ${data.parcels.slice(0, 8).map((p) => `
          <a class="gdb-item" href="/gogo/track.html">
            <span class="gdb-item-ic" aria-hidden="true">${I.parcel}</span>
            <span class="gdb-item-body">
              <span class="gdb-item-t">${esc(p.to || p.destination || "Parcel")}</span>
              <span class="gdb-item-s">${esc(p.status || "In transit")}</span>
            </span>
            <span class="gdb-item-r">${p.price ? R(p.price) : ""}</span>
          </a>`).join("")}
      </div>`;
  }

  function planPane(home) {
    return `
      <div class="gdb-card">
        <span class="gdb-label">Typical departures</span>
        <p class="gdb-p">Vans leave through the morning and again in the afternoon. Pick a day to see
           exactly which seats are open on your route.</p>
        <div class="gdb-times">
          ${["06:30", "08:00", "10:00", "13:00", "15:30"].map((t) => `<span class="gdb-time">${t}</span>`).join("")}
        </div>
        <a class="gdb-btn gdb-btn-ink gdb-btn-sm" href="/gogo/rides.html">Check ${esc(home)} seats</a>
      </div>`;
  }

  /* ── motion ───────────────────────────────────────────────────────────────
     One pass, then done. Reduced motion turns all of it off. */
  const reduced = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function animateIn(host) {
    const items = [...host.querySelectorAll("[data-anim]")];
    if (reduced()) {
      items.forEach((el) => el.classList.add("in"));
      countUp(host, true);
      return;
    }
    items.forEach((el, i) => {
      setTimeout(() => el.classList.add("in"), 60 + i * 70);
    });
    setTimeout(() => countUp(host, false), 220);
  }

  function countUp(host, instant) {
    host.querySelectorAll("[data-count]").forEach((el) => {
      const target = Number(el.getAttribute("data-count")) || 0;
      if (instant || !target) { el.textContent = target; return; }

      const dur = 620;
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / dur);
        /* easeOutCubic: fast then settling, so it reads as arriving rather
           than as a progress bar */
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * eased);
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = target;
      }
      requestAnimationFrame(tick);
    });
  }

  function wireTabs(host) {
    const tabs = [...host.querySelectorAll("[data-tab]")];
    const panels = [...host.querySelectorAll("[data-panel]")];

    function select(id, focus) {
      tabs.forEach((t) => {
        const on = t.getAttribute("data-tab") === id;
        t.classList.toggle("on", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.setAttribute("tabindex", on ? "0" : "-1");
        if (on && focus) t.focus();
      });
      panels.forEach((p) => {
        const on = p.getAttribute("data-panel") === id;
        p.hidden = !on;
        p.classList.toggle("on", on);
        if (on && !reduced()) {
          /* replay the reveal so switching feels like arriving somewhere */
          p.classList.remove("reveal");
          void p.offsetWidth;
          p.classList.add("reveal");
        }
      });
      /* keep the URL shareable without a reload */
      try {
        const u = new URL(location.href);
        if (id === "overview") u.searchParams.delete("tab");
        else u.searchParams.set("tab", id);
        history.replaceState({}, "", u);
      } catch (e) { /* ignore */ }
    }

    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t.getAttribute("data-tab"), false));
      t.addEventListener("keydown", (e) => {
        /* arrow keys move between tabs, per the ARIA tabs pattern */
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
        select(tabs[next].getAttribute("data-tab"), true);
      });
    });

    /* honour ?tab= so the stat rail links land on the right panel */
    let want = "overview";
    try {
      const q = new URLSearchParams(location.search).get("tab");
      if (q && tabs.some((t) => t.getAttribute("data-tab") === q)) want = q;
    } catch (e) { /* default */ }
    select(want, false);
  }

  /* ── boot ─────────────────────────────────────────────────────────────── */
  async function boot() {
    const host = document.getElementById("main");
    if (!host) return;

    /* who is signed in. The dashboard gate has already redirected guests, so
       this should always resolve — but it must not render a name it cannot
       verify, so a failure falls back to a generic greeting. */
    let user = null;
    try {
      if (typeof GOGOAuth !== "undefined" && GOGOAuth.me) user = await GOGOAuth.me();
    } catch (e) { /* generic greeting */ }

    const data = readStore();
    host.innerHTML = render(user, data);

    animateIn(host);
    wireTabs(host);
  }

  return { boot, render };
})();

window.GOGODashboard = GOGODashboard;
