/* =========================================================================
   GOGO — HERO MAP  (v2: irregular street field)

   v1 was rejected on sight and the reason was fair: the road grid was a uniform
   lattice, so it read as graph paper, not as a city. Real street networks have
   three properties v1 lacked:

     1. HIERARCHY   arterials are visibly wider than side streets, and there are
                    three tiers, not two
     2. IRREGULARITY  blocks are long rectangles, not squares; some streets stop
                    dead; not every street meets every other one
     3. OFFSETS     streets are not evenly spaced — clusters of tight blocks next
                    to wide gaps is what a real grid looks like

   So this version defines the network as a set of irregular line segments rather
   than a lattice, keeps East London's actual character (a long coastal grid with
   diagonals cutting through), and draws building footprints faintly inside the
   larger blocks.

   Still zero depth cues: flat fills, flat white roads, no shadows. All the
   layering in the composition comes from the sheet above it.
   ========================================================================= */

const GogoHeroMap = (() => {
  /* ── arterials ───────────────────────────────────────────────────────────
     Three, at angles, so the eye gets a dominant direction and the grid never
     lines up perfectly with the viewport. */
  const ARTERIAL = [
    [0.0, 31.35, 83.6, 29.83],
    [83.6, 29.83, 154.0, 28.64],
    [154.0, 28.64, 220.0, 27.06],
    [24.2, 0.0, 34.1, 22.44],
    [34.1, 22.44, 41.8, 40.92],
    [41.8, 40.92, 49.5, 66.0],
  ];

  /* ── second tier ─────────────────────────────────────────────────────────
     Unevenly spaced on purpose: gaps of 9, 6, 14 and 4 units. Even spacing is
     what made v1 look like graph paper. */
  const SECONDARY = [
    [0.0, 8.58, 101.2, 7.66], [101.2, 7.66, 220.0, 6.2],
    [0.0, 19.47, 121.0, 18.35], [121.0, 18.35, 220.0, 17.29],
    [0.0, 41.58, 90.2, 40.79], [90.2, 40.79, 220.0, 39.34],
    [0.0, 51.81, 136.4, 50.95], [136.4, 50.95, 220.0, 50.03],
    [0.0, 60.06, 220.0, 59.14],
    [72.6, 0.0, 80.3, 18.35], [80.3, 18.35, 88.0, 29.83],
    [114.4, 6.2, 121.0, 28.64], [121.0, 28.64, 127.6, 40.79],
    [171.6, 17.29, 178.2, 39.34], [178.2, 39.34, 184.8, 59.14],
    [200.2, 0.0, 205.7, 27.06], [205.7, 27.06, 211.2, 50.03],
  ];

  /* ── side streets ────────────────────────────────────────────────────────
     Short runs that fill in detail without closing every block. Several stop
     mid-air, which is exactly what real streets do at a park or a yard. */
  const SIDE = [
    [4.4, 13.46, 52.8, 12.94], [59.4, 13.33, 72.6, 13.07],
    [94.6, 12.67, 114.4, 12.28], [125.4, 12.14, 162.8, 11.35], [171.6, 11.22, 200.2, 10.69],
    [8.8, 24.29, 39.6, 23.76], [50.6, 23.63, 80.3, 23.1],
    [92.4, 22.84, 114.4, 22.44], [129.8, 22.18, 171.6, 21.38],
    [184.8, 21.12, 205.7, 20.72],
    [6.6, 35.9, 41.8, 35.38], [52.8, 35.24, 90.2, 34.72],
    [99.0, 34.58, 121.0, 34.19], [134.2, 33.92, 178.2, 33.13],
    [13.2, 46.33, 49.5, 45.8], [59.4, 45.54, 90.2, 45.01],
    [101.2, 44.75, 136.4, 44.09], [145.2, 43.82, 178.2, 43.16],
    [187.0, 42.9, 220.0, 42.24],
    [17.6, 55.84, 49.5, 55.31], [61.6, 55.04, 99.0, 54.38],
    [110.0, 54.12, 136.4, 53.59], [149.6, 53.2, 184.8, 52.54],
  ];

  /* ── the diagonals that make it a city and not a spreadsheet ────────────── */
  const DIAG = [
    [0.0, 46.2, 35.2, 35.24], [35.2, 35.24, 72.6, 23.63],
    [147.4, 11.88, 184.8, 21.12],
    [90.2, 40.79, 121.0, 51.48],
    [49.5, 45.8, 80.3, 55.04],
    [121.0, 28.64, 171.6, 17.29],
  ];

  /* ── parks: irregular, not tidy rectangles ──────────────────────────────── */
  const PARKS = [
    { d: "M162.8 39.6 L193.6 38.61 L196.9 46.2 L176.0 47.85 L160.6 44.88 Z" },
    { d: "M6.6 10.57.8.0 L9.9 161.48 L4.8 184.8 L3.63 187.44 Z" },
    { d: "M66.0 1.65 L105.6 1.32 L107.8 5.61 L68.2 6.2 Z" },
    { d: "M123.2 58.08 L154.0 57.42 L156.2 63.36 L125.4 63.69 Z" },
  ];

  /* ── building footprints ─────────────────────────────────────────────────
     Faint insets inside the bigger blocks. This is the detail that turns a
     road diagram into a map: you read "buildings" without being able to point
     at any one of them. */
  const BUILDINGS = [
    [52.8, 8.58, 15.4, 3.56], [107.8, 7.79, 12.1, 4.09], [132.0, 6.86, 17.6, 3.83],
    [11.0, 20.2, 19.8, 3.04], [57.2, 24.16, 17.6, 4.22], [96.8, 23.36, 13.2, 4.75],
    [136.4, 22.57, 20.9, 5.02], [189.2, 21.65, 11.0, 3.56],
    [8.8, 32.08, 22.0, 2.77], [44.0, 35.77, 15.4, 3.96], [94.6, 30.62, 14.3, 3.43],
    [103.4, 41.45, 17.6, 2.38], [140.8, 41.18, 22.0, 3.17], [189.2, 40.13, 15.4, 2.24],
    [19.8, 46.99, 17.6, 4.09], [57.2, 46.46, 14.3, 3.56], [103.4, 45.28, 19.8, 2.77],
    [151.8, 44.35, 17.6, 3.7], [193.6, 43.69, 13.2, 2.9],
    [22.0, 52.54, 16.5, 2.64], [66.0, 55.57, 19.8, 2.11], [114.4, 54.78, 15.4, 2.51],
    [158.4, 53.59, 17.6, 3.04],
  ];

  /* ── labels: sparse, and only on the tiers that deserve one ─────────────── */
  const LABELS = [
    /* Labels are placed across the whole 220x66 world, not just the middle.
       When the viewBox was square-cropped only the centre survived, so six
       labels collapsed to one on a phone. Sixteen spread across the grid means
       whichever window is shown, several streets are named — which is what makes
       it read as a map rather than a texture.

       Font sizes are in viewBox units. The svg renders ~5.75x wider than the
       viewBox on desktop, so 1.5 is about 8.6px there and a little larger on a
       phone where the scale is smaller. */
    { x: 6.0,   y: 30.0, text: "Oxford St",   r: -2.2,  s: 1.5 },
    { x: 96.0,  y: 9.0,  text: "Union Ave",    r: 87,    s: 1.4 },
    { x: 140.0, y: 40.2, text: "Fleet St",     r: -3.4,  s: 1.5 },
    { x: 182.0, y: 50.4, text: "Beacon Rd",    r: -3.2,  s: 1.5 },
    { x: 18.0,  y: 60.0, text: "Strand St",    r: -1.6,  s: 1.4 },
    { x: 48.0,  y: 49.2, text: "Nahoon Dr",    r: 87,    s: 1.3 },
    { x: 26.0,  y: 8.4,  text: "Union St",     r: 2.0,   s: 1.3 },
    { x: 62.0,  y: 19.4, text: "Church St",    r: -1.8,  s: 1.3 },
    { x: 104.0, y: 22.6, text: "Grey Rd",      r: -2.6,  s: 1.2 },
    { x: 12.0,  y: 41.4, text: "Belgravia",    r: 1.6,   s: 1.2 },
    { x: 74.0,  y: 51.6, text: "Border Rd",    r: -2.0,  s: 1.2 },
    { x: 118.0, y: 60.4, text: "Vincent",      r: 2.2,   s: 1.2 },
    { x: 156.0, y: 18.0, text: "Selborne",     r: -2.4,  s: 1.2 },
    { x: 198.0, y: 30.0, text: "Essex St",     r: 3.0,   s: 1.2 },
    { x: 86.0,  y: 41.0, text: "Kings Rd",     r: 88,    s: 1.2 },
    { x: 168.0, y: 59.0, text: "Lukin Rd",     r: -1.4,  s: 1.2 },
  ];

  const CARS = [
    { x: 53.9, y: 30.3 }, { x: 138.6, y: 29.0 }, { x: 91.3, y: 17.9 },
    { x: 32.1, y: 41.7 }, { x: 174.9, y: 39.6 },
  ];

  /* every street segment, collected for the car animation. Cars drive along
       these exact lines, so motion follows the road grid instead of drifting
       across blocks. */
    const CAR_SEGMENTS = [];
    const addSegs = (list) => list.forEach(([x1, y1, x2, y2], i) => {
      if (Math.hypot(x2 - x1, y2 - y1) > 6) CAR_SEGMENTS.push({ x1, y1, x2, y2 });
    });
    addSegs(ARTERIAL); addSegs(SECONDARY); addSegs(SIDE); addSegs(DIAG);

  const el = (t, cls) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", t);
    if (cls) n.setAttribute("class", cls);
    return n;
  };

  function build(opts = {}) {
    /* 0-220 by 0-220: at 1264px wide that is 5.7px per unit. The earlier 0-100
       viewBox put 12.6px on every unit, which is why the streets looked like
       motorways and the labels were the size of headings. */
    /* The world is authored 220 x 66 and stays that way. What changes per screen
       is the WINDOW into it — the viewBox — because a fixed window crops badly.

       The original bug: viewBox 220x66 is 3.33:1. On a phone the box is ~390x353,
       barely 1.1:1, so preserveAspectRatio:slice scaled to fill the height and
       threw away roughly 70% of the width. Only the centre strip survived, which
       is why one street name was visible.

       Sizing the viewBox to the box's own aspect fixes the crop, and because the
       phone's window is narrower it also zooms IN — fewer metres of city, more
       streets and labels per screen. Desktop keeps the same wide view as before. */
    const host = opts.host || null;
    const hostW = (host && host.clientWidth) || 390;
    const hostH = (host && host.clientHeight) || 353;
    const aspect = hostW / hostH;
    const WORLD_W = 220, WORLD_H = 66;
    /* the width of world shown, chosen so the window matches the box shape */
    let width = Math.min(WORLD_W, Math.round(WORLD_H * aspect));
    width = Math.max(46, width);
    const height = WORLD_H;
    /* centre the window on the part of the world with the most street detail */
    const dot = { x: width * 0.55, y: height * 0.5 };
    const svg = el("svg");
    /* window offset: centre it in the authored world */
    const vbX = Math.max(0, Math.round((WORLD_W - width) / 2));
    svg.setAttribute("viewBox", `${vbX} 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("ghm");

    const base = el("rect");
    base.setAttribute("width", width);
    base.setAttribute("height", height);
    base.setAttribute("class", "ghm-ground");
    svg.appendChild(base);

    PARKS.forEach(({ d }) => {
      const p = el("path");
      p.setAttribute("d", d);
      p.setAttribute("class", "ghm-park");
      svg.appendChild(p);
    });

    /* building footprints sit UNDER the roads, so roads cut over them cleanly */
    const bgroup = el("g", "ghm-buildings");
    BUILDINGS.forEach(([x, y, w, h]) => {
      const r = el("rect");
      r.setAttribute("x", x); r.setAttribute("y", y);
      r.setAttribute("width", w); r.setAttribute("height", h);
      r.setAttribute("rx", 0.8);
      bgroup.appendChild(r);
    });
    svg.appendChild(bgroup);

    const draw = (list, cls) => {
      const g = el("g", cls);
      list.forEach(([x1, y1, x2, y2]) => {
        const l = el("line");
        l.setAttribute("x1", x1); l.setAttribute("y1", y1);
        l.setAttribute("x2", x2); l.setAttribute("y2", y2);
        g.appendChild(l);
      });
      svg.appendChild(g);
    };

    /* order matters: narrow first so wide roads paint over them at junctions,
       which is what stops the intersections looking like a plaid weave */
    draw(SIDE, "ghm-side");
    draw(DIAG, "ghm-side");
    draw(SECONDARY, "ghm-minor");
    draw(ARTERIAL, "ghm-major");

    LABELS.forEach(({ x, y, text, r, s }) => {
      const t = el("text", "ghm-label");
      t.setAttribute("x", x);
      t.setAttribute("y", y);
      t.setAttribute("transform", `rotate(${r} ${x} ${y})`);
      t.setAttribute("font-size", s);
      t.textContent = text;
      svg.appendChild(t);
    });

    /* ── cars: these drive ────────────────────────────────────────────────
       Built here so they share CAR_SEGMENTS with the street grid. Each pin is
       a disc plus a rotated saloon glyph; the loop below moves them.

       The pin count is derived from how much world is on screen: a zoomed-in
       phone window shows a small slice, so 5 pins would look sparse and 12
       would look like a traffic jam. */
    const carLayer = el("g", "ghm-cars");
    svg.appendChild(carLayer);

    const CAR_COUNT = Math.max(4, Math.min(9, Math.round(width / 26)));
    const carState = [];
    for (let i = 0; i < CAR_COUNT; i++) {
      const g = el("g", "ghm-car");
      const disc = el("circle");
      disc.setAttribute("r", 4.6);
      g.appendChild(disc);
      const glyph = el("path");
      glyph.setAttribute("d", "M-2.2 0.85h4.4M-2.1 0.85v-1.05a1.15 1.15 0 0 1 1.15-1.15h1.05a1.15 1.15 0 0 1 1.15 1.15v1.05M-1.25 0.85v0.85M1.25 0.85v0.85");
      glyph.setAttribute("class", "ghm-car-glyph");
      g.appendChild(glyph);
      carLayer.appendChild(g);
      carState.push({ g, seg: null, t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1,
                      speed: 9 + Math.random() * 12 });
    }

    /* the window we are showing, so cars only animate where they can be seen */
    const viewX0 = vbX, viewX1 = vbX + width;

    const segLen = (sg) => Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1) || 1;

    const inView = (sg) =>
      (sg.x1 >= viewX0 - 12 && sg.x1 <= viewX1 + 12) ||
      (sg.x2 >= viewX0 - 12 && sg.x2 <= viewX1 + 12);

    const pickSeg = (nearX, nearY, exclude) => {
      const pool = CAR_SEGMENTS.filter(sg => inView(sg) && sg !== exclude);
      const list = pool.length ? pool : CAR_SEGMENTS;
      if (nearX == null) return list[Math.floor(Math.random() * list.length)];
      let best = list[0], bestD = Infinity;
      for (const sg of list) {
        for (const [px, py] of [[sg.x1, sg.y1], [sg.x2, sg.y2]]) {
          const d = Math.hypot(px - nearX, py - nearY);
          if (d < bestD) { bestD = d; best = sg; }
        }
      }
      return best;
    };

    const assignCar = (car) => {
      const old = car.seg;
      if (!old) {
        car.seg = pickSeg();
        car.t = Math.random();
        return;
      }
      /* continue from the end we reached, onto a road that touches it, so the
         hand-off reads as turning a corner rather than teleporting */
      const ex = car.dir > 0 ? old.x2 : old.x1;
      const ey = car.dir > 0 ? old.y2 : old.y1;
      const next = pickSeg(ex, ey, old);
      car.seg = next;
      const d1 = Math.hypot(next.x1 - ex, next.y1 - ey);
      const d2 = Math.hypot(next.x2 - ex, next.y2 - ey);
      if (d1 <= d2) { car.t = 0; car.dir = 1; }
      else { car.t = 1; car.dir = -1; }
    };

    const placeCar = (car) => {
      const sg = car.seg;
      const x = sg.x1 + (sg.x2 - sg.x1) * car.t;
      const y = sg.y1 + (sg.y2 - sg.y1) * car.t;
      const ang = Math.atan2(sg.y2 - sg.y1, sg.x2 - sg.x1) * 180 / Math.PI;
      const facing = car.dir > 0 ? ang : ang + 180;
      car.g.setAttribute("transform",
        `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${facing.toFixed(1)})`);
    };

    carState.forEach((car) => { assignCar(car); placeCar(car); });

    /* ── the loop ──────────────────────────────────────────────────────────
       One rAF for every car, one transform write each. Nothing here triggers
       layout. Pauses on tab hide; parks entirely under reduced-motion. */
    const reduced = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduced && CAR_SEGMENTS.length) {
      let last = 0, raf = 0, live = true;

      const tick = (now) => {
        if (!live) return;
        if (!last) last = now;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        for (const car of carState) {
          const len = segLen(car.seg);
          car.t += car.dir * (car.speed * dt) / len;
          if (car.t > 1 || car.t < 0) {
            car.t = car.t > 1 ? 1 : 0;
            assignCar(car);
          }
          placeCar(car);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          live = false;
          cancelAnimationFrame(raf);
        } else if (!live) {
          live = true;
          last = 0;
          raf = requestAnimationFrame(tick);
        }
      });
    }

    /* ── points of interest ────────────────────────────────────────────────
       Two landmarks and a station. Without these the map is a pattern; with
       them the eye has somewhere to land and it reads as a place. Three only —
       more would compete with the car pins. */
    const POIS = [
      { x: 34, y: 30.5, icon: "pin" },
      { x: 72, y: 55, icon: "flag" },
      { x: 55, y: 76, icon: "stop" },
    ];
    const POI_PATHS = {
      pin:  "M0 -3.2a3.2 3.2 0 0 1 3.2 3.2c0 2.4-3.2 6-3.2 6s-3.2-3.6-3.2-6A3.2 3.2 0 0 1 0-3.2Zm0 4.6a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Z",
      flag: "M-2.2 4V-4M-2.2 -3.6h7.4l-2 2.6 2 2.6h-7.4",
      stop: "M-3.6 -3h7.2v6h-7.2Zm1.6 6v2.4M2 3v2.4",

    };
    POIS.forEach(({ x, y, icon }) => {
      const g = el("g", "ghm-poi");
      g.setAttribute("transform", `translate(${x} ${y})`);
      const c = el("circle");
      c.setAttribute("r", 3.4);
      g.appendChild(c);
      const pth = el("path");
      pth.setAttribute("d", POI_PATHS[icon]);
      g.appendChild(pth);
      svg.appendChild(g);
    });

    const you = el("g", "ghm-you");
    you.setAttribute("transform", `translate(${dot.x} ${dot.y})`);
    const halo = el("circle");
    halo.setAttribute("r", 16.3);
    halo.setAttribute("class", "ghm-halo");
    you.appendChild(halo);
    const ring = el("circle");
    ring.setAttribute("r", 7.7);
    ring.setAttribute("class", "ghm-dot-ring");
    you.appendChild(ring);
    const core = el("circle");
    core.setAttribute("r", 5.2);
    core.setAttribute("class", "ghm-dot");
    you.appendChild(core);
    svg.appendChild(you);

    return svg;
  }

  function mount(host, opts) {
    if (!host) return null;
    host.innerHTML = "";
    try {
      const svg = build(opts);
      host.appendChild(svg);
      return svg;
    } catch (e) {
      host.style.background = "var(--gogo-map-ground, #EAEAE6)";
      return null;
    }
  }

  return { boot: mount, build, mount };
})();

if (typeof window !== "undefined") window.GogoHeroMap = GogoHeroMap;
