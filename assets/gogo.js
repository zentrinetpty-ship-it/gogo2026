/* =========================================================================
   GOGO — app engine
   One small vanilla store + renderer. State lives in localStorage so the whole
   flow (list → search → request → accept → full → depart) actually works.
   ========================================================================= */

const KEY = "gogo_state_v1";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const money = n => "R" + Number(n || 0).toFixed(0);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const VAN_SVG = '<svg class="g-van" viewBox="0 0 48 26" aria-hidden="true"><path fill-rule="evenodd" d="M3.4 18.8 L3.4 15 L5.6 14.8 L6.6 11.6 L11 9 L16.2 6.4 L37.4 6.4 L42.2 10.2 L45 13.4 L45.6 15.2 L45.6 18.8 Z M17.6 8.2 L25.2 8.2 L25.2 12.2 L16.4 12.2 Z M26.8 8.2 L35.6 8.2 L39.4 11.6 L39.4 12.2 L26.8 12.2 Z"/><circle cx="13.1" cy="18.8" r="3.5"/><circle cx="34.1" cy="18.8" r="3.5"/><rect x="4.9" y="12.6" width="2.6" height="1.7" rx="0.6"/><rect x="44.2" y="13.6" width="1.8" height="1.7" rx="0.6"/></svg>';
const van = () => VAN_SVG;

/* the front half of the car, cut off at the rear so it reads as driving out from
   behind the wordmark. Its front wheel is the same tyre. Faces right. */
const CAR_SVG = '<svg class="g-car" viewBox="0 0 44 26" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M0 6h13l9 8 11 1c3.4.3 6 1.6 7 4.2l.4 1c.3.9-.3 1.8-1.2 1.8H0V6Zm4.6 3.6h7.2l4.6 4.6H4.6V9.6Z"/><circle class="g-hub" cx="27" cy="20.6" r="4.2" fill="none" stroke="currentColor" stroke-width="8.91"/><circle class="g-hub" cx="27" cy="20.6" r="1.3"/><circle class="g-lamp" cx="36.6" cy="17.4" r="1.5"/></svg>';
  '</svg>';
