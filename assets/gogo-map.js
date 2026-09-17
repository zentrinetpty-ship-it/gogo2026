/* =========================================================================
   GOGO — live map
   Desktop: one layer inside the hero (light basemap + vivid markers).
   Mobile:  the basemap renders on the BODY, behind the booking card, and the
            route with its pins renders inside the HERO so the corridor lines
            are clearly visible where the copy is.
   Key-free tiles only. No API key, no library.
   ========================================================================= */

const GOGOMap = (() => {
  const TILE = 256;
  const BASEMAPS = [
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",  // whitish, key-free
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",                                                             // colourful fallback
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",               // imagery, last resort
  ];
  const CENTER = { lat: -32.05, lng: 28.05 };
  const ZOOM = 8;

  const CITIES = [
    { name: "East London", lat: -33.0153, lng: 27.9116, hub: true, tone: "lime", svg: "van",  note: "12 seats leaving today" },
    { name: "Komani",      lat: -31.8976, lng: 26.8753,            tone: "navy", svg: "stop", note: "hop off R120" },
    { name: "Butterworth", lat: -32.3309, lng: 28.1499,            tone: "gold", svg: "stop", note: "hop off R170" },
    { name: "Idutywa",     lat: -32.0976, lng: 28.3079,            tone: "gold", svg: "stop", note: "hop off R195" },
    { name: "Mthatha",     lat: -31.5889, lng: 28.7844, hub: true, tone: "lime", svg: "flag", note: "arrives 10:10" },
  ];

  const POIS = [
    { lat: -32.5746, lng: 27.4432, tone: "gold", svg: "fuel", label: "Fuel on the N2" },
  ];

  const ICON = {
    van: '<svg class="g-van" viewBox="0 0 48 26" aria-hidden="true"><path fill-rule="evenodd" d="M3.4 18.8 L3.4 15 L5.6 14.8 L6.6 11.6 L11 9 L16.2 6.4 L37.4 6.4 L42.2 10.2 L45 13.4 L45.6 15.2 L45.6 18.8 Z M17.6 8.2 L25.2 8.2 L25.2 12.2 L16.4 12.2 Z M26.8 8.2 L35.6 8.2 L39.4 11.6 L39.4 12.2 L26.8 12.2 Z"/><circle cx="13.1" cy="18.8" r="3.5"/><circle cx="34.1" cy="18.8" r="3.5"/><rect x="4.9" y="12.6" width="2.6" height="1.7" rx="0.6"/><rect x="44.2" y="13.6" width="1.8" height="1.7" rx="0.6"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.2"/><circle cx="12" cy="12" r="2.6" fill="#fff"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M6 3.2c0-.7.5-1.2 1.2-1.2s1.2.5 1.2 1.2v17.6c0 .7-.5 1.2-1.2 1.2S6 21.5 6 20.8V3.2z"/><path d="M8.6 4.1l7.4 2.6c1 .4 1 1.8 0 2.2l-7.4 2.7V4.1z"/></svg>',
    fuel: '<svg viewBox="0 0 24 24"><rect x="3.6" y="3" width="8.4" height="18" rx="1.4"/><rect x="5.4" y="5.4" width="4.8" height="4.6" rx="1" fill="#fff" opacity=".85"/><path d="M12.6 8.4h2.2v7.4a1.6 1.6 0 0 0 3.2 0V9.6l-2.3-2.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  };

  const project = (lat, lng, z) => {
    const n = TILE * Math.pow(2, z === undefined ? ZOOM : z);
    const x = (lng + 180) / 360 * n;
    const s = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    return { x, y };
  };

  function build(el, opts) {
    opts = opts || {};
    const wantTiles = opts.tiles !== false;
    const wantMarks = opts.markers !== false;
    const zoom = opts.zoom || ZOOM;
    const bmStart = opts.bm || 0;
    const offX = opts.offX === undefined ? 0.05 : opts.offX;
    const offY = opts.offY === undefined ? 0.06 : opts.offY;

    const rect = el.getBoundingClientRect();
    const w = Math.max(rect.width || window.innerWidth, 300);
    const h = Math.max(rect.height || window.innerHeight, 300);
    const centre = project(CENTER.lat, CENTER.lng, zoom);
    const t0x = Math.floor((centre.x - w / 2) / TILE) - 1;
    const t0y = Math.floor((centre.y - h / 2) / TILE) - 1;
    const cols = Math.ceil(w / TILE) + 3, rows = Math.ceil(h / TILE) + 3;
    const originX = t0x * TILE, originY = t0y * TILE;
    const baseT = `translate(${-(centre.x - originX - w / 2) - w * offX}px, ${-(centre.y - originY - h / 2) + h * offY}px)`;

    el.innerHTML = "";
    let stage = null, overlay = null;

    /* ── basemap tiles ── */
    if (wantTiles) {
      stage = document.createElement("div");
      stage.className = "g-map-stage";
      stage.style.width = (cols * TILE) + "px";
      stage.style.height = (rows * TILE) + "px";
      stage.style.transform = baseT;
      const hi = window.devicePixelRatio > 1;
      const srcOf = (url, z, x, y) => url.replace("{z}", z).replace("{x}", x).replace("{y}", y);
      const maxTile = Math.pow(2, zoom) - 1;
      let failed = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = t0x + c, y = t0y + r;
          if (x < 0 || y < 0 || x > maxTile || y > maxTile) continue;
          const img = document.createElement("img");
          img.className = "g-map-tile";
          img.alt = "";
          img.decoding = "async";
          img.style.left = (c * TILE) + "px";
          img.style.top = (r * TILE) + "px";
          img.dataset.step = "0";
          img.src = srcOf(BASEMAPS[bmStart], zoom, x, y);
          img.onerror = () => {
            const step = Number(img.dataset.step) + 1;
            img.dataset.step = String(step);
            const nxt = step + bmStart;
            if (nxt < BASEMAPS.length) img.src = srcOf(BASEMAPS[nxt], zoom, x, y);
            else { failed++; if (failed > 6) el.classList.add("g-map-off"); }
          };
          img.onload = () => el.classList.add("g-map-ready");
          stage.appendChild(img);
        }
      }
      el.appendChild(stage);
    }

    let cars = [], place = () => {}, place2 = null;

    /* ── route, pins and live vans ── */
    if (wantMarks) {
      overlay = document.createElement("div");
      overlay.className = "g-map-overlay";
      overlay.style.transform = baseT;

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("class", "g-map-route");
      svg.setAttribute("width", cols * TILE);
      svg.setAttribute("height", rows * TILE);
      const pts = CITIES.map(c => {
        const q = project(c.lat, c.lng, zoom);
        return { x: q.x - originX, y: q.y - originY, name: c.name, hub: c.hub, tone: c.tone, svg: c.svg, note: c.note };
      });
      const line = pts.map(q => q.x + "," + q.y).join(" ");
      svg.innerHTML = `
        <polyline points="${line}" fill="none" stroke="#0B0B0B" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
        <polyline points="${line}" fill="none" stroke="#B7E22A" stroke-width="4.5" stroke-dasharray="12 9" stroke-linecap="round" stroke-linejoin="round"/>`;
      overlay.appendChild(svg);

      pts.forEach(q => {
        const pin = document.createElement("div");
        pin.className = "g-map-pin" + (q.hub ? " hub" : "") + " tone-" + q.tone;
        pin.style.left = q.x + "px"; pin.style.top = q.y + "px";
        pin.innerHTML = `<span class="g-map-badge">${ICON[q.svg]}</span>` + (q.hub
          ? `<span class="g-map-chip hub"><b>${q.name}</b><i>${q.note}</i></span>`
          : `<span class="g-map-chip mini"><b>${q.name}</b></span>`);
        overlay.appendChild(pin);
      });

      POIS.forEach(poi => {
        const p = project(poi.lat, poi.lng, zoom);
        const node = document.createElement("div");
        node.className = "g-map-poi tone-" + poi.tone;
        node.style.left = (p.x - originX) + "px"; node.style.top = (p.y - originY) + "px";
        node.innerHTML = `<span class="g-map-poi-ic">${ICON[poi.svg]}</span><span class="g-map-poi-lb">${poi.label}</span>`;
        overlay.appendChild(node);
      });

      const segs = [];
      for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
      const total = segs.reduce((n, [a, b]) => n + Math.hypot(b.x - a.x, b.y - a.y), 0);
      for (let i = 0; i < 2; i++) {
        const car = document.createElement("div");
        car.className = "g-map-car";
        car.innerHTML = `<span class="g-map-car-ring"></span><span class="g-map-car-body">${ICON.van}</span>`;
        overlay.appendChild(car);
        cars.push({ el: car, t: i * 0.42 + 0.08, speed: 0.018 + i * 0.006, off: (i % 2 ? 14 : -14) });
      }

      place = car => {
        let d = car.t * total;
        for (const [a, b] of segs) {
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (d <= len) {
            const k = d / len;
            const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
            car.el.style.left = (a.x + (b.x - a.x) * k + nx * car.off) + "px";
            car.el.style.top = (a.y + (b.y - a.y) * k + ny * car.off) + "px";
            car.el.style.setProperty("--ang", (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) + "deg");
            return;
          }
          d -= len;
        }
      };
      cars.forEach(place);
      el.appendChild(overlay);
    }

    /* ── motion: vans crawl the route and the whole frame drifts slowly ── */
    let raf = null, last = 0;
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const still = reduced || document.documentElement.classList.contains("no-anim");
    function tick(ts) {
      const dt = last ? Math.min(48, ts - last) : 16; last = ts;
      cars.forEach(c => { c.t = (c.t + c.speed * dt / 1000) % 1; place(c); });
      if (stage || overlay) {
        const dx = Math.sin(ts / 26000) * 18, dy = Math.cos(ts / 34000) * 12;
        const t = baseT.replace(/translate\(([-0-9.]+)px, ([-0-9.]+)px\)/, (m, a, b) =>
          `translate(${parseFloat(a) + dx}px, ${parseFloat(b) + dy}px)`);
        if (stage) stage.style.transform = t;
        if (overlay) overlay.style.transform = t;
      }
      raf = requestAnimationFrame(tick);
    }
    if (!still && (cars.length || stage)) raf = requestAnimationFrame(tick);

    el.dataset.stop = "1";
    el.addEventListener("gogo:stop", () => { if (raf) cancelAnimationFrame(raf); });
    return stage;
  }

  let rebuilt = false;
  function boot() {
    const heroEl = document.getElementById("heroMap");
    if (!heroEl) return;
    const start = () => {
      const narrow = window.innerWidth < 900;
      if (narrow) {
        /* the basemap covers the top of the page, behind the booking card */
        let bodyMap = document.getElementById("bodyMap");
        if (!bodyMap) {
          bodyMap = document.createElement("div");
          bodyMap.id = "bodyMap";
          bodyMap.className = "g-body-map";
          bodyMap.setAttribute("aria-hidden", "true");
          document.body.insertBefore(bodyMap, document.body.firstChild);
        }
        /* the basemap must reach past the booking card, not just the viewport */
        const card = document.querySelector(".g-book");
        const cardBottom = card ? Math.ceil(card.getBoundingClientRect().bottom + 70) : 0;
        bodyMap.style.height = Math.max(window.innerHeight, cardBottom) + "px";
        heroEl.innerHTML = "";
        heroEl.classList.add("g-hero-map-blank");
        /* tiles AND the corridor in one layer, so the lines sit exactly on the map
           and are framed inside the hero, where the copy is */
        build(bodyMap, { tiles: true, markers: true, zoom: 7, offX: 0, offY: -0.255, bm: 1 });
      } else {
        build(heroEl, { zoom: 7, offX: -0.06, offY: 0.30 });
      }
    };
    if (document.readyState === "complete") start(); else window.addEventListener("load", start);
    /* rebuild once if the device crosses the desktop/mobile line */
    window.addEventListener("resize", () => {
      const narrow = window.innerWidth < 900;
      const wasNarrow = document.body.classList.contains("g-map-mobile");
      if (narrow === wasNarrow) return;
      document.body.classList.toggle("g-map-mobile", narrow);
      clearTimeout(rebuilt);
      rebuilt = setTimeout(() => { const e = document.getElementById("heroMap"); if (e) { e.innerHTML = ""; const b = document.getElementById("bodyMap"); if (b) b.innerHTML = ""; start(); } }, 300);
    });
    document.body.classList.toggle("g-map-mobile", window.innerWidth < 900);
  }

  return { boot, build, CITIES, POIS, BASEMAPS };
})();

window.GOGOMap = GOGOMap;
document.addEventListener("DOMContentLoaded", () => { if (document.body.dataset.page === "home") GOGOMap.boot(); });
