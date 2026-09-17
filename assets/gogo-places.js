/* =========================================================================
   GOGO — South African places
   Every province and the towns people actually travel to, with the old and
   new names both searchable (Gqeberha ↔ Port Elizabeth, Komani ↔ Queenstown).
   Drives the typeable "Pick me up" field and the searchable "Going to" picker.
   ========================================================================= */

const GOGOPlaces = (() => {
  const SA = [
    { p: "Eastern Cape", c: "EC", towns: ["Mthatha", "East London", "Gqeberha", "Komani", "Butterworth", "Idutywa", "Mount Frere", "Aliwal North", "Makhanda", "Port St Johns", "Coffee Bay", "Hogsback", "Graaff-Reinet"] },
    { p: "Western Cape", c: "WC", towns: ["Cape Town", "George", "Knysna", "Mossel Bay", "Plettenberg Bay", "Stellenbosch", "Paarl", "Oudtshoorn", "Hermanus"] },
    { p: "KwaZulu-Natal", c: "KZN", towns: ["Durban", "Pietermaritzburg", "Richards Bay", "Ballito", "Umhlanga", "Margate", "Port Shepstone", "Newcastle", "Ladysmith", "Kokstad"] },
    { p: "Gauteng", c: "GP", towns: ["Johannesburg", "Pretoria", "Soweto", "Midrand", "Centurion", "Sandton", "Kempton Park", "OR Tambo Airport"] },
    { p: "Free State", c: "FS", towns: ["Bloemfontein", "Welkom", "Bethlehem", "Harrismith"] },
    { p: "Mpumalanga", c: "MP", towns: ["Mbombela", "eMalahleni", "Middelburg", "Secunda", "Sabie", "Graskop"] },
    { p: "Limpopo", c: "LP", towns: ["Polokwane", "Tzaneen", "Hoedspruit", "Bela-Bela", "Mokopane"] },
    { p: "North West", c: "NW", towns: ["Rustenburg", "Mahikeng", "Potchefstroom", "Hartbeespoort", "Sun City"] },
    { p: "Northern Cape", c: "NC", towns: ["Kimberley", "Upington", "Springbok", "Kuruman"] },
  ];

  /* names people still type */
  const ALIAS = {
    "port elizabeth": "Gqeberha",
    "queenstown": "Komani",
    "grahamstown": "Makhanda",
    "nelspruit": "Mbombela",
    "witbank": "eMalahleni",
    "pietersburg": "Polokwane",
    "dutywa": "Idutywa",
    "umtata": "Mthatha",
    "plet": "Plettenberg Bay",
    "pe": "Gqeberha",
    "joburg": "Johannesburg",
    "jhb": "Johannesburg",
    "ct": "Cape Town",
    "durbs": "Durban",
    "pmb": "Pietermaritzburg",
    "ort": "OR Tambo Airport",
    "ortia": "OR Tambo Airport",
    "east london cbd": "East London",
    "uitkyk": "East London",
  };

  const INDEX = (() => {
    const rows = [];
    SA.forEach(prov => prov.towns.forEach(t => rows.push({ city: t, province: prov.p, code: prov.c })));
    return rows;
  })();
  const byCity = {};
  INDEX.forEach(r => { byCity[r.city.toLowerCase()] = r; });

  const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "");

  /** the canonical city for whatever the user typed, or null */
  function match(text) {
    const n = norm(text);
    if (!n) return null;
    if (byCity[n]) return byCity[n];
    if (ALIAS[n]) return byCity[ALIAS[n].toLowerCase()] || null;
    const starts = INDEX.filter(r => r.city.toLowerCase().startsWith(n));
    if (starts.length === 1) return starts[0];
    const incl = INDEX.filter(r => r.city.toLowerCase().includes(n));
    if (incl.length === 1) return incl[0];
    return null;
  }

  const provinceOf = text => (match(text) || {}).province || null;
  const same = (a, b) => { const x = match(a), y = match(b); return !!(x && y && x.city === y.city); };
  const provinceByName = text => {
    const n = norm(text);
    return SA.find(p => norm(p.p) === n || norm(p.c) === n || norm(p.p).startsWith(n)) || null;
  };

  /** ranked search across towns, provinces and aliases */
  function search(q, limit = 8) {
    const n = norm(q);
    if (!n) {
      /* nothing typed: the towns GOGO's Eastern Cape passengers travel to most */
      return ["Mthatha", "Queenstown", "Butterworth", "Idutywa", "Cala", "Ngcobo", "Gqeberha", "Johannesburg", "Cape Town", "Durban"]
        .map(c => byCity[c.toLowerCase()]).filter(Boolean).slice(0, limit);
    }
    const out = [], seen = new Set();
    const push = r => { if (r && !seen.has(r.city)) { seen.add(r.city); out.push(r); } };
    /* a whole province */
    const prov = provinceByName(n);
    if (prov) prov.towns.forEach(t => push(byCity[t.toLowerCase()]));
    /* towns whose name matches */
    INDEX.filter(r => r.city.toLowerCase().startsWith(n)).forEach(push);
    INDEX.filter(r => r.city.toLowerCase().includes(n)).forEach(push);
    /* old names */
    Object.keys(ALIAS).filter(a => a.startsWith(n) || a.includes(n)).forEach(a => push(byCity[ALIAS[a].toLowerCase()]));
    return out.slice(0, limit);
  }

  /* ── the typeable field widget ───────────────────────────────────────── */
  const OPEN = [];                      /* so two fields never show panels at once */
  function closeOthers(me) { OPEN.forEach(o => { if (o !== me) o(); }); }
  function attach(sel, kind, opts = {}) {
    const input = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!input || input.dataset.acReady) return;
    input.dataset.acReady = "1";
    /* the fields carry real autofill hints (street-address, address-level2),
       so leave autocomplete alone and only quiet the spellchecker */
    input.setAttribute("spellcheck", "false");
    if (kind === "city") input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");

    const field = input.closest(".g-field, .g-bk-inwrap") || input.parentElement;
    field.style.position = "relative";
    const panel = document.createElement("div");
    panel.className = "g-ac";
    panel.hidden = true;
    panel.setAttribute("role", "listbox");
    field.appendChild(panel);

    let items = [], cursor = -1, open = false, expanded = null;

    function close() { open = false; panel.hidden = true; cursor = -1; input.setAttribute("aria-expanded", "false"); }
    function place() {
      /* anchor to the input itself: the field also holds a label and a hint,
         and top:100% of the field would drop the panel over the wrong row */
      const fTop = field.getBoundingClientRect().top;
      const iBox = input.getBoundingClientRect();
      panel.style.top = Math.max(0, (iBox.bottom - fTop) + 5) + "px";
      panel.style.left = Math.max(0, (iBox.left - field.getBoundingClientRect().left)) + "px";
      panel.style.right = "auto";
      panel.style.width = iBox.width + "px";
    }
    function show() {
      closeOthers(close);
      open = true;
      place();
      panel.hidden = false;
      input.setAttribute("aria-expanded", "true");
      /* the first measurement can land before layout settles (webfont, hero map),
         so re-anchor on the next frame and whenever the field changes size */
      requestAnimationFrame(place);
      if (open) setTimeout(place, 120);
    }

    /* ── step one: the provinces, then their towns in the same menu ────── */
    const I_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
    const I_CHEV = '<svg class="g-ac-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    const NAV = ".g-ac-item, .g-ac-prow, .g-ac-cbtn";
    const navs = () => Array.prototype.slice.call(panel.querySelectorAll(NAV));

    function paintProvinces() {
      panel.classList.add("g-ac-two");
      /* highlight the province we are already travelling in */
      const mine = provinceOf(input.value) || (provinceByName(input.value) || {}).p || null;
      panel.innerHTML = SA.map(p => {
        const on = expanded === p.p;
        return '<button type="button" class="g-ac-prow' + (on ? " on" : "") + (mine === p.p ? " mine" : "") +
            '" data-prov="' + esc(p.p) + '" aria-expanded="' + on + '">' +
            '<span class="g-ac-plabel">' + I_PIN + '</span><span class="g-ac-pname">' + esc(p.p) + '</span>' + I_CHEV +
          '</button>' +
          (on ? '<div class="g-ac-grid">' + p.towns.map(t =>
              '<button type="button" class="g-ac-cbtn' + (t === input.value ? " on" : "") + '" data-v="' + esc(t) + '">' + esc(t) + '</button>').join("") + '</div>' : "");
      }).join("");
      wire();
      show();
    }

    function paintResults() {
      const q = input.value;
      items = kind === "city" ? search(q, 9)
        : (opts.list || []).filter(v => !q || norm(v).includes(norm(q))).slice(0, 8).map(v => ({ city: v, province: "", code: "" }));
      panel.classList.remove("g-ac-two");
      if (!items.length) {
        /* A pickup field is free text. With nothing to match on there is nothing
           to offer, and a hint card would sit over the words being typed, so stay
           out of the way entirely. The town picker keeps its own hint, because
           there an empty result is worth explaining. */
        if (kind !== "city") { close(); return; }
        panel.innerHTML = '<div class="g-ac-empty">No town matches. Try a province, or the nearest big town.</div>';
        show(); return;
      }
      /* group towns by province, keeping search rank order */
      const groups = [];
      items.forEach(r => {
        const g = groups.find(x => x.p === r.province);
        if (g) g.rows.push(r); else groups.push({ p: r.province, rows: [r] });
      });
      panel.innerHTML = groups.map(g =>
        (g.p ? '<div class="g-ac-group">' + esc(g.p) + '</div>' : "") +
        g.rows.map(r => '<button type="button" class="g-ac-item" data-v="' + esc(r.city) + '">' +
            '<span class="g-ac-dot" aria-hidden></span><span class="g-ac-city">' + esc(r.city) + '</span>' +
            (r.code ? '<span class="g-ac-prov">' + esc(r.code) + '</span>' : "") +
          '</button>').join("")).join("");
      if (kind === "city") {
        const pv = provinceByName(q);
        if (pv) panel.insertAdjacentHTML("afterbegin", '<button type="button" class="g-ac-item g-ac-any" data-v="' + esc(pv.p) + '">' +
          '<span class="g-ac-dot" aria-hidden></span><span class="g-ac-city">Anywhere in ' + esc(pv.p) + '</span><span class="g-ac-prov">province</span></button>');
      }
      wire();
      show();
    }

    /* typed text searches everything; an empty field opens the provinces */
    function paint() {
      if (kind === "city" && !norm(input.value)) { expanded = null; return paintProvinces(); }
      return paintResults();
    }

    /* clicks, cursor and keyboard, wired the same way for both views */
    function wire() {
      navs().forEach(b => {
        b.onmousedown = e => e.preventDefault();
        b.onclick = () => {
          if (b.dataset.prov) {
            expanded = expanded === b.dataset.prov ? null : b.dataset.prov;
            paintProvinces();
            const row = panel.querySelector(".g-ac-prow.on");
            if (row) row.scrollIntoView({ block: "nearest" });
          } else pick(b.dataset.v);
        };
        b.onmouseenter = () => { cursor = navs().indexOf(b); highlight(); };
      });
      highlight();
    }

    function highlight() {
      navs().forEach((b, i) => b.classList.toggle("is-cursor", i === cursor));
      if (cursor >= 0) { const el = navs()[cursor]; if (el) el.scrollIntoView({ block: "nearest" }); }
    }

    function pick(v) {
      input.value = v;
      close();
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (opts.onPick) opts.onPick(v);
      input.blur();
    }

    OPEN.push(close);
    try {
      if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (open) place(); }); ro.observe(field); ro.observe(input); }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (open) place(); });
    } catch (e) { /* older browsers: the frame-later pass covers it */ }
    window.addEventListener("resize", () => { if (open) place(); });
    window.addEventListener("scroll", () => { if (open) place(); }, true);
    input.addEventListener("input", () => { cursor = -1; paint(); });
    input.addEventListener("focus", () => {
      /* the picker always opens on the provinces first */
      if (kind === "city") { expanded = provinceOf(input.value); paintProvinces(); return; }
      /* a pickup field starts empty and must stay clean: nothing opens until
         there is something to match on, and it only ever matches real towns */
      if (!input.value.trim()) { close(); return; }
      paint();
    });
    input.addEventListener("blur", () => setTimeout(close, 140));
    input.addEventListener("keydown", e => {
      const els = navs();
      if (e.key === "ArrowDown") { if (!open) paint(); else { cursor = Math.min(cursor + 1, els.length - 1); highlight(); } e.preventDefault(); }
      else if (e.key === "ArrowUp") { cursor = Math.max(cursor - 1, 0); highlight(); e.preventDefault(); }
      else if (e.key === "Enter") {
        if (open && cursor >= 0 && els[cursor]) {
          e.preventDefault();
          const b = els[cursor];
          if (b.dataset.prov) { expanded = expanded === b.dataset.prov ? null : b.dataset.prov; paintProvinces(); }
          else pick(b.dataset.v);
        } else if (open && els.length === 1) { e.preventDefault(); pick(els[0].dataset.v); }
      }
      else if (e.key === "Escape") { close(); }
      else if (e.key === "Tab") { close(); }
    });
  }

  return { SA, INDEX, ALIAS, search, match, provinceOf, provinceByName, same, attach, norm };
})();

window.GOGOPlaces = GOGOPlaces;