const initials = n => String(n || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();

/* ── seed data ──────────────────────────────────────────────────────────── */
const CITIES = ["East London", "Komani", "Cala", "Ngcobo", "Butterworth", "Idutywa", "Mthatha", "Mthatha CBD",
  "Kokstad", "Port Shepstone", "Durban", "Fort Beaufort", "Makhanda", "Gqeberha", "Cradock", "Beaufort West",
  "Cape Town", "Johannesburg", "Queenstown", "Stutterheim", "Mount Frere", "Bizana", "Port St Johns"];

function seed() {
  const now = new Date();
  const at = (h, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const R = (id, driver, o) => Object.assign({
    id, driver, rating: 4.8, trips: 120, vehicle: "Toyota Quantum", plate: "EC 0000", colour: "White",
    from: "East London", to: "Mthatha", depart: at(7, 0), seatsTotal: 6, luggage: "Boot space",
    stops: [], fare: 230, requests: [], status: "open",
    /* boot space is its own capacity: parcels ride here, never in a seat */
    bootCapacityKg: 50, ratePerKg: 12,
  }, o);

  const data = {
    me: {
      name: "Bee", phone: "078 047 2090", home: "East London",
      places: [],
    },

    /* ── 10 Eastern Cape drivers, each with a live ride ── */
    rides: [
      R("g1", "Sipho M.", { rating: 4.9, trips: 214, vehicle: "Toyota Quantum", plate: "EC 4521", colour: "White",
        from: "East London", to: "Mthatha", depart: at(6, 30), seatsTotal: 6,
        stops: [{ city: "Komani", time: "08:10", fare: 120 }, { city: "Butterworth", time: "09:25", fare: 170 }, { city: "Idutywa", time: "10:05", fare: 195 }], fare: 230 }),

      R("g2", "Luyanda K.", { rating: 4.7, trips: 96, vehicle: "Toyota Avanza", plate: "EC 8837", colour: "Silver",
        from: "East London", to: "Mthatha", depart: at(8, 0), seatsTotal: 5,
        stops: [{ city: "Komani", time: "09:40", fare: 130 }, { city: "Cala", time: "10:50", fare: 165 }, { city: "Ngcobo", time: "11:30", fare: 185 }], fare: 240 }),

      R("g3", "Thabo N.", { rating: 5.0, trips: 341, vehicle: "Hyundai H1", plate: "EC 2210", colour: "Grey",
        from: "East London", to: "Komani", depart: at(9, 15), seatsTotal: 7, luggage: "Trailer",
        stops: [{ city: "Stutterheim", time: "10:20", fare: 90 }], fare: 150 }),

      R("g4", "Andile P.", { rating: 4.6, trips: 58, vehicle: "VW Polo Vivo", plate: "EC 7745", colour: "Blue",
        from: "East London", to: "Mthatha", depart: at(11, 30), seatsTotal: 4, luggage: "Hand luggage only",
        stops: [{ city: "Idutywa", time: "13:20", fare: 190 }], fare: 250 }),

      R("g5", "Zola B.", { rating: 4.8, trips: 127, vehicle: "Toyota Quantum", plate: "EC 5590", colour: "White",
        from: "Mthatha", to: "East London", depart: at(14, 0), seatsTotal: 6,
        stops: [{ city: "Butterworth", time: "15:20", fare: 170 }, { city: "Komani", time: "16:40", fare: 120 }], fare: 230 }),

      R("g6", "Nomvula S.", { rating: 4.8, trips: 168, vehicle: "Toyota Hiace", plate: "EC 3312", colour: "White",
        from: "Mthatha", to: "Durban", depart: at(7, 15), seatsTotal: 6,
        stops: [{ city: "Kokstad", time: "08:40", fare: 180 }, { city: "Port Shepstone", time: "09:50", fare: 260 }], fare: 330 }),

      R("g7", "Bongani T.", { rating: 4.7, trips: 92, vehicle: "Nissan NV350", plate: "EC 9084", colour: "White",
        from: "East London", to: "Gqeberha", depart: at(10, 30), seatsTotal: 5,
        stops: [{ city: "Qonce", time: "11:10", fare: 120 }, { city: "Makhanda", time: "12:10", fare: 160 }], fare: 220 }),

      R("g8", "Aphiwe M.", { rating: 4.9, trips: 302, vehicle: "Toyota Quantum", plate: "EC 6673", colour: "White",
        from: "East London", to: "Johannesburg", depart: at(18, 0), seatsTotal: 6, luggage: "Boot space",
        stops: [{ city: "Mthatha", time: "20:30", fare: 230 }, { city: "Kokstad", time: "22:10", fare: 320 }, { city: "Durban", time: "23:50", fare: 420 }], fare: 560 }),

      R("g9", "Sibusiso R.", { rating: 4.6, trips: 74, vehicle: "Ford Transit", plate: "EC 1145", colour: "Silver",
        from: "Mthatha", to: "Cape Town", depart: at(16, 30), seatsTotal: 6,
        stops: [{ city: "Komani", time: "18:10", fare: 150 }, { city: "Cradock", time: "19:30", fare: 260 }, { city: "Beaufort West", time: "22:40", fare: 430 }], fare: 520 }),

      R("g10", "Khanyisa D.", { rating: 4.8, trips: 141, vehicle: "Toyota Avanza", plate: "EC 4420", colour: "White",
        from: "Butterworth", to: "Mthatha", depart: at(12, 0), seatsTotal: 5,
        stops: [{ city: "Idutywa", time: "12:45", fare: 80 }], fare: 130 }),

      /* a second run for a driver already on the corridor, so the Komani -> coast
         route is coverable too (still ten drivers, eleven live rides) */
      R("g11", "Andile P.", { rating: 4.6, trips: 58, vehicle: "VW Polo Vivo", plate: "EC 7745", colour: "Blue",
        from: "Komani", to: "Gqeberha", depart: at(13, 0), seatsTotal: 4, luggage: "Hand luggage only",
        stops: [{ city: "Fort Beaufort", time: "13:45", fare: 90 }, { city: "Makhanda", time: "14:35", fare: 140 }], fare: 190 }),
    ],

    /* no mocked passengers: real accounts only */
    passengers: [],

    /* nothing pre-filled: the feed fills as you use the app */
    activity: [],
    threads: [],
    safety: { selfies: [], log: [], consent: {} },
    alerts: [],
    seq: 100,
  };

  /* no pre-seeded requests: every booking on the board is a real one */
  return data;
}

/* ── state ──────────────────────────────────────────────────────────────── */
let S = load();
function load() { try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : seed(); } catch { return seed(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
function reset() { S = seed(); save(); }

const ride = id => S.rides.find(r => r.id === id);
const seatsTaken = r => (r.requests || []).filter(q => q.status === "accepted").reduce((n, q) => n + Number(q.seats || 1), 0);
const seatsLeft = r => Math.max(0, r.seatsTotal - seatsTaken(r));
/* claimed = accepted + still-pending holds; open = what a new passenger can book */
const seatsHeld = r => (r.requests || []).reduce((n, q) => n + Number(q.seats || 1), 0);
const seatsOpen = r => Math.max(0, r.seatsTotal - seatsHeld(r));
const isMine = r => (r.requests || []).some(q => q.status === "accepted" && q.phone === S.me.phone);

/* ── itemised money: every rand shown as its own line, no hidden rounding ── */
function feeTable(L, note) {
  if (!L) return "";
  return `
    <div class="g-fees">
      <div class="g-fees-h"><span class="g-label">Fare breakdown</span></div>
      ${L.rows.map(row => `
        <div class="g-fee-row"><span>${esc(row.label)}</span><b>${rands(row.val)}</b></div>`).join("")}
      <div class="g-fee-row g-fee-total"><span>Total</span><b>${rands(L.total)}</b></div>
      ${note ? `<p class="g-s-sm g-fees-n">${esc(note)}</p>` : ""}
    </div>`;
}

/* ── the wordmark ─────────────────────────────────────────────────────────
   GO + the swap mark + GO. Two lines that fold once each — the top runs right
   and folds down, the bottom runs left and folds up — so the pair reads as one
   return trip rather than two arrows.

   Everything is in em so the mark holds its proportion at any font-size.
   stroke 5.8 of a 24-unit viewBox = 0.193em, measured against Anton's own
   0.210em stem. Butt caps and miter joins: rounded ends would contradict the
   squared 2px language the rest of the interface uses.

   Built here rather than written into 18 pages, so the mark has ONE definition
   and the pages cannot drift apart. */
var BRAND_MARK = '<svg viewBox="0 0 34 24" width=".72em" height=".51em" aria-hidden="true" style="display:block;flex:0 0 auto"><g fill="none" stroke-width="5.8" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="6"><path d="M3 7h26" stroke="currentColor"/><path d="M23 3l6 4-6 4" stroke="currentColor"/><path d="M31 17H5" stroke="currentColor"/><path d="M11 13l-6 4 6 4" stroke="currentColor"/></g></svg>';
function brandWord() {
  return '<span class="g-brand-word"><span class="g-brand-a">GO</span>' +
         '<span class="g-brand-mk">' + BRAND_MARK + '</span>' +
         '<span class="g-brand-b">GO</span></span>';
}

/* ── chrome: nav, dock, toast, reveal ───────────────────────────────────── */
function paintChrome(active) {
  const nav = $('#nav'); if (nav) nav.removeAttribute('style');
  const links = [["/gogo/", "Book a ride", "home"], ["why", "Why GOGO", "why"], ["rides", "Find rides", "rides"], ["messages", "Chats", "messages"], ["rider", "My trips", "rider"], ["driver", "Drive with GOGO", "driver"], ["more", "More", "more"], ["ops", "Ops", "ops"]];
  if (nav) nav.innerHTML = `
    <a class="g-brand" href="/gogo/" aria-label="GO GO, home">${brandWord()}</a>
    <nav class="g-nav-links">
      ${links.map(([h, t, k]) => `<a href="${h}" class="${k === active ? "on" : ""}">${t}</a>`).join("")}
    </nav>
    <div class="g-nav-right">
      <a class="g-btn g-btn-outline g-btn-sm" href="rides"><span aria-hidden>🔍</span> Find a hike</a>
      <a class="g-btn g-btn-ink g-btn-sm" href="driver">${van()} List a ride</a>
    </div>`;

  const dock = $('#dock');
  if (dock) {
    /* The same four items as the landing, so the nav never changes shape.
       Parcel has no tab of its own — it is a mode on the booking card and a
       section of the dashboard, and parcel.html / track.html / driver.html all
       live under Dashboard along with the trips and the ride pages. */
    const dockItems = [
      ["/gogo/", ["landing"], "🏠", "Home"],
      ["dashboard", ["dashboard", "home", "rides", "ride", "parcel", "track", "driver"], "📊", "Dashboard"],
      ["messages", ["messages"], "💬", "Messages"],
      ["more", ["more", "why", "safety", "terms", "privacy", "ops", "rider", "auth"], "⋯", "More"],
    ];
    dock.innerHTML = dockItems.map(([h, keys, e, t]) =>
      `<a href="${h}" class="${keys.includes(active) ? "on" : ""}"><span aria-hidden>${e}</span>${t}</a>`
    ).join("");
  }

  const WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.54 2 2.08 6.46 2.08 11.96c0 1.76.46 3.42 1.27 4.86L2 22l5.3-1.38c1.4.76 3 1.2 4.74 1.2 5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm5.8 14.06c-.24.68-1.4 1.3-1.94 1.34-.54.05-1.03.24-3.5-.72-2.98-1.18-4.86-4.24-5-4.44-.15-.2-1.2-1.6-1.2-3.05 0-1.44.76-2.15 1.03-2.44.27-.29.58-.36.78-.36h.55c.18 0 .42-.07.65.5.24.58.8 1.98.87 2.12.07.15.12.32.02.51-.1.2-.15.32-.29.49l-.44.51c-.15.15-.3.31-.13.6.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.29 2.33 1.44.29.15.46.12.63-.07.17-.2.73-.85.93-1.14.19-.29.39-.24.65-.15.27.1 1.68.79 1.97.94.29.15.48.22.55.34.07.12.07.7-.17 1.38Z"/></svg>';
  const X_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.53 3h3.02l-6.6 7.54L21.75 21h-5.9l-4.62-6.04L5.9 21H2.87l7.06-8.07L2.25 3h6.05l4.18 5.52L17.53 3Zm-1.06 16.2h1.67L7.6 4.71H5.8l10.67 14.49Z"/></svg>';
  const IG_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="8.91" stroke-linecap="round" aria-hidden="true"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>';
  const MAIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="8.91" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.6" y="4.6" width="18.8" height="14.8" rx="3"/><path d="m3.4 6.6 8.6 6.2 8.6-6.2"/></svg>';
  const SOCIAL = [
    ["https://wa.me/27780472090", "WhatsApp", WA_SVG],
    ["https://x.com/gogohike", "X", X_SVG],
    ["https://instagram.com/gogohike", "Instagram", IG_SVG],
    ["mailto:order@cleanic.co.za", "Email", MAIL_SVG],
  ];
  const f = $('#footer');
  if (f) f.innerHTML = `
    <div class="g-wrap g-f1">
      <div class="g-f1-top">
        <a class="g-brand g-brand-foot" href="/gogo/" aria-label="GOGO, home">${brandWord()}</a>
        <p class="g-f1-tag">Long-distance seats and parcels, door to door.</p>
      </div>
      <nav class="g-f1-nav" aria-label="Footer">
        ${[["/gogo/", "Home"], ["rides", "Find rides"], ["driver", "List a ride"], ["why", "Why GOGO"],
           ["safety", "Safety"], ["terms", "Terms"], ["privacy", "Privacy"], ["more", "More"]].map(([h, t]) =>
          `<a class="g-f1-link" href="${h}"><span>${t}</span></a>`).join("")}
      </nav>
      <div class="g-f1-bottom">
        <div class="g-f1-social">
          ${SOCIAL.map(([h, t, i]) => `<a class="g-f1-soc" href="${h}" aria-label="${t}" title="${t}"${h.indexOf("http") === 0 ? ' target="_blank" rel="noopener"' : ""}>${i}</a>`).join("")}
        </div>
        <p class="g-f1-legal">© ${new Date().getFullYear()} GOGO · <a href="terms">Terms</a> · <a href="privacy">Privacy</a></p>
      </div>
    </div>`;

  /* reveal the footer the first time it scrolls into view */
  const f1 = f && f.querySelector('.g-f1');
  if (f1) {
    if (!('IntersectionObserver' in window)) f1.classList.add('in');
    else {
      const io = new IntersectionObserver(rows => {
        rows.forEach(r => { if (r.isIntersecting) { f1.classList.add('in'); io.disconnect(); } });
      }, { rootMargin: '0px 0px -60px 0px' });
      io.observe(f1);
    }
  }

}

let toastT;
function toast(html) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'g-toast'; document.body.appendChild(t); }
  t.innerHTML = html; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3400);
}

function reveal() {
  const items = $$('.g-anim');
  if (!('IntersectionObserver' in window)) { items.forEach(i => i.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: "0px 0px -40px 0px" });
  items.forEach((i, n) => { i.style.transitionDelay = Math.min(n * 45, 300) + "ms"; io.observe(i); });
  setTimeout(() => items.forEach(i => i.classList.add('in')), 120);
}

function grow() {
  setTimeout(() => {
    $$('[data-w]').forEach(n => { n.style.width = n.dataset.w + "%"; });
    $$('[data-h]').forEach(n => { n.style.height = n.dataset.h + "%"; });
  }, 220);
}

function countUp(el, target, prefix = "", suffix = "", dur = 1000) {
  if (!el) return;
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + (target * e).toFixed(target % 1 ? 1 : 0) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ── shared fragments ───────────────────────────────────────────────────── */
function seatMeter(r) {
  const taken = seatsTaken(r);
  return `<span class="g-seats" title="${taken} of ${r.seatsTotal} seats taken">
    ${Array.from({ length: r.seatsTotal }, (_, i) => `<span class="g-seat ${i < taken ? "taken" : ""}"></span>`).join("")}
    <span class="g-s-sm" style="margin-left:5px">${seatsOpen(r)} seat${seatsOpen(r) === 1 ? "" : "s"} left</span></span>`;
}

function stopsLine(r) {
  const all = [r.from, ...r.stops.map(s => s.city), r.to];
  return all.map((c, i) => `${i ? '<i></i>' : ""}<span>${esc(c)}</span>`).join("");
}

/* a seat is need-to-know: the plate shows to the driver and to anyone whose
   own seat on this ride has been accepted, nobody else */
function myAcceptedSeat(r) {
  const me = String((S.me && S.me.phone) || "").replace(/[^\d+]/g, "");
  if (!me) return null;
  return (r.requests || []).find(q => String(q.phone || "").replace(/[^\d+]/g, "") === me && q.status === "accepted") || null;
}

function rideCard(r) {
  /* ── one ride, as a boarding pass ──────────────────────────────────────────
     The shape follows the flight-card pattern: the big town codes sit on the
     two ends with times above them, the journey runs through the middle, a
     dashed rule carries the date and separates the journey from the facts, and
     who is driving / how full / what it costs sit underneath as three centred
     columns. Everything is centred rather than pushed to the edges, so a card
     in a wide column still reads as one object. */
  const t = new Date(r.depart);
  const timeTxt = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateTxt = t.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  const left = seatsOpen(r), full = left === 0, taken = seatsHeld(r);
  const dur = tripDuration(r);
  const dep = townCodeOf(r.from), arr = townCodeOf(r.to);
  const pct = Math.round((taken / Math.max(1, r.seatsTotal)) * 100);

  return `
    <article class="g-rc${full ? " g-rc-full" : ""}" data-ride="${r.id}">

      <div class="g-rc-journey">
        <div class="g-rc-end">
          <span class="g-rc-time">${timeTxt}</span>
          <b class="g-rc-code">${esc(dep.code)}</b>
          <span class="g-rc-town">${esc(dep.name)}</span>
        </div>

        <div class="g-rc-mid">
          <span class="g-rc-veh">${esc(r.vehicle)}</span>
          <span class="g-rc-line" aria-hidden><i></i><span class="g-rc-van">${VAN_SVG}</span><i></i></span>
          <span class="g-rc-dur">${dur}</span>
        </div>

        <div class="g-rc-end">
          <span class="g-rc-time">${etaOf(r)}</span>
          <b class="g-rc-code">${esc(arr.code)}</b>
          <span class="g-rc-town">${esc(arr.name)}</span>
        </div>
      </div>

      <div class="g-rc-dash" aria-hidden><span>${dateTxt}</span></div>

      <div class="g-rc-facts">
        <span class="g-rc-fact">
          <span class="g-rc-fact-l">Driver</span>
          <span class="g-rc-fact-v">${esc(r.driver)}</span>
          <span class="g-rc-fact-s">★ ${r.rating} · ${r.trips} trips</span>
        </span>
        <span class="g-rc-fact">
          <span class="g-rc-fact-l">Seats</span>
          <span class="g-rc-fact-v">${left} left</span>
          <span class="g-rc-bar" aria-hidden><i style="width:${pct}%"></i></span>
        </span>
        <span class="g-rc-fact">
          <span class="g-rc-fact-l">Per seat</span>
          <span class="g-rc-fact-v g-money">${money(r.fare)}</span>
          <span class="g-rc-fact-s">${r.luggage === "boot" ? "Boot space" : "Hand luggage"}</span>
        </span>
      </div>

      ${r.stops.length ? `<div class="g-rc-stops">${r.stops.map(s => `<span class="g-rc-stop">${esc(s.city)} <b>${money(s.fare)}</b></span>`).join("")}</div>` : ""}

      <a class="g-btn g-btn-sm g-rc-go" href="ride.html?id=${r.id}${rideQuery()}">${full ? "View ride" : "Join this ride"}</a>
    </article>`;
}


/* The search context travels with the ride link, so opening a ride from the
   results keeps the seats, day and pickup the user already chose. Nothing is
   re-asked on the next screen. */
function rideQuery() {
  const q = parseQuery();
  const keep = new URLSearchParams();
  ["from", "to", "seats", "when", "luggage", "pickup", "slot"].forEach(k => {
    if (q[k]) keep.set(k, q[k]);
  });
  const s = keep.toString();
  return s ? "&" + s : "";
}

/* the SA town code for a name, from the shared dataset */
function townCodeOf(name) {
  return window.GOGOTownCodes
    ? window.GOGOTownCodes.codeFor(name)
    : { code: String(name || "").slice(0, 2).toUpperCase(), name: name, province: null };
}

/* how long the trip takes, from the corridor's own timings */
function tripDuration(r) {
  const mins = 3 * 60 + (r.stops.length * 25);          /* base run plus each stop */
  const h = Math.floor(mins / 60), m = mins % 60;
  return h + "h" + (m ? " " + m + "m" : "");
}

/* the arrival clock time, derived from the departure */
function etaOf(r) {
  const mins = 3 * 60 + (r.stops.length * 25);
  const t = new Date(new Date(r.depart).getTime() + mins * 60000);
  return t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseQuery() { return Object.fromEntries(new URLSearchParams(location.search).entries()); }

/* ── PAGE: landing / book ───────────────────────────────────────────────── */
function pageHome() {
  $('#main').insertAdjacentHTML('beforeend', `
  <div class="g-hero">
    <div class="g-hero-map" id="heroMap" aria-hidden="true"></div>
    <div class="g-hero-scrim" aria-hidden="true"></div>
    <span class="g-hero-credit">Map data © OpenStreetMap contributors · Esri</span>
    <div class="g-wrap g-hero-inner">
      <div class="g-anim g-hero-left">
        <h1 class="g-impact">Smart Hike.<br><span class="g-strike">Zero Queue.</span></h1>
        <div class="g-eyebrow">Your seat, your <b>doorstep</b></div>
        <p class="g-lead"><b>Door collection, verified drivers.</b><br>Book a seat on a hike leaving your street, and let the people who love you watch the whole way.</p>
        <div class="g-row g-hero-ctas">
          <a class="g-btn g-btn-lime g-glow" href="driver"><span class="g-bk-ic" aria-hidden>${VAN_SVG}</span> List a ride</a>
          <a class="g-btn g-btn-soft" href="why"><span aria-hidden>&#10024;</span> Why GOGO</a>
        </div>
        <div class="g-wordmarks">
          <span class="g-wordmark"><span class="g-pulse" aria-hidden></span><b id="k1">0</b> live rides</span>
          <span class="g-wordmark"><span class="g-wm-ic" aria-hidden>&#128186;</span><b id="k2">0</b> seats open</span>
          <span class="g-wordmark"><span class="g-wm-ic" aria-hidden>&#128205;</span><b id="k3">0</b> towns on the map</span>
        </div>
      </div>

      <form class="g-book" id="bookForm" novalidate>
        <div class="g-bk-seg" id="modeSeg" role="tablist" aria-label="What are you sending">
          <button type="button" class="on" data-mode="passenger" role="tab" aria-selected="true">🧍 Passenger</button>
          <button type="button" data-mode="parcel" role="tab" aria-selected="false">📦 Parcel</button>
        </div>

        <div class="g-bk-sec">
          <div class="g-bk-pair">
            <div class="g-bk-fld g-bk-fld-pick">
              <label class="g-bk-lab" for="from">
                <span class="g-ic-sq lime" aria-hidden>&#128205;</span> <span id="fromLab">Pickup</span>
              </label>
              <div class="g-bk-inwrap">
                <input id="from" class="g-bk-in" type="text" name="address" value="" placeholder="Start typing your address" autocomplete="off" enterkeyhint="next" aria-autocomplete="list" aria-controls="fromList" aria-expanded="false">
                  <!-- suggestions for #from. Google Places, national coverage: a
                       ride can start anywhere in South Africa, so there is no
                       location bias here, unlike the laundry app which only
                       collects in one city. -->
                  <div id="fromList" class="g-from-list" role="listbox" hidden></div>
              </div>
              <div class="g-bk-fld">
              <div class="g-bk-labrow">
              <label class="g-bk-lab" for="to">
                <span class="g-ic-sq amber" aria-hidden>&#127937;</span> <span id="toLab">Destination</span>
              </label>
              </div>
              <div class="g-bk-inwrap">
                <input id="to" class="g-bk-in" type="text" name="destination" value="" placeholder="Select destination city" readonly aria-haspopup="listbox" enterkeyhint="none">
              </div>
            </div>
          </div>
          <div class="g-hint" id="bookHint"><span aria-hidden>&#128656;</span> We come to your street. Type a town, or a whole province</div>
        </div>

        <div class="g-bk-sec">
          <h3 class="g-bk-h"><span aria-hidden>&#127903;&#65039;</span> Details</h3>
          <div class="g-bk-row">
            <button type="button" class="g-bk-info" id="whenBtn" aria-describedby="whenLabel">
              <span class="g-ic-sq" aria-hidden>&#128197;</span><span id="whenLabel">Today</span>
            </button>
            <button type="button" class="g-bk-info" id="slotBtn" aria-haspopup="dialog">
              <span class="g-ic-sq" aria-hidden>&#128341;</span><span id="slotLabel">Any time</span>
            </button>
          </div>
          <div class="g-bk-row" id="paxRow">
            <button type="button" class="g-bk-info" id="seatBtn">
              <span class="g-ic-sq lime" aria-hidden>&#128186;</span><span id="seatLabel">1 seat</span>
            </button>
            <button type="button" class="g-bk-info" id="lugBtn">
              <span class="g-ic-sq amber" aria-hidden>&#129523;</span><span id="lugLabel">Hand luggage</span>
            </button>
          </div>
          <div class="g-bk-row" id="parcelRow" hidden>
            <label class="g-bk-info" for="weightKg">
              <span class="g-ic-sq lime" aria-hidden>&#9878;&#65039;</span>
              <input id="weightKg" class="g-bk-num" type="number" min="1" max="200" step="1" inputmode="decimal" placeholder="Weight">
              <span class="g-bk-unit">kg</span>
            </label>
            <button type="button" class="g-bk-info" id="sizeBtn" aria-haspopup="dialog">
              <span class="g-ic-sq amber" aria-hidden>&#128230;</span><span id="sizeLabel">Small</span>
            </button>
          </div>
          <div class="g-bk-inwrap" id="descWrap" hidden>
            <input id="desc" class="g-bk-in" type="text" placeholder="What is inside? e.g. 2 boxes of clothing" maxlength="140">
          </div>
        </div>

        <div class="g-bk-sec" id="boardingSec">
          <h3 class="g-bk-h"><span aria-hidden>&#127915;</span> Boarding</h3>
          <div class="g-seg" id="pickSeg">
            <button type="button" class="on" data-onto="seat">I am boarding</button>
            <button type="button" data-onto="stop">Just to a stop</button>
          </div>
        </div>

        <button class="g-btn g-bk-submit g-shimmer" type="submit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="8.91" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg> <span id="submitLab">Find a hike</span> <span aria-hidden>&#9889;</span></button>
        <p class="g-s-sm g-bk-fee" id="feeNote"></p>

        <select id="when" class="g-sr" tabindex="-1" aria-hidden="true">
          <option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="any">Any day</option>
        </select>
        <select id="seats" class="g-sr" tabindex="-1" aria-hidden="true">
          <option>1</option><option>2</option><option>3</option><option>4</option>
        </select>
        <select id="luggage" class="g-sr" tabindex="-1" aria-hidden="true">
          <option value="hand">Hand luggage</option><option value="boot">Boot space</option><option value="trailer">Trailer</option>
        </select>
        <select id="slot" class="g-sr" tabindex="-1" aria-hidden="true">
          <option value="">Any time</option>
          <option value="6">06:00 – 08:00</option>
          <option value="8">08:00 – 10:00</option>
          <option value="10">10:00 – 12:00</option>
          <option value="12">12:00 – 14:00</option>
          <option value="14">14:00 – 16:00</option>
          <option value="16">16:00 – 18:00</option>
          <option value="18">18:00 – 20:00</option>
          <option value="20">20:00 – 22:00</option>
        </select>
      </form>
    </div>
  </div>

  <div class="g-wrap g-section">
    <div class="g-between g-anim">
      <div><span class="g-live-tag"><span class="g-pulse" aria-hidden></span> Popular hikes</span><h2 class="g-h2 g-mt-sm">Routes leaving every day</h2></div>
      <a class="g-btn g-btn-ghost g-btn-sm" href="rides">See all rides</a>
    </div>
    <div class="g-grid g-mt" id="popRoutes"></div>
  </div>

  <div class="g-wrap g-section" id="howBand" style="padding-top:0">
    <div class="g-grid">
      <div class="g-6 g-anim">
        <span class="g-label">How GOGO works</span>
        <h2 class="g-h2 g-mt-sm">One ride, many doorsteps</h2>
        <div class="g-mt">
          ${[
            ["🧾", "A driver lists the ride", "East London to Mthatha, with the stops along the way and a fare per stop."],
            ["📲", "You request a seat", "Your street, your seats. The driver sees everyone waiting on the route."],
            ["✅", "The driver accepts", "Seats fill one by one until the car is full. Then the pickups begin."],
            [VAN_SVG, "The car comes to you", "Pickups run in route order: Southernwood, then Queenstown, then onward."],
          ].map(([e, t, s]) => `
            <div class="g-list-row"><span class="g-ic" aria-hidden>${e}</span>
              <div><div class="g-list-t">${t}</div><div class="g-list-s">${s}</div></div></div>`).join("")}
        </div>
      </div>

      <div class="g-6 g-anim">
        <div class="g-card g-card-dark g-glow">
          <span class="g-label">For drivers</span>
          <h2 class="g-h2 g-mt-sm">Fill your car before you leave</h2>
          <p class="g-s g-mt-sm">You are already driving to Mthatha. List the ride, take requests from the route, and cover your fuel before you turn the key.</p>
          <div class="g-grid g-mt" style="grid-template-columns:repeat(3,1fr);gap:10px">
            ${[["💰", "Earn per seat"], ["🛣️", "Add your stops"], ["🧾", "One trip list"]].map(([e, t]) => `
              <div class="g-tile">
                <span class="g-ic g-ic-sm g-ic-glass" aria-hidden>${e}</span>
                <div class="g-t g-mt-sm">${t}</div>
              </div>`).join("")}
          </div>
          <div class="g-row g-mt-lg">
            <a class="g-btn g-btn-ink" href="driver">${van()} List my ride</a>
            <a class="g-btn g-btn-outline" href="driver.html#requests">See requests</a>
          </div>
        </div>

        <div class="g-card g-mt">
          <div class="g-head"><span class="g-label">Trusted by commuters</span><span class="g-ic g-ic-sm" aria-hidden>🛡️</span></div>
          <div class="g-grid" style="grid-template-columns:repeat(3,1fr);gap:10px">
            ${[["4.9", "Avg driver rating"], ["12 min", "Avg pickup wait"], ["R180", "Saved vs shuttle"]].map(([v, l]) => `
              <div><div class="g-kpi-val" style="font-size:22px">${v}</div><div class="g-list-s">${l}</div></div>`).join("")}
          </div>
        </div>
      </div>
    </div>
  </div>

`);

  // popular routes
  const routes = {};
  S.rides.forEach(r => { const k = r.from + "→" + r.to; routes[k] = routes[k] || { from: r.from, to: r.to, fare: r.fare, seats: 0, count: 0 };
    routes[k].fare = Math.min(routes[k].fare, r.fare); routes[k].seats += seatsLeft(r); routes[k].count++; });
  /* a modern emoji per destination, so the cards read at a glance on a phone */
  const routeEmoji = t => {
    const s = String(t || "").toLowerCase();
    if (/cape town|durban|margate|shepstone|ballito|umhlanga|mossel|hermanus|plettenberg|coffee bay|port st johns|richards bay/.test(s)) return "🏖️";
    if (/mthatha|komani|queenstown|kokstad|hogsback|graaff|sabie|graskop|bethlehem|harrismith|qonce|makhanda|cradock|aliwal|mount frere|idutywa/.test(s)) return "🏔️";
    if (/kimberley|upington|springbok|kuruman|colesberg/.test(s)) return "🏜️";
    if (/tzaneen|hoedspruit|mokopane|bela-bela|polokwane|mbombela|secunda|middelburg|ermelo/.test(s)) return "🌿";
    if (/johannesburg|pretoria|sandton|midrand|centurion|kempton|soweto|bloemfontein|polokwane/.test(s)) return "🏙️";
    if (/gqeberha|east london|knysna|george|oudtshoorn|idutywa|butterworth/.test(s)) return "🚐";
    return "🛣️";
  };
  $('#popRoutes').innerHTML = Object.values(routes).slice(0, 4).map(r => `
    <div class="g-card g-card-hover g-anim g-4">
      <div class="g-head"><span class="g-ic" aria-hidden>${routeEmoji(r.to)}</span><span class="g-s-sm">${r.count} ride${r.count === 1 ? "" : "s"}</span></div>
      <div class="g-t">${esc(r.from)} → ${esc(r.to)}</div>
      <div class="g-s-sm g-mt-sm">${r.seats} seats open today</div>
      <div class="g-between g-mt">
        <span class="g-kpi-val" style="font-size:22px">from ${money(r.fare)}</span>
        <a class="g-btn g-btn-ink g-btn-sm" href="rides.html?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}">Rides</a>
      </div>
    </div>`).join("");

  // live counts + booking form
  countUp($('#k1'), S.rides.length);
  countUp($('#k2'), S.rides.reduce((n, r) => n + seatsLeft(r), 0));
  countUp($('#k3'), new Set(S.rides.flatMap(r => [r.from, r.to, ...r.stops.map(x => x.city)])).size);
  $$('#pickSeg button').forEach(b => b.onclick = () => { $$('#pickSeg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); });

  const cycle = (btn, label, sel, texts) => {
    const s2 = $(sel);
    btn.onclick = () => {
      s2.selectedIndex = (s2.selectedIndex + 1) % s2.options.length;
      label.textContent = texts[s2.selectedIndex];
      btn.classList.remove("g-pop");
      void btn.offsetWidth;              /* restart the pop */
      btn.classList.add("g-pop");
    };
  };
  /* the time slot: two-hour windows, chosen from a small sheet */
  const slotSel = $('#slot'), slotBtn = $('#slotBtn'), slotLabel = $('#slotLabel');
  function slotSheet() {
    if (document.querySelector('#slotSheet')) return;
    const cur = slotSel.value;
    const opts = Array.from(slotSel.options);
    const sheet = document.createElement('div');
    sheet.className = 'g-sheet'; sheet.id = 'slotSheet';
    sheet.innerHTML = `
      <div class="g-sheet-card" style="max-width:400px" role="dialog" aria-label="Pick a time slot">
        <div class="g-between" style="margin-bottom:10px">
          <div><span class="g-label">Leaving</span><div class="g-t g-mt-sm">Pick a two-hour slot</div></div>
          <button class="g-btn g-btn-ghost g-btn-sm" type="button" id="slotClose" aria-label="Close">✕</button>
        </div>
        <div class="g-slot-grid">
          ${opts.map(o => `<button type="button" class="g-slot${o.value === cur ? ' on' : ''}" data-v="${o.value}">${o.value === '' ? '🕗 Any time' : '🕕 ' + o.textContent}</button>`).join('')}
        </div>
        <p class="g-s-sm g-mt-sm">Rides leaving in your window show first. Your driver still confirms the exact pickup time.</p>
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector('#slotClose').onclick = () => sheet.remove();
    sheet.onclick = e => { if (e.target === sheet) sheet.remove(); };
    sheet.querySelectorAll('.g-slot').forEach(btn => btn.onclick = () => {
      slotSel.value = btn.dataset.v;
      slotLabel.textContent = btn.dataset.v === '' ? 'Any time' : slotSel.options[slotSel.selectedIndex].textContent;
      sheet.remove();
    });
  }
  if (slotBtn) {
    slotBtn.onclick = slotSheet;
    if (slotSel.value) slotLabel.textContent = slotSel.options[slotSel.selectedIndex].textContent;
  }
  cycle($('#whenBtn'), $('#whenLabel'), '#when', ["Today", "Tomorrow", "Any day"]);
  cycle($('#seatBtn'), $('#seatLabel'), '#seats', ["1 seat", "2 seats", "3 seats", "4 seats"]);
  cycle($('#lugBtn'), $('#lugLabel'), '#luggage', ["Hand luggage", "Boot space", "Trailer"]);
  /* Both fields are typeable. The pickup may be a street rather than a town, so
     resolve it: if it names a town use that as the trip origin, otherwise keep
     the passenger's own town as the origin and carry the address through. */
  if (window.GOGOPlaces) {
    /* no suggestion list: the pickup field starts empty and only ever offers a
     real town once you have typed something. No seeded addresses, ever. */
    /* The pickup field is a plain text input, exactly like Suburb: the rider
       types where they are and that is the address. It is deliberately NOT
       wired to the geocoder, so nothing ever overwrites what they typed.
       The destination keeps its town suggestions, because picking a town is
       how the search finds rides. */
    GOGOPlaces.attach('#to', 'city');

    /* ── province and city in one control ────────────────────────────────
       One dropdown, grouped by province. Opening it shows all nine provinces
       and the towns in each, so the rider makes one choice instead of two —
       and every town listed is a town GOGOPlaces knows, which is what lets
       the search actually match rides. */
    (function fillArea() {
      const sel = $('#fromArea');
      if (!sel || !GOGOPlaces.SA) return;
      sel.innerHTML = '<option value="">Choose your province and city</option>' +
        GOGOPlaces.SA.map(prov =>
          `<optgroup label="${esc(prov.p)}">` +
          prov.towns.map(t => `<option value="${esc(t)}" data-prov="${esc(prov.p)}">${esc(t)}</option>`).join("") +
          `</optgroup>`
        ).join("");
    })();
  }

  /* ── draft: everything typed here is saved the moment it changes, so the
     confirmation page never asks for it again ─────────────────────────── */
  const $from = $('#from'), $to = $('#to'), $weight = $('#weightKg'), $desc = $('#desc');
  /* The mode can arrive three ways, in order of authority: the URL (?mode=),
     the saved draft, then passenger. The URL wins so a link from the dashboard
     opens the card in the mode the rider tapped, even if their last booking
     was the other kind. */
  const modeFromUrl = (parseQuery().mode || '').toLowerCase();
  let MODE = (modeFromUrl === 'parcel' || modeFromUrl === 'passenger')
    ? modeFromUrl
    : (S.bookingDraft && S.bookingDraft.mode) || 'passenger';

  const feeNoteFor = () => MODE === 'parcel'
    ? `<span aria-hidden>&#128274;</span> ${rands(FEE_CONFIG.parcelBooking)} parcel booking fee · carriage is agreed with your driver per kg`
    : `<span aria-hidden>&#128274;</span> ${rands(FEE_CONFIG.pickup)} pickup + ${rands(FEE_CONFIG.platform)} platform fee · card: charged in the app · cash: pay it with your fare`;

  const syncDraft = () => draftSet({
    mode: MODE,
    pickup: $from.value.trim(),
    suburb: ($('#fromSuburb') ? $('#fromSuburb').value.trim() : ""),
    city: ($('#fromArea') ? $('#fromArea').value.trim() : ""),
    destination: $to.value.trim(),
    when: $('#when').value,
    slot: $('#slot') ? $('#slot').value : '',
    seats: $('#seats').value,
    luggage: $('#luggage').value,
    weightKg: $weight ? $weight.value : '',
    size: (draft().size || 'small'),
    description: $desc ? $desc.value.trim() : '',
  });

  function applyMode(next, first) {
    MODE = next;
    $$('#modeSeg button').forEach(b => {
      const on = b.dataset.mode === next;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const parcelMode = next === 'parcel';
    $('#paxRow').hidden = parcelMode;
    $('#parcelRow').hidden = !parcelMode;
    $('#descWrap').hidden = !parcelMode;
    $('#boardingSec').hidden = parcelMode;
    $('#fromLab').textContent = parcelMode ? 'Collect from' : 'Pickup';
    $('#toLab').textContent = parcelMode ? 'Parcel goes to' : 'Destination';
    $('#bookHint').innerHTML = parcelMode
      ? '<span aria-hidden>&#128230;</span> Parcels ride in the boot, never in a seat. Chat with the driver and agree a price per kg.'
      : '<span aria-hidden>&#128656;</span> We come to your street. Type a town, or a whole province';
    $('#submitLab').textContent = parcelMode ? 'Send my parcel' : 'Find a hike';
    $('#feeNote').innerHTML = feeNoteFor();
    if (!first) syncDraft();
  }

  /* ── restore the draft on load: no field is ever asked for twice ─────── */
  (function restoreDraft() {
    const d = draft();
    /* the URL mode wins over the draft — see the MODE declaration above */
    applyMode(MODE, true);
    if (d.pickup) $from.value = d.pickup;
    if (d.suburb && $('#fromSuburb')) $('#fromSuburb').value = d.suburb;
    if (d.city && $('#fromArea')) $('#fromArea').value = d.city;
    if (d.destination) $to.value = d.destination;
    if (d.when && $('#when')) {
      const i = Array.from($('#when').options).findIndex(o => o.value === d.when);
      if (i > -1) { $('#when').selectedIndex = i; $('#whenLabel').textContent = ["Today", "Tomorrow", "Any day"][i]; }
    }
    if (d.seats && $('#seats')) {
      const i = Math.max(0, Number(d.seats) - 1);
      $('#seats').selectedIndex = i;
      $('#seatLabel').textContent = ["1 seat", "2 seats", "3 seats", "4 seats"][i];
    }
    if (d.luggage && $('#luggage')) {
      const i = Array.from($('#luggage').options).findIndex(o => o.value === d.luggage);
      if (i > -1) { $('#luggage').selectedIndex = i; $('#lugLabel').textContent = ["Hand luggage", "Boot space", "Trailer"][i]; }
    }
    if (d.slot && $('#slot')) {
      const i = Array.from($('#slot').options).findIndex(o => o.value === d.slot);
      if (i > -1) { $('#slot').selectedIndex = i; $('#slotLabel').textContent = $('#slot').options[i].textContent; }
    }
    if (d.weightKg && $weight) $weight.value = d.weightKg;
    if (d.description && $desc) $desc.value = d.description;
    if (d.size) applySize(d.size, true);
  })();

  /* ── size class: advisory, opened from a small sheet ────────────────── */
  function sizeSheet() {
    if (document.querySelector('#sizeSheet')) return;
    const cur = draft().size || 'small';
    const sheet = document.createElement('div');
    sheet.className = 'g-sheet'; sheet.id = 'sizeSheet';
    sheet.innerHTML = `
      <div class="g-sheet-card" style="max-width:400px" role="dialog" aria-label="Pick a parcel size">
        <div class="g-between" style="margin-bottom:10px">
          <div><span class="g-label">Parcel size</span><div class="g-t g-mt-sm">How big is it?</div></div>
          <button class="g-btn g-btn-ghost g-btn-sm" type="button" id="sizeClose" aria-label="Close">✕</button>
        </div>
        <div class="g-slot-grid">
          ${PARCEL_SIZES.map(s => `<button type="button" class="g-slot${s.id === cur ? ' on' : ''}" data-s="${s.id}">📦 ${s.label} · ${s.hint}</button>`).join('')}
        </div>
        <p class="g-s-sm g-mt-sm">Size is a guide for the driver. What decides the price is the weight you agree on.</p>
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector('#sizeClose').onclick = () => sheet.remove();
    sheet.onclick = e => { if (e.target === sheet) sheet.remove(); };
    sheet.querySelectorAll('.g-slot').forEach(b => b.onclick = () => { applySize(b.dataset.s); sheet.remove(); });
  }
  function applySize(id, first) {
    const s = PARCEL_SIZES.find(x => x.id === id) || PARCEL_SIZES[0];
    draftSet({ size: s.id });
    const lab = $('#sizeLabel'); if (lab) lab.textContent = s.label;
    if (!first) syncDraft();
  }
  const sizeBtn = $('#sizeBtn'); if (sizeBtn) sizeBtn.onclick = sizeSheet;

  /* ── every change is written to the draft as it happens ─────────────── */
  $$('#modeSeg button').forEach(b => b.onclick = () => applyMode(b.dataset.mode));
  [$from, $to, $desc, $('#fromSuburb'), $('#fromArea')]
    .forEach(el => { if (el) el.addEventListener('input', syncDraft); });
  if ($weight) $weight.addEventListener('input', syncDraft);
  ['#when', '#slot', '#seats', '#luggage', '#fromArea'].forEach(sel => {
    const el = $(sel); if (el) el.addEventListener('change', syncDraft);
  });

  /* ── submit ─────────────────────────────────────────────────────────── */
  $('#bookForm').onsubmit = e => {
    e.preventDefault();
    syncDraft();
    const typed = $from.value.trim();
    const to = ($to.value || "").trim();
    if (MODE === 'parcel') {
      if (!typed) { toast('<b>Add the address we collect the parcel from</b>'); $from.focus(); return; }
      if (!to) { toast('<b>Choose the town the parcel goes to</b>'); $to.focus(); return; }
      const kg = Number($weight.value || 0);
      if (!kg || kg <= 0) { toast('<b>Add the parcel weight in kg</b>'); $weight.focus(); return; }
      location.href = "parcel";
      return;
    }
    /* ── which city the search runs from ─────────────────────────────────
       In order of authority:
         1. the City field the rider filled in — they know where they are
         2. a town recognised inside what they typed ("131 Oxford Street,
            East London" still yields East London)
         3. their saved home town, then the default

       The City field beats the address text deliberately. "131 Oxford Street"
       contains no town, so parsing the address alone would search from the
       wrong place — or from nowhere — even though the rider told us the city
       in the next field. */
    const areaSel = $('#fromArea');
    const cityField = areaSel ? areaSel.value.trim() : "";

    /* the city anchors the search, so it is required rather than guessed from
       the street text — "131 Oxford Street" contains no town */
    if (!cityField) {
      toast('<b>Choose your province and city</b>');
      if (areaSel) areaSel.focus();
      return;
    }
    const hit = window.GOGOPlaces ? GOGOPlaces.match(typed) : null;
    const parsed = hit ? hit.city : "";
    const origin = cityField
      || parsed
      || (S.me && S.me.homeTown)
      || (S.me && S.me.home)
      || "East London";
    const q = new URLSearchParams({ from: origin, to: to || "Mthatha", seats: $('#seats').value, when: $('#when').value, luggage: $('#luggage').value });
    const slot = $('#slot') ? $('#slot').value : "";
    if (slot) q.set("slot", slot);
    if (typed && (!hit || hit.city !== typed)) q.set("pickup", typed);
    const suburbField = ($('#fromSuburb') ? $('#fromSuburb').value : "").trim();
    if (suburbField) q.set("suburb", suburbField);
    if (cityField) q.set("city", cityField);
    const provField = areaSel && areaSel.selectedOptions[0]
      ? (areaSel.selectedOptions[0].dataset.prov || "") : "";
    if (provField) q.set("province", provField);
    location.href = "rides.html?" + q.toString();
  };
}

/* ── PAGE: results ──────────────────────────────────────────────────────── */
function pageRides() {
  const q = parseQuery();
  const from = q.from || "East London", to = q.to || "Mthatha", seats = Number(q.seats || 1);
  const state = { toStop: false, maxPrice: 0, onlyStops: false, sort: "time" };

  $('#main').innerHTML = `
  <div class="g-wrap g-section">
    <div class="g-card g-anim">
      <div class="g-between">
        <div class="g-row">
          <span class="g-ic" aria-hidden>🧭</span>
          <div>
            <div class="g-t">${esc(from)} <span class="g-s-sm">to</span> ${esc(to)}${window.GOGOPlaces && GOGOPlaces.provinceByName(to) ? ` <span class="g-stamp g-stamp-idle">province</span>` : ""}</div>
            <div class="g-list-s">${seats} seat${seats === 1 ? "" : "s"} · ${q.when === "tomorrow" ? "tomorrow" : q.when === "any" ? "any day" : "today"}${q.slot ? ` · 🕕 ${String(q.slot).padStart(2, "0")}:00 – ${String(Number(q.slot) + 2).padStart(2, "0")}:00` : ""}${q.pickup ? ` · pickup ${esc(q.pickup)}` : ""}</div>
          </div>
        </div>
        <a class="g-btn g-btn-ghost g-btn-sm" href="/gogo/">Edit search</a>
      </div>

      <div class="g-chips g-mt">
        <button class="g-chip" data-f="toStop">Hop off at a stop</button>
        <button class="g-chip" data-f="onlyStops">Rides with stops</button>
        <button class="g-chip" data-f="sort">Sort: earliest</button>
      </div>
    </div>

    <div class="g-between g-mt-lg g-anim">
      <div><span class="g-label">Available hikes</span><h2 class="g-h2 g-mt-sm" id="count">–</h2></div>
      <span class="g-s-sm" id="subNote"></span>
    </div>

    <div class="g-hikes g-mt" id="list"></div>
  </div>`;

  const chip = (k, on, label) => { const b = $(`[data-f="${k}"]`); b.classList.toggle("on", on); if (label) b.textContent = label; };
  chip("toStop", state.toStop);
  chip("onlyStops", state.onlyStops);

  function matches(r) {
    const P = window.GOGOPlaces;
    const cities = [r.from, ...r.stops.map(s => s.city), r.to];
    const same = (a, b) => (P ? P.same(a, b) : a === b);
    /* you can board a ride that starts where you are, or that stops there on the way */
    const okFrom = same(r.from, from) || cities.some(c => same(c, from));
    /* "Going to" accepts a town or a whole province */
    const toProv = P ? P.provinceByName(to) : null;
    const okTo = toProv
      ? cities.some(c => P.provinceOf(c) === toProv.p)
      : (state.toStop ? cities.some(c => same(c, to)) : same(r.to, to) || cities.some(c => same(c, to)));
    const okSeats = seatsOpen(r) >= seats;
    /* the slot is the departure window: half-open so 08:00 lands in 08–10 */
    const okSlot = !q.slot || (() => { const h = new Date(r.depart).getHours(); return h >= Number(q.slot) && h < Number(q.slot) + 2; })();
    const okPrice = !state.maxPrice || r.fare <= state.maxPrice;
    const okStops = !state.onlyStops || r.stops.length > 0;
    return okFrom && okTo && okSeats && okPrice && okStops && okSlot;
  }

  function render() {
    let hits = S.rides.filter(matches);
    if (state.sort === "fare") hits = hits.slice().sort((a, b) => a.fare - b.fare);
    else hits = hits.slice().sort((a, b) => new Date(a.depart) - new Date(b.depart));
    const cityCount = new Set(hits.flatMap(r => [r.from, ...r.stops.map(s => s.city), r.to])).size;
    $('#count').textContent = `${hits.length} ride${hits.length === 1 ? "" : "s"} found`;
    $('#subNote').textContent = hits.length ? `Covering ${cityCount} towns on this corridor` : "";

    $('#list').innerHTML = hits.length ? hits.map(rideCard).join("") : `
      <div class="g-12 g-card g-anim">
        <div class="g-empty">
          <span class="g-ic g-ic-lg" aria-hidden>🕐</span>
          <h3 class="g-h3">No rides to ${esc(to)} yet</h3>
          <p class="g-s g-mt-sm">Nothing on this route right now. Set an alert and we will tell you the moment a driver lists it, or widen the search.</p>
          <div class="g-row g-mt" style="justify-content:center">
            <button class="g-btn g-btn-ghost g-btn-sm" id="relax" type="button">Show all rides</button>
            <button class="g-btn g-btn-ink g-btn-sm" id="alertMe" type="button"><span aria-hidden>🔔</span> Alert me</button>
          </div>
        </div>
      </div>`;
    const rel = $('#relax'); if (rel) rel.onclick = () => { state.toStop = true; state.onlyStops = false; chip("toStop", true); chip("onlyStops", false); render(); };
    const alert = $('#alertMe');
    if (alert) alert.onclick = () => {
      if (!S.alerts) S.alerts = [];
      S.alerts.push({ from, to, when: new Date().toISOString() });
      save();
      alert.outerHTML = `<span class="g-stamp g-stamp-full">alert set · ${esc(from)} → ${esc(to)}</span>`;
      toast("<b>Alert set</b> · we will notify you when a driver lists this route");
    };
    grow(); reveal();
  }

  $$('[data-f]').forEach(b => b.onclick = () => {
    const k = b.dataset.f;
    if (k === "sort") { state.sort = state.sort === "time" ? "fare" : "time"; chip("sort", state.sort === "fare", "Sort: " + (state.sort === "fare" ? "cheapest" : "earliest")); }
    else { state[k] = !state[k]; chip(k, state[k]); }
    render();
  });

  render();
}

/* ── PAGE: ride detail + join ───────────────────────────────────────────── */
function pageRide() {
  const id = parseQuery().id || S.rides[0].id;
  const r = ride(id);
  if (!r) { $('#main').innerHTML = `<div class="g-wrap g-section"><div class="g-card"><div class="g-empty"><span class="g-ic g-ic-lg" aria-hidden>🤷</span><h3 class="g-h3">That ride is gone</h3><a class="g-btn g-btn-ink g-mt" href="rides">Back to rides</a></div></div></div>`; return; }

  const dep = townCodeOf(r.from), arr = townCodeOf(r.to);
  const dur = tripDuration(r);
  const mine = (r.requests || []).find(q => q.phone === S.me.phone && q.status !== "declined");
  const taken = seatsTaken(r), left = seatsLeft(r);
  const t = new Date(r.depart);
  const timeTxt = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateTxt = t.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
  const stops = [{ city: r.from, time: timeTxt, fare: 0 }, ...r.stops, { city: r.to, time: "", fare: r.fare }];
  const depTime = new Date(r.depart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const etaTxt = etaOf(r);
  const pct = Math.round((taken / Math.max(1, r.seatsTotal)) * 100);

  $('#main').innerHTML = `
  <div class="g-wrap g-section">
    <div class="g-trip">

      <!-- ── the ride, in the same shape as the card it was picked from ── -->
      <div class="g-trip-main g-anim">
        <article class="g-rc g-trip-card">
          <header class="g-rc-top">
            <span class="g-rc-badge" aria-hidden>${VAN_SVG}</span>
            <span class="g-rc-head">
              <b class="g-rc-veh">${esc(r.vehicle)}</b>
              <span class="g-rc-driver">${esc(r.driver)} · ★ ${r.rating} · ${r.trips} trips</span>
            </span>
            <span class="g-rc-when">
              <b>${timeTxt}</b>
              <span>${dateTxt}</span>
            </span>
          </header>

          <div class="g-rc-route">
            <span class="g-rc-end">
              <b class="g-rc-code">${esc(dep.code)}</b>
              <span class="g-rc-town">${esc(dep.name)}</span>
            </span>
            <span class="g-rc-mid">
              <span class="g-rc-line" aria-hidden><i></i><span class="g-rc-van">${VAN_SVG}</span><i></i></span>
              <span class="g-rc-dur">${dur}</span>
              <span class="g-rc-stops-n">${r.stops.length ? `${r.stops.length} stop${r.stops.length === 1 ? "" : "s"}` : "Direct"}</span>
            </span>
            <span class="g-rc-end g-rc-end-to">
              <b class="g-rc-code">${esc(arr.code)}</b>
              <span class="g-rc-town">${esc(arr.name)}</span>
            </span>
          </div>

          <div class="g-rc-dash" aria-hidden></div>

          <footer class="g-rc-foot">
            <span class="g-rc-seats">
              <span class="g-rc-seats-n"><b>${taken}</b> of ${r.seatsTotal} seats taken</span>
              <span class="g-rc-bar" aria-hidden><i style="width:${pct}%"></i></span>
            </span>
            <span class="g-rc-price"><b>${money(r.fare)}</b><span>per seat</span></span>
            <span class="g-trip-lug"><span aria-hidden>🧳</span> ${esc(r.luggage)}</span>
          </footer>
        </article>

        <!-- the stops as a clean timeline -->
        <section class="g-card g-trip-stops">
          <div class="g-head"><span class="g-label">The route, stop by stop</span></div>
          <ol class="g-timeline">
            ${stops.map((s, i) => {
              const last = i === stops.length - 1;
              const code = townCodeOf(s.city);
              return `<li class="g-tl-item">
                <span class="g-tl-rail" aria-hidden><i class="g-tl-dot${i === 0 ? " g-tl-first" : ""}"></i>${last ? "" : `<i class="g-tl-line"></i>`}</span>
                <span class="g-tl-body">
                  <span class="g-tl-city"><b>${esc(code.code)}</b> ${esc(s.city)}</span>
                  <span class="g-tl-meta">${i === 0 ? `${esc(depTime)} · we collect at your street` : last ? "arrival" : `around ${esc(s.time)}`}</span>
                </span>
                <span class="g-tl-fare">${s.fare ? money(s.fare) : "—"}</span>
              </li>`;
            }).join("")}
          </ol>
          <div class="g-trip-hop">
            <span aria-hidden>🚏</span>
            <span><b>Going only as far as ${r.stops[0] ? esc(r.stops[0].city) : "a stop"}?</b> Hop off at any stop and pay only that leg.</span>
          </div>
        </section>
      </div>

      <!-- ── driver + the join form ── -->
      <div class="g-trip-side g-anim">
        <section class="g-card">
          <div class="g-head"><span class="g-label">Your driver</span><span class="g-ic g-ic-sm" aria-hidden>🛡️</span></div>
          <div class="g-driver">
            <div class="g-avatar">${esc(initials(r.driver))}</div>
            <div>
              <div class="g-t">${esc(r.driver)}</div>
              <div class="g-list-s"><span class="g-stars">★ ${r.rating}</span> · ${r.trips} trips</div>
            </div>
          </div>
          <div class="g-list-row g-mt-sm"><span class="g-ic g-ic-sm" aria-hidden>${van()}</span><div><div class="g-list-t">${esc(r.vehicle)}</div><div class="g-list-s">${myAcceptedSeat(r) ? `${esc(r.colour)} · ${esc(r.plate)}` : `<span aria-hidden>🔒</span> Plate shared once your seat is confirmed`}</div></div></div>
          <div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>📞</span><div><div class="g-list-t">Number shared after accepting</div><div class="g-list-s">GOGO hides numbers until the driver agrees</div></div></div>
        </section>

        <section class="g-card g-mt" id="joinBox"></section>
      </div>
    </div>
  </div>`;

  const box = $('#joinBox');
  if (mine) {
    box.innerHTML = `
      <div class="g-head"><span class="g-label">Your request</span><span class="g-stamp ${mine.status === "accepted" ? "g-stamp-full" : "g-stamp-open"}">${esc(mine.status)}</span></div>
      <div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>📍</span><div><div class="g-list-t">${esc(mine.pickup)}</div><div class="g-list-s">Pickup address</div></div></div>
      <div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>🏁</span><div><div class="g-list-t">${esc(mine.getOff)}</div><div class="g-list-s">${mine.seats} seat${mine.seats === 1 ? "" : "s"} · ${esc(mine.luggage)}</div></div><div class="g-list-r g-t">${money(mine.fare)}</div></div>
      ${feeTable(fareLines(mine.fare, mine.seats), mine.seats > 1 ? `Fare for ${mine.seats} seats, plus ${rands(FEE_CONFIG.pickup)} pickup and ${rands(FEE_CONFIG.platform)} platform fee per passenger.` : `${rands(FEE_CONFIG.pickup)} pickup + ${rands(FEE_CONFIG.platform)} platform fee.`)}
      <p class="g-s g-mt-sm">${mine.status === "accepted" ? "You are in. The driver will pick you up in route order." : "Waiting for the driver to accept. You will be notified here."}</p>
      <a class="g-btn g-btn-ink g-btn-block g-mt" href="rider"><span aria-hidden>🧍</span> Open my trips</a>`;
  } else {
    /* nothing is re-asked: the join form comes pre-filled from the draft the
       passenger already typed on the landing page */
    const d = draft();
    const prePickup = d.pickup || parseQuery().pickup || "";
    const preSeats = Math.min(4, Math.max(1, Number(d.seats || 1)));
    const preLug = d.luggage ? Array.from({ length: 3 }, (_, i) => ["hand", "boot", "trailer"][i]).indexOf(d.luggage) : 0;
    /* the stop they chose on the landing page is preselected, so the drop-off
       is never asked for twice either */
    const preOff = d.destination && [r.to, ...r.stops.map(s => s.city)].includes(d.destination)
      ? d.destination : r.to;
    const lugNames = ["Hand luggage", "One bag", "Big bag + bags"];
    box.innerHTML = `
      <div class="g-head"><span class="g-label">Request to join</span><span class="g-ic g-ic-sm g-ic-lime" aria-hidden>🙋</span></div>
      <form id="joinForm" class="g-form">
        <div class="g-field">
          <label class="g-f-k" for="jName">Your name</label>
          <input class="g-input" id="jName" value="${esc(S.me.name)}" required>
        </div>
        <div class="g-field">
          <label class="g-f-k" for="jPhone">Phone</label>
          <input class="g-input" id="jPhone" type="tel" inputmode="tel" value="${esc(S.me.phone)}" placeholder="078 000 0000" required>
        </div>

        <div class="g-form-sec">Where we collect you</div>

        <div class="g-field">
          <label class="g-f-k" for="jPickup">Pick me up at</label>
          <input class="g-input" id="jPickup" type="text" name="pickup" value="${esc(prePickup)}" placeholder="Street, town or landmark" autocomplete="street-address" enterkeyhint="next" required>
        </div>

        <div class="g-form-sec">Your hike</div>

        <div class="g-field">
          <label class="g-f-k" for="jOff">Drop me at</label>
          <select class="g-input" id="jOff">${[r.to, ...r.stops.map(s => s.city)].map(c => `<option${c === preOff ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>
        </div>

        <div class="g-2col">
          <div class="g-field">
            <label class="g-f-k" for="jSeats">Seats</label>
            <select class="g-input" id="jSeats">${Array.from({ length: Math.max(1, Math.min(4, seatsOpen(r))) }, (_, i) => `<option${i + 1 === preSeats ? " selected" : ""}>${i + 1}</option>`).join("")}</select>
          </div>
          <div class="g-field">
            <label class="g-f-k" for="jLug">Luggage</label>
            <select class="g-input" id="jLug">${lugNames.map((n, i) => `<option${i === preLug ? " selected" : ""}>${n}</option>`).join("")}</select>
          </div>
        </div>
        <div id="joinFees"></div>
        <button class="g-btn g-btn-ink g-btn-block" type="submit" ${left ? "" : "disabled"}><span aria-hidden>📲</span> ${left ? "Send request" : "Trip is full"}</button>
        <p class="g-s-sm g-mt-sm" style="text-align:center">The driver accepts before anything is confirmed</p>
      </form>`;

    /* The pickup is a plain field now, exactly like Suburb and City. No
       geocoder: whatever the rider types is the address, and nothing pops up
       to compete with it. The driver reads it and comes to the street. */
    const seatSel = $('#jOff');
    const fareFor = off => { const s = r.stops.find(x => x.city === off); return s ? s.fare : r.fare; };
    /* the breakdown updates live as they change seats or drop-off */
    const showFees = () => {
      const off = seatSel.value, seats = Number($('#jSeats').value);
      $('#joinFees').innerHTML = feeTable(fareLines(fareFor(off) * seats, seats), `${rands(FEE_CONFIG.pickup)} pickup + ${rands(FEE_CONFIG.platform)} platform fee per passenger.`);
    };
    seatSel.onchange = showFees;
    $('#jSeats').onchange = showFees;
    showFees();
    box.querySelector('#joinForm').onsubmit = e => {
      e.preventDefault();
      const need = [['#jName', 'Add your name'], ['#jPhone', 'Add a phone number so the driver can reach you'], ['#jPickup', 'Add the address we should collect you from']]
        .find(([sel, msg]) => { const el = box.querySelector(sel); return el && !el.value.trim(); });
      if (need) { toast('<b>' + need[1] + '</b>'); const el = box.querySelector(need[0]); if (el) el.focus(); return; }
      const getOff = seatSel.value, seats = Number($('#jSeats').value);
      if (seatsOpen(r) < seats) { toast("<b>Only " + seatsOpen(r) + " seat(s) left</b> on this ride"); return; }

      /* ── the booking goes through the server ──────────────────────────
         The browser may not decide what a seat costs, so the request is sent
         WITHOUT a total and the server prices it. Its answer is the only
         price that counts; nothing is written locally until it says yes. */
      const btn = e.target.querySelector("button[type=submit]");
      const restore = btn ? btn.innerHTML : null;
      if (btn) { btn.disabled = true; btn.innerHTML = "Booking…"; }

      const finish = (msg, ok) => {
        if (btn) { btn.disabled = false; if (restore) btn.innerHTML = restore; }
        if (!ok) toast("<b>" + esc(msg) + "</b>");
      };

      const send = (attempt) => {
        fetch("/gogo/api/book", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" },
            (window.GOGOAuth && GOGOAuth.token) ? { Authorization: "Bearer " + GOGOAuth.token() } : {}),
          body: JSON.stringify({
            rideId: r.id, kind: "passenger", stop: getOff, seats,
            pickup: $('#jPickup').value, suburb: "", city: "",
            payMethod: (e.target.__getMethod ? e.target.__getMethod() : "card"),
          }),
        })
          .then(res => res.json().then(j => ({ status: res.status, body: j })))
          .then(out => {
            if (out.status === 201 && out.body.booking) {
              const booked = out.body.booking;
              /* the server's price is what the rider pays, and it is what the
                 local record shows, so the two can never disagree */
              const req = {
                id: booked.id, name: $('#jName').value, phone: $('#jPhone').value,
                pickup: $('#jPickup').value, getOff, seats, luggage: $('#jLug').value,
                fare: booked.rows[0].cents / 100, status: "pending", at: booked.at,
                paymentMethod: booked.payMethod,
                fees: { rows: booked.rows.map(x => ({ label: x.label, val: x.cents / 100 })),
                        total: booked.totalCents / 100, seats, feeVersion: booked.feeVersion },
                feeVersion: booked.feeVersion,
                serverPriced: true,
              };
              r.requests.push(req);
              if (window.GOGOPay) GOGOPay.bookingFor(r, req);

              /* everyone already on this ride hears about it */
              const left = seatsOpen(r);
              const seatWord = left === 1 ? "seat" : "seats";
              if (!S.notices) S.notices = [];
              (r.requests || []).slice(0, -1).forEach(other => {
                S.notices.unshift({
                  id: "n" + (++S.seq), to: (other.phone || "").replace(/[^\d+]/g, ""), kind: "seat", ride: r.id,
                  text: `${req.name} took ${req.seats} seat${req.seats === 1 ? "" : "s"} on ${r.from} → ${r.to}`,
                  sub: `${left} ${seatWord} left`, at: new Date().toISOString(), read: false,
                });
              });
              if (window.GOGOChat) GOGOChat.system(r.id, `💺 ${req.name} took a seat · ${left} ${seatWord} left on this ride`);
              S.activity.unshift({ e: "📲", t: "Request sent to " + r.driver, s: `${r.from} → ${getOff}`, when: "just now" });
              save();
              finish("", true);
              toast("Request sent to <b>" + esc(r.driver) + "</b> · " + seatsOpen(r) + " seat" + (seatsOpen(r) === 1 ? "" : "s") + " left");
              setTimeout(() => location.href = "rider", 900);
              return;
            }

            /* the server refused, or could not be reached. Either way this is
               NOT booked, and the rider must not be told otherwise. */
            const why = out.body && out.body.error;
            if (out.status === 409 && why === "price mismatch") {
              finish("The price changed. Reload and book again.", false);
            } else if (out.status === 409) {
              finish("Those seats have gone on this ride.", false);
            } else if (out.status === 401) {
              finish("Sign in first, then send the request.", false);
              if (window.GOGOAuth && GOGOAuth.require) {
                setTimeout(() => GOGOAuth.require("Sign in to book a seat", "ride?id=" + r.id), 700);
              }
            } else if (out.status === 0 || !out.status) {
              finish("Could not reach GOGO. Your booking did not go through.", false);
            } else if (why && attempt < 2) {
              /* one retry covers a blip without hiding a real refusal */
              setTimeout(() => send(attempt + 1), 700);
              return;
            } else {
              finish("Booking failed. Please try again.", false);
            }
          })
          .catch(() => finish("Could not reach GOGO. Your booking did not go through.", false));
      };
      send(1);
      return;
      /* everyone already on this ride hears about it, with the seats left */
      const left = seatsOpen(r);
      const seatWord = left === 1 ? "seat" : "seats";
      if (!S.notices) S.notices = [];
      (r.requests || []).slice(0, -1).forEach(other => {
        S.notices.unshift({
          id: "n" + (++S.seq), to: (other.phone || "").replace(/[^\d+]/g, ""), kind: "seat", ride: r.id,
          text: `${req.name} took ${req.seats} seat${req.seats === 1 ? "" : "s"} on ${r.from} → ${r.to}`,
          sub: `${left} ${seatWord} left`, at: new Date().toISOString(), read: false,
        });
      });
      if (window.GOGOChat) GOGOChat.system(r.id, `💺 ${req.name} took a seat · ${left} ${seatWord} left on this ride`);
      S.activity.unshift({ e: "📲", t: "Request sent to " + r.driver, s: `${r.from} → ${getOff}`, when: "just now" });
      save();
      toast("Request sent to <b>" + esc(r.driver) + "</b> · " + seatsOpen(r) + " seat" + (seatsOpen(r) === 1 ? "" : "s") + " left");
      setTimeout(() => location.href = "rider", 900);
    };
  }
}

/* ── PAGE: rider dashboard ──────────────────────────────────────────────── */
/* ── PAGE: the boarding pass ────────────────────────────────────────────────
   The rider's ticket. It is reachable two ways: from My trips, or by opening
   /ticket with the reference alone, which is how a ticket is meant to work —
   the code is the credential.

   The pass is drawn from the SERVER's copy of the booking, never from local
   state, so what is printed here is what the driver will accept: the price,
   the seat count and the released plate all come back from the API. */
function pageTicket() {
  const ref = String(parseQuery().ref || "").trim().toUpperCase();
  const host = $('#main');

  if (!ref) {
    host.innerHTML = `<div class="g-wrap g-section"><div class="g-card">
      <div class="g-empty"><span class="g-ic g-ic-lg" aria-hidden>🎫</span>
        <h3 class="g-h3">Open your ticket</h3>
        <p class="g-s g-mt-sm">Enter the six-character reference from your booking.</p>
        <form id="refForm" class="g-mt" style="max-width:280px;margin-inline:auto;text-align:left">
          <label class="g-f-k" for="refIn">Booking reference</label>
          <input class="g-input" id="refIn" type="text" maxlength="8" placeholder="P3K9DL"
                 autocapitalize="characters" autocomplete="off" spellcheck="false">
          <button class="g-btn g-btn-ink g-btn-block g-mt" type="submit">Open ticket</button>
        </form>
      </div></div></div>`;
    const f = $('#refForm');
    if (f) f.onsubmit = ev => {
      ev.preventDefault();
      const v = ($('#refIn').value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (v.length < 5) { toast("<b>Enter the full reference</b>"); return; }
      location.href = "ticket?ref=" + encodeURIComponent(v);
    };
    return;
  }

  host.innerHTML = `<div class="g-wrap g-section"><div class="g-card">
    <p class="g-s" style="text-align:center">Looking up <b>${esc(ref)}</b>…</p></div></div>`;

  fetch("/gogo/api/booking/" + encodeURIComponent(ref), {
    headers: (window.GOGOAuth && GOGOAuth.token) ? { Authorization: "Bearer " + GOGOAuth.token() } : {},
  })
    .then(r => r.json().then(j => ({ status: r.status, body: j })))
    .then(out => {
      if (out.status !== 200 || !out.body.booking) {
        host.innerHTML = `<div class="g-wrap g-section"><div class="g-card">
          <div class="g-empty"><span class="g-ic g-ic-lg" aria-hidden>🔍</span>
            <h3 class="g-h3">No ticket with that reference</h3>
            <p class="g-s g-mt-sm">Check the code and try again. It is six characters, and the letters I, O, S, B and Z are never used.</p>
            <a class="g-btn g-btn-ink g-mt" href="ticket">Try another code</a></div></div></div>`;
        return;
      }
      const b = out.body.booking;
      const accepted = b.status === "accepted" || b.status === "completed";
      const dep = townCodeOf(b.from), arr = townCodeOf(b.to);

      /* the bars encode the reference so it can be scanned at the rank:
         each character becomes a bar whose height and width come from its
         position in the alphabet, so the same code always draws the same way */
      const bars = ref.split("").map(ch => {
        const n = ch.charCodeAt(0);
        return `<i style="height:${10 + (n % 9) * 2.5}px;width:${(n % 3) + 2}px"></i>`;
      }).join("");

      host.innerHTML = `
      <div class="g-wrap g-section">
        <div class="g-bp">
          <div class="g-bp-top">
            <span class="g-bp-brand">GO<i>GO</i> · BOARDING PASS</span>
            <span class="g-bp-state ${accepted ? "is-ok" : ""}">${accepted ? "Confirmed" : "Pending"}</span>
          </div>

          <div class="g-bp-journey">
            <div class="g-bp-end">
              <span class="g-bp-time">${esc(b.depart || "")}</span>
              <b class="g-bp-code">${esc(dep.code)}</b>
              <span class="g-bp-town">${esc(dep.name)}</span>
            </div>
            <div class="g-bp-mid">
              <span class="g-bp-veh">${esc(b.vehicle || "")}</span>
              <span class="g-bp-arrow" aria-hidden><i></i><span>${VAN_SVG}</span><i></i></span>
              <span class="g-bp-dur">${esc(b.stop || arr.name)}</span>
            </div>
            <div class="g-bp-end">
              <span class="g-bp-time">arrival</span>
              <b class="g-bp-code">${esc(arr.code)}</b>
              <span class="g-bp-town">${esc(arr.name)}</span>
            </div>
          </div>

          <div class="g-bp-facts">
            <span class="g-bp-fact"><span class="g-bp-fact-l">Rider</span>
              <span class="g-bp-fact-v">${esc((S.me && S.me.name) || "You")}</span></span>
            <span class="g-bp-fact"><span class="g-bp-fact-l">Seats</span>
              <span class="g-bp-fact-v">${b.seats}</span></span>
            <span class="g-bp-fact"><span class="g-bp-fact-l">Total</span>
              <span class="g-bp-fact-v g-money">${money((b.totalCents || 0) / 100)}</span>
              <span class="g-bp-fact-s">${b.payMethod === "cash" ? "Cash on boarding" : "Card"}</span></span>
          </div>

          <div class="g-bp-tear"><span class="g-bp-notch l"></span><span class="g-bp-notch r"></span></div>

          <div class="g-bp-stub">
            <div class="g-bp-ref-l">Booking reference</div>
            <div class="g-bp-ref">${esc(ref)}</div>
            <div class="g-bp-bars" aria-hidden>${bars}</div>
            <p class="g-bp-note">${accepted
              ? `Seat confirmed. Show this code to ${esc(b.driver || "your driver")}. The plate is ${esc(b.plate || "released")}.`
              : `Waiting for the driver to accept. Your seat is held while they decide.`}</p>
            <div class="g-bp-acts">
              <a class="g-btn g-btn-ghost g-btn-sm" href="rider">My trips</a>
              <button class="g-btn g-btn-ink g-btn-sm" id="copyRef" type="button">Copy code</button>
            </div>
          </div>
        </div>
      </div>`;

      const c = $('#copyRef');
      if (c) c.onclick = () => {
        try { navigator.clipboard.writeText(ref); toast("<b>Copied</b> · " + ref); }
        catch (e) { toast("<b>" + ref + "</b>"); }
      };
      reveal();
    })
    .catch(() => {
      host.innerHTML = `<div class="g-wrap g-section"><div class="g-card">
        <div class="g-empty"><span class="g-ic g-ic-lg" aria-hidden>📡</span>
          <h3 class="g-h3">Could not reach GOGO</h3>
          <a class="g-btn g-btn-ink g-mt" href="ticket">Try again</a></div></div></div>`;
    });
}

function pageRider() {
  const myReqs = [];
  S.rides.forEach(r => (r.requests || []).forEach(q => { if (q.phone === S.me.phone && q.status !== "declined") myReqs.push({ r, q }); }));
  myReqs.sort((a, b) => new Date(a.r.depart) - new Date(b.r.depart));
  const live = myReqs[0] && (myReqs[0].q.status === "accepted" || myReqs[0].q.status === "pending") ? myReqs[0] : null;
  const accepted = myReqs.filter(x => x.q.status === "accepted");
  const spend = accepted.reduce((n, x) => n + x.q.fare, 0);
  /* ── how far along the trip is ───────────────────────────────────────────
     Derived from the request first, then the ride, in the order the journey
     actually happens. "full" is deliberately NOT consulted: a ride being full
     says nothing about whether this rider has been collected, and checking it
     before "started" made a departed ride show the wrong step. */
  const stage = !live ? 0
    : live.q.status === "pending" ? 1                                          /* request sent */
    : live.r.status === "completed" ? 5                                        /* arrived */
    : live.r.status === "started" ? 4                                          /* on the way */
    : live.q.pickedUp ? 3                                                      /* picking up */
    : 2;                                                                       /* driver accepted */
  const steps = [["🧾", "Sent"], [VAN_SVG, "Accepted"], ["📍", "Collected"], ["🛣️", "On the way"], ["🏁", "Arrived"]];

  $('#main').innerHTML = `
  <div class="g-wrap g-section">
    <div class="g-grid">
      <div class="g-12 g-anim">
        <div class="g-mt-head">
          <div>
            <span class="g-label">My trips</span>
            <h1 class="g-h2 g-mt-sm">${esc(S.me.name)}</h1>
          </div>
          <a class="g-btn g-btn-ink g-btn-sm" href="/gogo/"><span aria-hidden>🧭</span> Book a seat</a>
        </div>
      </div>

      <div class="g-8 g-anim">
        <div class="g-card">
          ${live ? `
            <div class="g-trip-head">
              <div class="g-trip-route">${esc(live.r.from)} <em>→</em> ${esc(live.q.getOff)}</div>
              <span class="g-trip-state ${live.q.status === "accepted" ? "is-confirmed" : ""}">${live.q.status === "accepted" ? "Seat confirmed" : "Waiting for driver"}</span>
            </div>

            <div class="g-rail" role="list">
              ${steps.map(([e, t], i) => `
                <div class="g-rail-step ${i < stage ? "is-done" : i === stage ? "is-now" : ""}" role="listitem">
                  <span class="g-rail-dot" aria-hidden>${e}</span>
                  <span class="g-rail-lab">${t}</span>
                </div>`).join("")}
            </div>

            <dl class="g-facts">
              <div><dt>Fare</dt><dd>${money(live.q.fare)}</dd></div>
              <div><dt>Seats</dt><dd>${live.q.seats}</dd></div>
              <div><dt>Departs</dt><dd>${esc(live.r.departLabel || "—")}</dd></div>
              <div><dt>Pickup</dt><dd>${esc(live.q.pickup || "—")}</dd></div>
            </dl>

            <div class="g-driver-strip">
              <span class="g-avatar" style="width:34px;height:34px;font-size:11px;border-radius:6px">${esc(initials(live.r.driver))}</span>
              <div class="g-driver-txt">
                <div class="g-list-t">${esc(live.r.driver)}</div>
                <div class="g-list-s">${esc(live.r.vehicle)} · ${esc(live.r.plate)} · ★ ${live.r.rating}</div>
              </div>
              <a class="g-btn g-btn-outline g-btn-sm" href="messages"><span aria-hidden>💬</span> Message</a>
            </div>

            <div class="g-trip-acts">
              <a class="g-btn g-btn-ghost g-btn-sm" href="ride.html?id=${live.r.id}">Ride details</a>
              ${live.q.ref ? `<a class="g-btn g-btn-ghost g-btn-sm" href="ticket?ref=${encodeURIComponent(live.q.ref)}">Boarding pass</a>` : ""}
              <button class="g-btn g-btn-ghost g-btn-sm" id="cancelReq" type="button">Cancel request</button>
            </div>` : `
            <div class="g-empty"><span class="g-ic g-ic-lg" aria-hidden>🧭</span>
              <h3 class="g-h3">No active trip</h3>
              <p class="g-s g-mt-sm">Grab a seat on a route leaving your street.</p>
              <a class="g-btn g-btn-ink g-mt" href="rides.html?from=East+London&to=Mthatha">See East London → Mthatha rides</a></div>`}
        </div>

        ${myReqs.length > 1 ? `
        <div class="g-card g-mt">
          <div class="g-head"><span class="g-label">Other requests</span></div>
          ${myReqs.slice(1, 5).map(({ r, q }) => `
            <div class="g-list-row">
              <div><div class="g-list-t">${esc(r.from)} → ${esc(q.getOff)}</div>
                <div class="g-list-s">${esc(r.driver)} · ${new Date(r.depart).toLocaleDateString([], { day: "numeric", month: "short" })}</div></div>
              <div class="g-list-r"><div class="g-t g-money">${money(q.fare)}</div>
                <span class="g-list-s">${q.status === "accepted" ? "confirmed" : "pending"}</span></div>
            </div>`).join("")}
        </div>` : ""}
      </div>

      <div class="g-4 g-anim">
        <div class="g-card">
          <div class="g-facts g-facts-stack">
            <div><dt>Trips taken</dt><dd id="rTrips">0</dd></div>
            <div><dt>Spent on hikes</dt><dd id="rSpend">R0</dd></div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  countUp($('#rTrips'), accepted.length);  countUp($('#rSpend'), spend, "R");
  const c = $('#cancelReq');
  if (c) c.onclick = () => {
    const r = live.r; r.requests = r.requests.filter(q => q.phone !== S.me.phone);
    save(); toast("Request cancelled"); setTimeout(() => location.reload(), 700);
  };
}

/* ── PAGE: driver dashboard ─────────────────────────────────────────────── */
function pageDriver() {
  const mineRides = S.rides.filter(r => r.driver === "Sipho M." || r.requests.some(q => q.status !== "declined"));
  const r = mineRides[0] || S.rides[0];
  const pend = (r.requests || []).filter(q => q.status === "pending");
  const acc = (r.requests || []).filter(q => q.status === "accepted");
  const taken = seatsTaken(r), left = seatsLeft(r);
  const earnings = acc.reduce((n, q) => n + q.fare, 0);
  const fuel = Math.round(earnings * 0.34);
  const order = [r.from, ...r.stops.map(s => s.city), r.to];

  $('#main').innerHTML = `
  <div class="g-wrap g-section">
    <div class="g-grid">
      <div class="g-12 g-anim">
        <div class="g-card g-card-dark g-glow">
          <div class="g-between">
            <div class="g-row"><span class="g-ic g-ic-lg g-ic-glass" aria-hidden>${van()}</span>
              <div><span class="g-label">Driver console</span>
                <h1 class="g-h2 g-mt-sm">${esc(r.from)} <span style="opacity:.45">→</span> ${esc(r.to)}</h1>
                <p class="g-s">${new Date(r.depart).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} · ${new Date(r.depart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${esc(r.vehicle)} ${esc(r.plate)}</p></div>
            </div>
            <div class="g-row">
              <span class="g-stamp ${left ? "g-stamp-ink" : "g-stamp-full"}">${left ? left + " seats open" : "trip full"}</span>
              <button class="g-btn g-btn-ink g-btn-sm" id="addStop" type="button"><span aria-hidden>➕</span> Add a stop</button>
            </div>
          </div>

          <div class="g-grid g-mt" style="grid-template-columns:repeat(2,1fr);gap:10px">
            ${[["Seats filled", taken + "/" + r.seatsTotal], ["Collected so far", money(earnings)], ["Fuel estimate", "−" + money(fuel)], ["Net to you", money(Math.max(0, earnings - fuel))]].map(([l, v]) => `
              <div class="g-tile" style="padding:13px">
                <div class="g-label">${l}</div>
                <div class="g-kpi-val g-mt-sm" style="font-size:22px">${v}</div></div>`).join("")}
          </div>
          <div class="g-grid g-mt" style="grid-template-columns:repeat(2,1fr);gap:10px">
            <div class="g-tile" style="padding:13px">
              <div class="g-label">Seats left</div>
              <div class="g-kpi-val g-mt-sm" style="font-size:22px">${seatsOpen(r)}<span style="font-size:13px;opacity:.6"> of ${r.seatsTotal}</span></div>
              <div class="g-list-s">${taken} passenger seat${taken === 1 ? "" : "s"} taken</div>
            </div>
            <div class="g-tile" style="padding:13px">
              <div class="g-label">Boot left</div>
              <div class="g-kpi-val g-mt-sm" style="font-size:22px">${bootLeft(r)}<span style="font-size:13px;opacity:.6"> of ${bootTotal(r)}kg</span></div>
              <div class="g-list-s">${bootUsed(r)}kg of parcels booked · never takes a seat</div>
            </div>
          </div>
        </div>
      </div>

      <div class="g-12 g-anim">
        <div class="g-card">
          <div class="g-head"><span class="g-label">Parcel requests on your route</span>
            <span class="g-s-sm">${capacityLine(r)}</span></div>
          ${(() => {
            const inbox = parcelInbox(r);
            if (!inbox.length) return `<div class="g-empty"><span class="g-ic g-ic-lg" aria-hidden>📦</span>
              <h3 class="g-h3">No parcels waiting</h3>
              <p class="g-s g-mt-sm">Senders going your way appear here. A parcel never takes a seat, only boot space.</p></div>`;
            return inbox.map(p => {
              const fits = Number(p.weightKg) <= bootLeft(r);
              return `
              <div class="g-req g-mt-sm">
                <div class="g-between">
                  <div class="g-row"><span class="g-avatar" style="width:36px;height:36px;font-size:12px">${esc(initials(p.senderName))}</span>
                    <div><div class="g-t">${esc(p.senderName)} · ${p.weightKg}kg ${esc((PARCEL_SIZES.find(s => s.id === p.sizeClass) || {}).label || p.sizeClass)}</div>
                      <div class="g-list-s">${esc(p.pickupAddress)} → ${esc(p.destinationCity)} · ${esc(p.pickupDate)}${p.pickupTime ? " " + esc(p.pickupTime) : ""}</div></div></div>
                  <div style="text-align:right"><div class="g-kpi-val g-money" style="font-size:19px">${rands(Number(r.ratePerKg || 12) * p.weightKg)}</div>
                    <span class="g-stamp ${fits ? "g-stamp-open" : "g-stamp-full"}">${fits ? "fits the boot" : "no boot space"}</span></div>
                </div>
                ${p.description ? `<div class="g-list-s g-mt-sm">📝 ${esc(p.description)}</div>` : ""}
                <div class="g-list-row g-mt-sm"><span class="g-ic g-ic-sm" aria-hidden>⚖️</span>
                  <div><div class="g-list-t">${rands(Number(r.ratePerKg || 12))}/kg is your rate</div>
                  <div class="g-list-s">Suggested ${rands(suggestCarriage(p, r))} · you agree the final figure with the sender</div></div></div>
                <div class="g-row g-mt-sm">
                  <button class="g-btn g-btn-lime g-btn-sm" data-poffer="${p.id}" type="button" ${fits ? "" : "disabled"}><span aria-hidden>💬</span> Open and negotiate</button>
                  <button class="g-btn g-btn-ghost g-btn-sm" data-pdec="${p.id}" type="button">Pass</button>
                </div>
              </div>`;
            }).join("");
          })()}
        </div>
      </div>

      <div class="g-12 g-anim">
        <div class="g-card">
          <div class="g-head"><span class="g-label">Parcels you are carrying</span><span class="g-ic g-ic-sm" aria-hidden>📦</span></div>
          ${(() => {
            const load = (S.parcels || []).filter(p => p.rideId === r.id && ["agreed", "accepted", "booked", "collected", "in_transit"].includes(p.status));
            if (!load.length) return `<p class="g-s">Nothing booked yet. Agreed parcels show here with what you are owed.</p>`;
            return load.map(p => `
              <div class="g-list-row">
                <span class="g-ic g-ic-sm" aria-hidden>📦</span>
                <div><div class="g-list-t">${p.weightKg}kg → ${esc(p.destinationCity)}</div>
                  <div class="g-list-s">${esc(p.senderName)} · ${esc(PARCEL_LABEL[p.status] || p.status)}</div></div>
                <div class="g-list-r g-t g-money">${p.agreedPrice != null ? rands(p.agreedPrice) : "—"}</div>
              </div>`).join("");
          })()}
          <div class="g-list-row g-mt-sm"><span class="g-ic g-ic-sm" aria-hidden>🧮</span>
            <div><div class="g-list-t">Boot used ${bootUsed(r)}kg of ${bootTotal(r)}kg</div>
            <div class="g-list-s">${bootLeft(r)}kg still sellable on this trip · seats and boot are counted separately</div></div></div>
        </div>
      </div>

      <div class="g-7 g-anim" id="requests">
        <div class="g-card">
          <div class="g-head"><span class="g-label">Join requests</span>
            <span class="g-s-sm">${pend.length} waiting · ${acc.length} accepted</span></div>

          ${(r.requests || []).length ? (r.requests).map(q => `
            <div class="g-req ${q.status} g-mt-sm">
              <div class="g-between">
                <div class="g-row"><span class="g-avatar" style="width:36px;height:36px;font-size:12px">${esc(initials(q.name))}</span>
                  <div><div class="g-t">${esc(q.name)}</div><div class="g-list-s">${esc(q.phone)} · ${q.seats} seat${q.seats === 1 ? "" : "s"} · ${esc(q.luggage)}</div></div></div>
                <div style="text-align:right"><div class="g-kpi-val g-money" style="font-size:19px">${money(q.fare)}</div>
                  <span class="g-stamp ${q.status === "accepted" ? "g-stamp-full" : q.status === "pending" ? "g-stamp-open" : "g-stamp-idle"}">${esc(q.status)}</span></div>
              </div>
              <div class="g-list-row g-mt-sm"><span class="g-ic g-ic-sm" aria-hidden>📍</span>
                <div><div class="g-list-t">${esc(q.pickup)}</div><div class="g-list-s">Pickup · hop off at ${esc(q.getOff)}</div></div></div>
              ${q.status === "pending" ? `
                <div class="g-row g-mt-sm">
                  <button class="g-btn g-btn-lime g-btn-sm" data-acc="${q.id}" type="button"><span aria-hidden>✅</span> Accept seat</button>
                  <button class="g-btn g-btn-ghost g-btn-sm" data-dec="${q.id}" type="button">Decline</button>
                </div>` : `<a class="g-btn g-btn-ghost g-btn-sm g-mt-sm" href="#"><span aria-hidden>💬</span> Message ${esc(q.name.split(" ")[0])}</a>`}
            </div>`).join("") : `
            <div class="g-empty"><span class="g-ic g-ic-lg" aria-hidden>📭</span>
              <h3 class="g-h3">No requests yet</h3>
              <p class="g-s g-mt-sm">Requests from your route land here. Accept them until the car is full.</p></div>`}

          ${left === 0 && acc.length ? `
            <div class="g-card g-card-lime g-mt">
              <div class="g-row"><span class="g-ic g-ic-lime" aria-hidden>🎉</span>
                <div><div class="g-t">Trip full — ready to depart</div>
                  <div class="g-s-sm">All ${r.seatsTotal} seats are taken. Pickups run in route order below.</div></div></div>
              <button class="g-btn g-btn-ink g-btn-block g-mt" id="startTrip" type="button" ${r.status === "started" ? "disabled" : ""}>
                <span aria-hidden>🛣️</span> ${r.status === "started" ? "Trip started" : "Start trip and collect"}</button>
            </div>` : ""}
        </div>

        ${acc.length ? `
        <div class="g-card g-mt">
          <div class="g-head"><span class="g-label">Pickup run sheet</span><span class="g-ic g-ic-sm" aria-hidden>🧾</span></div>
          ${order.map((c, i) => {
            const here = acc.filter(q => q.getOff === c || (i === order.length - 1 && q.getOff === r.to));
            const pickups = acc.filter(q => i === 0 || (i > 0 && q.getOff !== order[i - 1]));
            void pickups;
            return `
            <div class="g-list-row">
              <span class="g-route-dot" aria-hidden>${i === 0 ? "📍" : i === order.length - 1 ? "🏁" : "🛣️"}</span>
              <div><div class="g-list-t">${esc(c)}</div>
                <div class="g-list-s">${here.length ? here.map(q => esc(q.name) + " (" + q.seats + ")").join(", ") + " getting off" : "no drop-offs"}</div></div>
              <div class="g-list-r g-s-sm">${i === 0 ? "start" : "stop " + i}</div>
            </div>`;
          }).join("")}

          <h3 class="g-h3 g-mt-lg">Collect in this order</h3>
          ${acc.slice().sort((a, b) => order.indexOf(a.getOff) - order.indexOf(b.getOff)).map(q => `
            <div class="g-list-row"><span class="g-ic g-ic-sm g-ic-lime" aria-hidden>${van()}</span>
              <div><div class="g-list-t">${esc(q.name)} · ${q.seats} seat${q.seats === 1 ? "" : "s"}</div>
                <div class="g-list-s">${esc(q.pickup)}</div></div>
              <div class="g-list-r"><a class="g-btn g-btn-ink g-btn-sm" href="#"><span aria-hidden>📞</span> Call</a></div></div>`).join("")}
        </div>` : ""}
      </div>

      <div class="g-5 g-anim">
        <div class="g-card">
          <div class="g-head"><span class="g-label">Seat map</span><span class="g-s-sm">${taken}/${r.seatsTotal}</span></div>
          <div class="g-grid" style="grid-template-columns:repeat(3,1fr);gap:9px">
            ${(() => {
              const seatPeople = [];
              acc.forEach(q => { for (let n = 0; n < q.seats; n++) seatPeople.push(n === 0 ? q.name.split(" ")[0] : q.name.split(" ")[0] + " +"); });
              return Array.from({ length: r.seatsTotal }, (_, i) => {
                const who = seatPeople[i];
                return `<div style="border:1px solid ${who ? "rgba(141,182,0,.5)" : "var(--ink-faint)"};background:${who ? "var(--lime-wash)" : "var(--card)"};border-radius:4px;padding:11px;text-align:center">
                  <div style="font-size:19px">${who ? "🧍" : "🪑"}</div>
                  <div class="g-s-sm" style="font-size:10.5px">${who ? esc(who) : "open"}</div></div>`;
              }).join("");
            })()}
          </div>
          <div class="g-list-row g-mt"><span class="g-ic g-ic-sm" aria-hidden>🧳</span>
            <div><div class="g-list-t">${esc(r.luggage)}</div><div class="g-list-s">Boot space declared on this ride</div></div></div>
          <div class="g-row g-mt">
            <button class="g-btn g-btn-ghost g-btn-sm" id="publishRide" type="button">Share ride link</button>
            <button class="g-btn g-btn-ghost g-btn-sm" type="button">Edit fare</button>
          </div>
        </div>

        <div class="g-card g-mt">
          <div class="g-head"><span class="g-label">This week</span><span class="g-ic g-ic-sm" aria-hidden>📈</span></div>
          <div class="g-kpi-val" id="dEarn">R0</div>
          <div class="g-bar g-mt-sm"><i data-w="72"></i></div>
          <p class="g-s-sm g-mt-sm">7 seats of 13 filled this week · rating holding at 4.9</p>
          <div class="g-spark g-mt" aria-hidden>${[35, 55, 45, 80, 60, 90, 75].map(v => `<i data-h="${v}"></i>`).join("")}</div>
        </div>

        <div class="g-card g-mt">
          <div class="g-head"><span class="g-label">Stops on this ride</span><span class="g-ic g-ic-sm" aria-hidden>🛣️</span></div>
          ${r.stops.length ? r.stops.map(s => `
            <div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>🚏</span>
              <div><div class="g-list-t">${esc(s.city)}</div><div class="g-list-s">around ${esc(s.time)} · ${money(s.fare)} per seat</div></div>
              <div class="g-list-r"><button class="g-btn g-btn-ghost g-btn-sm" data-rm="${esc(s.city)}" type="button">Remove</button></div></div>`).join("")
            : `<p class="g-s">No stops. Add one so commuters on the way can hop in.</p>`}
          <button class="g-btn g-btn-ink g-btn-block g-mt" id="addStop2" type="button"><span aria-hidden>➕</span> Add a stop on the route</button>
        </div>
      </div>
    </div>
  </div>`;

  /* ── parcels: negotiate, then commit to the job ─────────────────────── */
  $$('[data-poffer]').forEach(b => b.onclick = () => {
    const p = parcel(b.dataset.poffer);
    if (!p) return;
    p.rideId = r.id; p.driverId = r.driver; p.ratePerKg = Number(r.ratePerKg || 12);
    if (!p.suggested) p.suggested = suggestCarriage(p, r);
    const th = parcelThread(p);
    if (!th.msgs.length) {
      parcelSay(p, "driver", "text", "Hi " + p.senderName + ", I do " + r.from + " to " + r.to +
        " on " + new Date(r.depart).toLocaleDateString([], { day: "numeric", month: "short" }) +
        ". I can take a " + p.weightKg + "kg parcel.");
    }
    save();
    openOfferSheet(p, r);
  });
  $$('[data-pdec]').forEach(b => b.onclick = () => {
    const p = parcel(b.dataset.pdec);
    if (!p) return;
    p.status = "withdrawn"; p.updatedAt = new Date().toISOString();
    save(); toast("<b>Passed</b> · the sender can try another driver"); setTimeout(() => location.reload(), 700);
  });

  /* the offer composer: offer, accept their number, or decline */
  function openOfferSheet(p, rideRow) {
    const old = document.querySelector('#offerSheet'); if (old) old.remove();
    const th = parcelThread(p);
    const theirOffer = p.lastOfferBy === "sender" && offerLive(p) ? p.offeredPrice : null;
    const suggested = suggestCarriage(p, rideRow);
    const rate = Number(rideRow.ratePerKg || 12);
    const isCounter = theirOffer != null;
    const canCommit = p.agreedPrice != null;

    const sheet = document.createElement('div');
    sheet.className = 'g-sheet'; sheet.id = 'offerSheet';

    const head = document.createElement('div');
    head.className = 'g-between';
    head.style.marginBottom = '10px';
    head.innerHTML = '<div><span class="g-label">' + esc(p.senderName) + ' · ' + p.weightKg + 'kg</span>' +
      '<div class="g-t g-mt-sm">' + esc(p.pickupAddress) + ' → ' + esc(p.destinationCity) + '</div></div>' +
      '<button class="g-btn g-btn-ghost g-btn-sm" type="button" id="offClose" aria-label="Close">✕</button>';

    const cap = document.createElement('div');
    cap.className = 'g-list-row';
    cap.innerHTML = '<span class="g-ic g-ic-sm" aria-hidden>🧮</span>' +
      '<div><div class="g-list-t">' + capacityLine(rideRow) + '</div>' +
      '<div class="g-list-s">Suggested ' + rands(suggested) + ' at ' + rands(rate) + '/kg</div></div>';

    const thread = document.createElement('div');
    thread.className = 'g-thread g-mt'; thread.id = 'offThread';
    thread.style.maxHeight = '200px';

    const hintEl = document.createElement('p');
    hintEl.className = 'g-s-sm g-mt-sm';
    hintEl.innerHTML = theirOffer != null
      ? 'They offered <b>' + rands(theirOffer) + '</b>. Accept it or counter.'
      : (canCommit ? 'Price agreed at <b>' + rands(p.agreedPrice) + '</b>. Accept the job to lock it in.' : 'Send your price. They can accept or counter.');

    const amtRow = document.createElement('div');
    amtRow.className = 'g-row g-mt'; amtRow.style.gap = '8px';
    const amt = document.createElement('input');
    amt.id = 'offAmt'; amt.className = 'g-bk-in'; amt.type = 'number';
    amt.min = '1'; amt.step = '1'; amt.inputMode = 'decimal';
    amt.style.paddingLeft = '14px'; amt.placeholder = 'Amount in rands';
    amt.value = String(theirOffer != null ? theirOffer : suggested);
    const sendBtn = document.createElement('button');
    sendBtn.className = 'g-btn g-btn-ink'; sendBtn.type = 'button'; sendBtn.id = 'offSend';
    sendBtn.textContent = isCounter ? 'Counter' : 'Send offer';
    amtRow.appendChild(amt); amtRow.appendChild(sendBtn);

    const btnRow = document.createElement('div');
    btnRow.className = 'g-row g-mt-sm';
    if (isCounter) {
      const take = document.createElement('button');
      take.className = 'g-btn g-btn-lime'; take.type = 'button'; take.id = 'offTake';
      take.textContent = 'Accept ' + rands(theirOffer);
      btnRow.appendChild(take);
    }
    if (canCommit) {
      const commit = document.createElement('button');
      commit.className = 'g-btn g-btn-lime'; commit.type = 'button'; commit.id = 'offCommit';
      commit.textContent = 'Accept the job · ' + rands(p.agreedPrice);
      btnRow.appendChild(commit);
    }
    const decline = document.createElement('button');
    decline.className = 'g-btn g-btn-ghost'; decline.type = 'button'; decline.id = 'offDecline';
    decline.textContent = 'Decline';
    btnRow.appendChild(decline);

    const note = document.createElement('p');
    note.className = 'g-s-sm g-mt-sm';
    note.textContent = 'Only what you type here sets a price. Free chat can never be read as agreement.';

    const card = document.createElement('div');
    card.className = 'g-sheet-card';
    card.style.maxWidth = '440px';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Negotiate the parcel');
    [head, cap, thread, hintEl, amtRow, btnRow, note].forEach(n => card.appendChild(n));
    sheet.appendChild(card);
    document.body.appendChild(sheet);

    const close = () => sheet.remove();
    sheet.querySelector('#offClose').onclick = close;
    sheet.onclick = e => { if (e.target === sheet) close(); };

    const paintOff = () => {
      thread.innerHTML = th.msgs.map(m => {
        if (m.kind === "text") return '<div class="g-msg ' + (m.role === "driver" ? "me" : "them") +
          '"><div class="g-msg-b">' + esc(m.body) + '</div></div>';
        const word = m.kind === "offer" ? "Offered" : m.kind === "counter" ? "Countered" : m.kind === "accept" ? "Accepted" : "Declined";
        return '<div class="g-offer ' + (m.role === "driver" ? "me" : "them") +
          '"><div class="g-offer-h"><span class="g-label">' + word + '</span><span class="g-s-sm">' +
          (m.amount != null ? rands(m.amount) : "") + '</span></div></div>';
      }).join("") || '<p class="g-s-sm">No messages yet.</p>';
      thread.scrollTop = thread.scrollHeight;
    };
    paintOff();

    sendBtn.onclick = () => {
      const n = Number(amt.value || 0);
      if (!n || n <= 0) { toast("<b>Enter an amount in rands</b>"); return; }
      const kind = isCounter ? "counter" : "offer";
      parcelSay(p, "driver", kind, kind === "counter" ? "I can do " + rands(n) : "I can take it for " + rands(n), n);
      save();
      toast("<b>" + (kind === "counter" ? "Countered" : "Offer sent") + "</b> · " + rands(n) + " · valid " + OFFER_MINUTES + " min");
      close(); setTimeout(() => location.reload(), 400);
    };
    const take = sheet.querySelector('#offTake');
    if (take) take.onclick = () => {
      if (!offerLive(p)) { toast("<b>That offer expired</b>"); close(); setTimeout(() => location.reload(), 400); return; }
      parcelSay(p, "driver", "accept", "Agreed at " + rands(p.offeredPrice));
      save(); toast("<b>Price agreed</b> · " + rands(p.agreedPrice) + " · now accept the job to lock it in");
      close(); setTimeout(() => location.reload(), 400);
    };
    const commit = sheet.querySelector('#offCommit');
    if (commit) commit.onclick = () => {
      const res = driverAccept(p);
      if (!res.ok) { toast("<b>" + esc(res.why) + "</b>"); return; }
      if (window.GOGOChat) GOGOChat.system(rideRow.id, "📦 " + p.senderName + " · " + p.weightKg + "kg parcel accepted · " + rands(p.agreedPrice));
      S.activity.unshift({ e: "📦", t: "Parcel accepted from " + p.senderName, s: p.weightKg + "kg → " + p.destinationCity, when: "just now" });
      save(); toast("<b>Job accepted</b> · collect at " + esc(p.pickupAddress));
      close(); setTimeout(() => location.reload(), 400);
    };
    decline.onclick = () => {
      parcelSay(p, "driver", "decline", "I cannot take it at that price.");
      save(); toast("<b>Declined</b> · nothing owed"); close(); setTimeout(() => location.reload(), 400);
    };
  }


  $$('[data-acc]').forEach(b => b.onclick = () => {
    const q = r.requests.find(x => x.id === b.dataset.acc);
    if (seatsLeft(r) < q.seats) { toast("<b>Not enough seats</b> left for " + esc(q.name)); return; }
    q.status = "accepted"; r.status = seatsLeft(r) === 0 ? "full" : "open";
    if (window.GOGOChat) { const th = GOGOChat.ensure(r.id, q.name, "passenger"); GOGOChat.push(th, "system", `${q.name} joined · seat confirmed · pickup ${q.pickup}`); }
    S.activity.unshift({ e: "✅", t: "Seat accepted for " + q.name, s: `${r.from} → ${q.getOff}`, when: "just now" });
    save(); toast("Seat accepted for <b>" + esc(q.name) + "</b>");
    setTimeout(() => location.reload(), 700);
  });
  $$('[data-dec]').forEach(b => b.onclick = () => {
    const q = r.requests.find(x => x.id === b.dataset.dec); q.status = "declined"; save(); location.reload();
  });
  $$('[data-rm]').forEach(b => b.onclick = () => {
    r.stops = r.stops.filter(s => s.city !== b.dataset.rm); save(); location.reload();
  });
  const start = $('#startTrip');
  if (start && r.status !== "started") start.onclick = () => { r.status = "started"; save(); if (window.GOGOChat) GOGOChat.system(r.id, "Trip started · your driver is on the way to the first pickup"); toast("<b>Trip started</b> · passengers notified"); setTimeout(() => location.reload(), 800); };

  const addStop = () => {
    const city = prompt("Which town are you stopping at?\n(e.g. Queenstown, Butterworth, Idutywa, Cala)");
    if (!city) return;
    const fare = Number(prompt("Fare per seat to " + city + " (R)", "150") || 0);
    r.stops.push({ city: city.trim(), time: "on route", fare: fare || 150 });
    S.activity.unshift({ e: "🛣️", t: "Stop added: " + city.trim(), s: `${money(fare || 150)} per seat`, when: "just now" });
    save(); toast("Stop added: <b>" + esc(city.trim()) + "</b>"); setTimeout(() => location.reload(), 700);
  };
  if ($('#addStop')) $('#addStop').onclick = addStop;
  if ($('#addStop2')) $('#addStop2').onclick = addStop;
  if ($('#publishRide')) $('#publishRide').onclick = () => toast("Ride link copied · <b>gogo.co.za/r/" + r.id + "</b>");
  countUp($('#dEarn'), earnings || 1450, "R");
}



/* ── boot ───────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  paintChrome(page);
  if (page === "home") pageHome();
  if (page === "rides") pageRides();
  if (page === "ride") pageRide();
  if (page === "rider") pageRider();
  if (page === "ticket") pageTicket();
  if (page === "driver") pageDriver();
  if (page === "parcel") pageParcel();
  if (page === "more" && typeof pageMore === "function") pageMore();
  if (page === "dashboard" && typeof pageDashboard === "function") pageDashboard();
  reveal(); grow();
  /* Modules boot after this and inject their own .g-anim blocks, so reveal
     again whenever #main changes — otherwise late content stays at opacity 0. */
  try {
    const mainEl = $('#main');
    if (mainEl && window.MutationObserver) {
      let rT = null;
      new MutationObserver(() => { clearTimeout(rT); rT = setTimeout(() => { reveal(); grow(); }, 50); })
        .observe(mainEl, { childList: true, subtree: true });
    }
  } catch (e) { /* older browsers: content is visible anyway */ }
});

window.GOGO = { reveal: reveal, grow: grow, save: save, toast: toast, money: money, esc: esc, van: van, VAN_SVG: VAN_SVG };


/* =========================================================================
   An animated placeholder for the pickup field.
   The field invites the passenger in one character at a time, then stops the
   moment they focus it or start typing. Reduced-motion users get the plain
   label with no animation at all.
   ========================================================================= */
(function () {
  var PHRASES = ["We fetch you from your doorstep", "Enter your pickup address", "Street, suburb or landmark"];
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var field = null, phraseIx = 0, charIx = 0, deleting = false, timer = null;

  function attach() {
    if (field) return true;
    field = document.getElementById("from");
    if (!field) return false;
    if (reduce) { field.placeholder = PHRASES[0]; return true; }
    step();
    return true;
  }
  function busy() {
    return !field || document.activeElement === field || (field.value || "").length > 0;
  }
  function step() {
    clearTimeout(timer);
    if (!field) { attach(); return; }
    if (busy()) { field.placeholder = PHRASES[0]; timer = setTimeout(step, 700); return; }
    var phrase = PHRASES[phraseIx];
    if (!deleting) {
      charIx++;
      field.placeholder = phrase.slice(0, charIx);
      if (charIx === phrase.length) { deleting = true; timer = setTimeout(step, 1600); return; }
      timer = setTimeout(step, 60);
    } else {
      charIx--;
      field.placeholder = phrase.slice(0, charIx);
      if (charIx === 0) { deleting = false; phraseIx = (phraseIx + 1) % PHRASES.length; timer = setTimeout(step, 280); return; }
      timer = setTimeout(step, 26);
    }
  }
  function start() {
    if (attach()) return;
    var tries = 0, iv = setInterval(function () { if (attach() || ++tries > 40) clearInterval(iv); }, 150);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  window.addEventListener("load", start);
})();


/* =========================================================================
   #from — Google Places autocomplete

   Replaces the manual Suburb + Province/City fields. The rider types one line
   and picks; the house number and street fill the visible box, and the town and
   province go into #fromSuburb / #fromArea, which the draft, the payload, the
   validation and the share URL already read.

   National coverage, no location bias: a GOGO ride can start anywhere in South
   Africa. (The laundry app biases to one city because it only collects there.)

   AutocompleteSuggestion.fetchAutocompleteSuggestions is STATIC on the class —
   calling it on `new AutocompleteSuggestion()` throws "not a function", and a
   swallowed throw is indistinguishable from "no results".
   ========================================================================= */
(function () {
  /* EVENT DELEGATION, on purpose.

     The booking form is re-rendered as the sheet opens and as steps change, so a
     listener bound to #from at load time ends up on a node that is no longer on
     the page — typing goes nowhere and no lookup ever fires. That is exactly the
     failure this had on the first pass.

     `document` is never replaced, so the handlers below always see the live
     element. Nothing to re-bind, no observer, no ordering to get wrong. */
  var session = null, timer = null, rows = [], inputEl = null;

  function fromEl() { return document.getElementById("from"); }
  function listEl() { return document.getElementById("fromList"); }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function close() {
    var l = listEl();
    if (l) l.hidden = true;
    var i = fromEl();
    if (i) i.setAttribute("aria-expanded", "false");
  }

  function draw() {
    var l = listEl();
    if (!l) return;
    if (!rows.length) return close();
    l.innerHTML = rows.map(function (r, i) {
      return '<button type="button" role="option" class="g-from-opt" data-i="' + i + '">' +
             '<span class="g-from-pin" aria-hidden="true">&#128205;</span>' +
             '<span class="g-from-txt"><b>' + esc(r.primary) + '</b>' +
             (r.secondary ? '<small>' + esc(r.secondary) + '</small>' : '') + '</span></button>';
    }).join("");
    l.hidden = false;
    var i2 = fromEl();
    if (i2) i2.setAttribute("aria-expanded", "true");
  }

  function search(q) {
    var G = window.GOGOPlacesGoogle;
    var l = listEl();
    if (!G) {
      if (l) { l.innerHTML = '<div class="g-from-err">Address lookup is unavailable.</div>'; l.hidden = false; }
      return;
    }
    G.load().then(function () {
      var P = window.google && window.google.maps && window.google.maps.places;
      if (!P) return;
      if (!session) session = new P.AutocompleteSessionToken();
      /* STATIC on the class: calling this on `new AutocompleteSuggestion()`
         throws "not a function", and a swallowed throw is indistinguishable
         from "no results". Hence the plain return, no empty catch. */
      return P.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q, sessionToken: session, includedRegionCodes: ["za"]
      }).then(function (res) {
        rows = ((res && res.suggestions) || []).filter(function (x) { return x.placePrediction; })
          .map(function (x) {
            var pr = x.placePrediction;
            return { placeId: pr.placeId,
                     primary: (pr.mainText && pr.mainText.text) || "",
                     secondary: (pr.secondaryText && pr.secondaryText.text) || "" };
          });
        draw();
      }).catch(function (e) {
        var le = listEl();
        if (le) {
          le.innerHTML = '<div class="g-from-err">Address lookup failed — ' + esc(e && e.message || e) + '</div>';
          le.hidden = false;
        }
      });
    }).catch(function (e) {
      var le = listEl();
      if (le) {
        le.innerHTML = '<div class="g-from-err">Address lookup is unavailable — ' + esc(e && e.message || e) + '</div>';
        le.hidden = false;
      }
    });
  }

  function apply(placeId, primary) {
    var input = fromEl();
    var P = window.google && window.google.maps && window.google.maps.places;
    if (!P || !input) { if (input) input.value = primary; close(); return; }
    var place = new P.Place({ id: placeId });
    place.fetchFields({ fields: ["addressComponents", "formattedAddress", "location"] }).then(function () {
      var c = place.addressComponents || [];
      function get(t) {
        for (var i = 0; i < c.length; i++) {
          if ((c[i].types || []).indexOf(t) !== -1) return c[i].longText || c[i].long_name || "";
        }
        return "";
      }
      var line = [get("street_number"), get("route") || get("premise")].filter(Boolean).join(" ") || primary;
      input.value = line;

      var rawTown = get("locality") || get("postal_town") || get("administrative_area_level_2") || "";
      var town = (window.GOGORenames && GOGORenames.townOf) ? GOGORenames.townOf(rawTown) : rawTown;
      var rawSub = get("sublocality_level_1") || get("sublocality") || get("neighborhood") || "";
      var sub = (window.GOGORenames && GOGORenames.cleanSuburb) ? GOGORenames.cleanSuburb(rawSub) : rawSub;

      /* The Suburb and Province/City fields were removed from the form. The
         values live on window now — the draft, the validation, the payload and
         the share URL all read them from there. Writing to the deleted elements
         would silently do nothing, and the city gate would never pass. */
      window.__gogoPickedSuburb = sub;
      window.__gogoPickedTown = town;
      window.__gogoPickedCity = town;
      window.__gogoPickedProvince = get("administrative_area_level_1");

      /* the form's own handlers must run, or the draft never sees any of this */
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (areaEl) areaEl.dispatchEvent(new Event("change", { bubbles: true }));
      close();
      session = null;
    }).catch(function () {
      input.value = primary;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    });
  }

  /* ── the delegated handlers ───────────────────────────────────────────── */
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || t.id !== "from") return;
    var q = t.value;
    if (timer) clearTimeout(timer);
    if (q.trim().length < 3) { rows = []; return close(); }
    timer = setTimeout(function () { search(q); }, 220);
  }, true);

  document.addEventListener("mousedown", function (e) {
    var t = e.target;
    var opt = t && t.closest ? t.closest(".g-from-opt") : null;
    if (!opt) return;
    e.preventDefault();
    var r = rows[Number(opt.dataset.i)];
    if (r) apply(r.placeId, r.primary);
  }, true);

  document.addEventListener("blur", function (e) {
    if (e.target && e.target.id === "from") setTimeout(close, 160);
  }, true);

  document.addEventListener("keydown", function (e) {
    if (e.target && e.target.id === "from" && e.key === "Escape") close();
  }, true);
})();
