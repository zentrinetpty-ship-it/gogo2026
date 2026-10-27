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
    [0, 47.5, 38, 45.2],
    [38, 45.2, 70, 43.4],
    [70, 43.4, 100, 41.0],
    [11, 0, 15.5, 34],
    [15.5, 34, 19, 62],
    [19, 62, 22.5, 100],
  ];

  /* ── second tier ─────────────────────────────────────────────────────────
     Unevenly spaced on purpose: gaps of 9, 6, 14 and 4 units. Even spacing is
     what made v1 look like graph paper. */
  const SECONDARY = [
    [0, 13, 46, 11.6], [46, 11.6, 100, 9.4],
    [0, 29.5, 55, 27.8], [55, 27.8, 100, 26.2],
    [0, 63, 41, 61.8], [41, 61.8, 100, 59.6],
    [0, 78.5, 62, 77.2], [62, 77.2, 100, 75.8],
    [0, 91, 100, 89.6],
    [33, 0, 36.5, 27.8], [36.5, 27.8, 40, 45.2],
    [52, 9.4, 55, 43.4], [55, 43.4, 58, 61.8],
    [78, 26.2, 81, 59.6], [81, 59.6, 84, 89.6],
    [91, 0, 93.5, 41], [93.5, 41, 96, 75.8],
  ];

  /* ── side streets ────────────────────────────────────────────────────────
     Short runs that fill in detail without closing every block. Several stop
     mid-air, which is exactly what real streets do at a park or a yard. */
  const SIDE = [
    [2, 20.4, 24, 19.6], [27, 20.2, 33, 19.8],
    [43, 19.2, 52, 18.6], [57, 18.4, 74, 17.2], [78, 17.0, 91, 16.2],
    [4, 36.8, 18, 36.0], [23, 35.8, 36.5, 35.0],
    [42, 34.6, 52, 34.0], [59, 33.6, 78, 32.4],
    [84, 32.0, 93.5, 31.4],
    [3, 54.4, 19, 53.6], [24, 53.4, 41, 52.6],
    [45, 52.4, 55, 51.8], [61, 51.4, 81, 50.2],
    [6, 70.2, 22.5, 69.4], [27, 69.0, 41, 68.2],
    [46, 67.8, 62, 66.8], [66, 66.4, 81, 65.4],
    [85, 65.0, 100, 64.0],
    [8, 84.6, 22.5, 83.8], [28, 83.4, 45, 82.4],
    [50, 82.0, 62, 81.2], [68, 80.6, 84, 79.6],
  ];

  /* ── the diagonals that make it a city and not a spreadsheet ────────────── */
  const DIAG = [
    [0, 70, 16, 53.4], [16, 53.4, 33, 35.8],
    [67, 18.0, 84, 32.0],
    [41, 61.8, 55, 78.0],
    [22.5, 69.4, 36.5, 83.4],
    [55, 43.4, 78, 26.2],
  ];

  /* ── parks: irregular, not tidy rectangles ──────────────────────────────── */
  const PARKS = [
    { d: "M74 60 L88 58.5 L89.5 70 L80 72.5 L73 68 Z" },
    { d: "M3 74 L15 73.4 L16 84 L5.5 85.2 Z" },
    { d: "M30 2.5 L48 2 L49 8.5 L31 9.4 Z" },
    { d: "M56 88 L70 87 L71 96 L57 96.5 Z" },
  ];

  /* ── building footprints ─────────────────────────────────────────────────
     Faint insets inside the bigger blocks. This is the detail that turns a
     road diagram into a map: you read "buildings" without being able to point
     at any one of them. */
  const BUILDINGS = [
    [24, 13, 7, 5.4], [49, 11.8, 5.5, 6.2], [60, 10.4, 8, 5.8],
    [5, 30.6, 9, 4.6], [26, 36.6, 8, 6.4], [44, 35.4, 6, 7.2],
    [62, 34.2, 9.5, 7.6], [86, 32.8, 5, 5.4],
    [4, 48.6, 10, 4.2], [20, 54.2, 7, 6.0], [43, 46.4, 6.5, 5.2],
    [47, 62.8, 8, 3.6], [64, 62.4, 10, 4.8], [86, 60.8, 7, 3.4],
    [9, 71.2, 8, 6.2], [26, 70.4, 6.5, 5.4], [47, 68.6, 9, 4.2],
    [69, 67.2, 8, 5.6], [88, 66.2, 6, 4.4],
    [10, 79.6, 7.5, 4.0], [30, 84.2, 9, 3.2], [52, 83.0, 7, 3.8],
    [72, 81.2, 8, 4.6],
  ];

  /* ── labels: sparse, and only on the tiers that deserve one ─────────────── */
  const LABELS = [
    { x: 3.5, y: 45.4, text: "Oxford St", r: -2.2, s: 1.85 },
    { x: 44, y: 12.6, text: "Union Ave", r: 87, s: 1.6 },
    { x: 63, y: 60.8, text: "Fleet St", r: -3.4, s: 1.6 },
    { x: 82.5, y: 76.6, text: "Beacon Rd", r: -3.2, s: 1.5 },
    { x: 9, y: 90.4, text: "Strand St", r: -1.6, s: 1.45 },
    { x: 22.6, y: 74, text: "Nahoon Dr", r: 87, s: 1.45 },
  ];

  const CARS = [
    { x: 24.5, y: 45.9 }, { x: 63, y: 43.9 }, { x: 41.5, y: 27.2 },
    { x: 14.6, y: 63.2 }, { x: 79.5, y: 60.0 },
  ];

  const el = (t, cls) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", t);
    if (cls) n.setAttribute("class", cls);
    return n;
  };

  function build(opts = {}) {
    const { width = 100, height = 100, dot = { x: 58, y: 46 } } = opts;
    const svg = el("svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
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
      r.setAttribute("rx", 0.35);
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

    CARS.forEach(({ x, y }, i) => {
      const g = el("g", "ghm-car");
      g.setAttribute("transform", `translate(${x} ${y})`);
      g.style.animationDelay = `${i * 0.6}s`;
      const c = el("circle");
      c.setAttribute("r", 2.1);
      g.appendChild(c);
      const car = el("path");
      car.setAttribute("d", "M-1.05 0.35h2.1M-0.85 0.35v-0.95a0.55 0.55 0 0 1 0.55-0.55h0.6a0.55 0.55 0 0 1 0.55 0.55v0.95M-0.6 0.35v0.4M0.6 0.35v0.4");
      car.setAttribute("class", "ghm-car-glyph");
      g.appendChild(car);
      svg.appendChild(g);
    });

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
      pin:  "M0 -1.05a1.05 1.05 0 0 1 1.05 1.05c0 .78 -1.05 2.1 -1.05 2.1s-1.05-1.32-1.05-2.1A1.05 1.05 0 0 1 0 -1.05Zm0 1.55a.5 .5 0 1 1 0 -1 .5 .5 0 0 1 0 1Z",
      flag: "M-0.55 1.2V-1.2M-0.55 -1.05h1.9l-0.5 .8 .5 .8H-0.55",
      stop: "M-1 -.9h2v1.8h-2Zm.45 1.8v.75M.55 .9v.75",
    };
    POIS.forEach(({ x, y, icon }) => {
      const g = el("g", "ghm-poi");
      g.setAttribute("transform", `translate(${x} ${y})`);
      const c = el("circle");
      c.setAttribute("r", 1.55);
      g.appendChild(c);
      const pth = el("path");
      pth.setAttribute("d", POI_PATHS[icon]);
      g.appendChild(pth);
      svg.appendChild(g);
    });

    const you = el("g", "ghm-you");
    you.setAttribute("transform", `translate(${dot.x} ${dot.y})`);
    const halo = el("circle");
    halo.setAttribute("r", 7.4);
    halo.setAttribute("class", "ghm-halo");
    you.appendChild(halo);
    const ring = el("circle");
    ring.setAttribute("r", 3.5);
    ring.setAttribute("class", "ghm-dot-ring");
    you.appendChild(ring);
    const core = el("circle");
    core.setAttribute("r", 2.35);
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
