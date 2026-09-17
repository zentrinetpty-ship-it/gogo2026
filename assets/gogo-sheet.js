/* ══════════════════════════════════════════════════════════════════════════
   GOGO /gogo2 — reshape the landing into a map-first screen with a draggable
   search sheet.

   It reuses the live landing rather than duplicating it: gogo.js renders the
   normal home page, then this moves the map and the booking card into the new
   layout and discards the rest. The form, the place pickers, the payment logic
   and the validation are therefore the same code as everywhere else.

   The sheet is anchored above the dock and grows upward by changing its HEIGHT.
   A transform would move the bottom edge too, and the bottom edge has to stay
   put: it sits on the dock.
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  if (!document.body.classList.contains("g2")) return;

  const $ = (s) => document.querySelector(s);

  function build(mapEl, card) {
    /* ── the map becomes the page ─────────────────────────────────────────── */
    const layer = document.createElement("div");
    layer.className = "g2-map";
    document.body.insertBefore(layer, document.body.firstChild);
    layer.appendChild(mapEl);
    /* gogo-map built it for a hero box (and on phones into #bodyMap), so redraw
       it for a full-screen frame, framed to sit above the sheet */
    mapEl.innerHTML = "";                 /* drop the hero-sized stage */
    try {
      if (window.GOGOMap && GOGOMap.build) {
        const desk = window.matchMedia("(min-width: 901px)").matches;
        /* build into the full-screen layer; the moved element stays in the DOM
           as an empty shell so anything still querying it finds it */
        GOGOMap.build(layer, desk
          ? { tiles: true, markers: true, zoom: 7, offX: -0.10, offY: 0.10 }
          : { tiles: true, markers: true, zoom: 8, offX: -0.02, offY: -0.34, bm: 1 });
        /* OpenStreetMap and Esri require the credit, and it belongs on the map */
        const cred = document.createElement("span");
        cred.className = "g2-credit";
        cred.textContent = "Map data © OpenStreetMap contributors · Esri";
        (document.querySelector(".g2-top") || layer).appendChild(cred);
      }
    } catch (e) { console.warn("gogo2: map redraw failed:", e && e.message); }

    /* gogo-map sized that element for a hero box with an inline height, and an
       absolutely positioned box with a real height grows the document behind
       the fixed layer. Drop the inline style so the stylesheet wins. */
    mapEl.removeAttribute("style");
    mapEl.innerHTML = "";

    /* ── the sheet ────────────────────────────────────────────────────────── */
    const sheet = document.createElement("div");
    sheet.className = "g2-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Find a hike");
    sheet.innerHTML = `
      <div class="g2-grab" aria-hidden="true"><i></i></div>
      <div class="g2-peek" role="button" tabindex="0" aria-label="Enter your pickup address">
        <span class="g2-peek-ic" aria-hidden="true">📍</span>
        <span class="g2-peek-txt">
          <span class="g2-peek-k">Pick me up</span>
          <span class="g2-peek-v empty" id="g2PeekV">Enter your pickup address</span>
        </span>
        <button class="g2-peek-go" type="button" tabindex="-1" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
               stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        </button>
      </div>
      <div class="g2-body"></div>`;
    document.body.appendChild(sheet);
    const body = sheet.querySelector(".g2-body");
    body.appendChild(card);

    /* ── a layer above the map, for the veil, the hero and the credit ───────┐
       Nothing inside the map can rise above this, whatever z-index it gives
       itself, because it is a separate stacking context. */
    const top = document.createElement("div");
    top.className = "g2-top";
    document.body.insertBefore(top, layer.nextSibling);
    /* the credit was built with the map; it rides at the end of the hero copy, so
       it is always visible and can never collide with the account chip */
    const cred = layer.querySelector(".g2-credit");
    const heroLeft = document.querySelector(".g-hero-left");
    if (heroLeft) {
      const copy = document.createElement("div");
      copy.className = "g2-hero";
      ["h1", ".g-eyebrow", ".g-lead"].forEach((sel) => {
        const el = heroLeft.querySelector(sel);
        if (el) copy.appendChild(el);
      });
      if (cred) copy.appendChild(cred);
      top.appendChild(copy);
    } else if (cred) {
      top.appendChild(cred);
    }

    /* ── nothing else on the page ─────────────────────────────────────────── */
    const main = $("#main");
    if (main) {
      [...main.children].forEach((el) => {
        if (!el.contains(card) && !el.contains(mapEl) && el !== card) el.remove();
      });
      /* the hero wrappers are empty now but still paint their own background */
      document.querySelectorAll(".g-hero, .g-hero-inner, .g-hero-left, .g-hero-ctas, .g-section").forEach((el) => {
        if (!el.children.length || !el.querySelector("#bookForm")) el.style.display = "none";
      });
      if (main.children.length === 0) main.style.display = "none";
    }

    /* ── geometry: heights, not transforms ────────────────────────────────── */
    const grab = sheet.querySelector(".g2-grab");
    const peek = sheet.querySelector(".g2-peek");
    let H = 0, H_PEEK = 92, H_HALF = 0;

    let stop = "peek";                                   /* peek | half | full | null while dragging */
    const curH = () => sheet.getBoundingClientRect().height;
    const stopH = (name) => (name === "peek" ? H_PEEK : name === "half" ? H_HALF : H);
    function goStop(name, animate) { stop = name; setH(stopH(name), animate); }

    function setH(h, animate) {
      if (animate !== false) h = Math.max(H_PEEK, Math.min(H, h));   /* snap back in */
      else h = Math.max(H_PEEK - 26, Math.min(H + 26, h));
      if (animate === false) sheet.style.transition = "none";
      sheet.style.height = h + "px";
      if (animate === false) requestAnimationFrame(() => { sheet.style.transition = ""; });
      sheet.classList.toggle("at-full", h >= H - 4);
      sheet.classList.toggle("at-peek", h <= H_PEEK + 4);
      sheet.classList.toggle("near-peek", h <= H_PEEK + 40);
    }
    function nearest(h) {
      const pts = [H_PEEK, H_HALF, H];
      let best = pts[0];
      for (const p of pts) if (Math.abs(p - h) < Math.abs(best - h)) best = p;
      return best;
    }
    function measure() {
      const vh = window.innerHeight;
      const desk = window.matchMedia("(min-width: 901px)").matches;
      const nav = $("#nav"), dock = $("#dock");
      const navH = nav ? nav.getBoundingClientRect().height : 0;
      const dockH = dock ? dock.getBoundingClientRect().height : 0;
      const gap = desk ? 16 : 0;       /* the dock is full-bleed here, so no floating gap */
      document.body.style.setProperty("--g2-dock", dockH + gap + "px");
      document.body.style.setProperty("--g2-nav", navH + "px");
      H = Math.max(320, vh - navH - dockH - gap - (desk ? 20 : 8));
      H_PEEK = 92;
      H_HALF = Math.max(H_PEEK + 120, Math.min(H, vh * 0.66));
      sheet.style.setProperty("--g2-h", H + "px");
      /* re-apply the current stop; never read the height back, it may be mid-animation */
      if (stop) setH(stopH(stop), false);
      else setH(Math.min(Math.max(curH(), H_PEEK), H), false);
    }

    /* ── drag: pointer events captured on the handle that owns them ───────── */
    let dragging = false, startY = 0, startH = 0, lastY = 0, lastT = 0, vel = 0;

    let moved = 0;
    function down(ev) {
      dragging = true;
      moved = 0;
      startY = lastY = ev.clientY;
      startH = curH();
      lastT = performance.now(); vel = 0;
      sheet.classList.add("dragging");
      ev.preventDefault();
      const t = ev.currentTarget;
      try { t.setPointerCapture(ev.pointerId); } catch (e) { /* older engines */ }
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }
    function move(ev) {
      if (!dragging) return;
      const now = performance.now();
      if (now - lastT > 14) { vel = (ev.clientY - lastY) / (now - lastT); lastY = ev.clientY; lastT = now; }
      moved = Math.abs(ev.clientY - startY);
      let h = startH - (ev.clientY - startY);        /* drag up = grow */
      /* past either end, follow at a third: it should feel like it has weight */
      if (h > H) h = H + (h - H) * 0.32;
      else if (h < H_PEEK) h = H_PEEK - (H_PEEK - h) * 0.32;
      setH(h, false);
      if (ev.cancelable) ev.preventDefault();
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const h = curH();
      if (Math.abs(vel) > 0.28) {
        const up_ = vel < 0;                       /* negative = moving up */
        const pts = [H_PEEK, H_HALF, H].sort((a, b) => a - b);
        const next = pts.find((p) => (up_ ? p > h + 4 : p < h - 4));
        const target = next === undefined ? h : next;
        if (target === H_PEEK) goStop("peek", true);
        else if (target === H_HALF) goStop("half", true);
        else if (target === H) goStop("full", true);
        else setH(target, true);
      } else {
        const n = nearest(h);
        if (n === H_PEEK) goStop("peek", true);
        else if (n === H_HALF) goStop("half", true);
        else goStop("full", true);
      }
    }

    [grab, peek].forEach((el) => el.addEventListener("pointerdown", down));

    /* a tap on the handle steps the sheet one stop */
    grab.addEventListener("click", () => {
      if (moved > 6) return;
      if (stop === "peek") goStop("half", true);
      else if (stop === "half") goStop("full", true);
      else goStop("half", true);
    });

    /* the peek bar opens the sheet on the pickup field: a booking starts at your
       own doorstep, so that is the first thing asked for */
    const openSearch = () => {
      goStop("half", true);
      setTimeout(() => { const from = document.getElementById("from"); if (from) from.focus(); }, 320);
    };
    peek.addEventListener("click", (ev) => { ev.stopPropagation(); if (moved > 6) return; openSearch(); });
    peek.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openSearch(); }
    });

    /* ── swipe down on the form, but never while using a field ────────────── */
    let fromBody = null;
    body.addEventListener("touchstart", (ev) => {
      const t = ev.target;
      if (t.closest("input, textarea, select, button, a, label, [role='button'], .g-ac-list")) return;
      if (body.scrollTop > 0 || curH() >= H - 4) return;   /* at full the form scrolls instead */
      fromBody = ev.touches[0].clientY;
    }, { passive: true });
    body.addEventListener("touchmove", (ev) => {
      if (fromBody === null) return;
      const dy = ev.touches[0].clientY - fromBody;
      if (dy < 8) return;
      setH(curH() - dy, false);
      sheet.classList.add("dragging");
      ev.preventDefault();
    }, { passive: false });
    body.addEventListener("touchend", () => {
      if (fromBody !== null && sheet.classList.contains("dragging")) {
        sheet.classList.remove("dragging");
        const n = nearest(curH());
        if (n === H_PEEK) goStop("peek", true); else if (n === H_HALF) goStop("half", true); else goStop("full", true);
      }
      fromBody = null;
    });

    /* ── tap above the card and it drops back to where it started ───────────
       Collapsing only changes the sheet's height, so every field keeps exactly
       what is in it: nothing is re-rendered and nothing is reset. */
    function collapse() {
      if (stop === "peek" || dragging || sheet.classList.contains("dragging")) return;
      const ae = document.activeElement;
      if (ae && ae !== document.body && typeof ae.blur === "function") ae.blur();
      goStop("peek", true);
    }
    let downX = null, downY = null;
    document.addEventListener("pointerdown", (ev) => { downX = ev.clientX; downY = ev.clientY; }, true);
    document.addEventListener("pointerup", (ev) => {
      if (downX === null) return;
      const moved = Math.sqrt(Math.pow(ev.clientX - downX, 2) + Math.pow(ev.clientY - downY, 2));
      downX = null;
      if (moved > 8) return;                       /* that was a drag, not a tap */
      /* a tap aimed at the card, the bar, the dock or an open picker is not a
         tap on the map, so it must never fold the sheet away */
      if (ev.target.closest && ev.target.closest(".g2-sheet, #nav, #dock, .g-ac")) return;
      collapse();
    });

    /* ── the peek line follows the destination field ──────────────────────── */
    const out = sheet.querySelector("#g2PeekV");
    let last = null;
    function sync() {
      const from = document.getElementById("from");
      const v = from ? (from.value || "").trim() : "";
      if (v !== last) {
        last = v;
        out.textContent = v || "Enter your pickup address";
        out.classList.toggle("empty", !v);
      }
    }
    sync();
    setInterval(sync, 400);

    /* ── resize ───────────────────────────────────────────────────────────── */
    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => { measure(); window.dispatchEvent(new Event("scroll")); }, 150);
    });

    /* the card arrives collapsed: no fields on screen, no suggestion list open,
       nothing focused. The user opens it when they are ready. */
    measure();
    goStop("peek", false);
    const ae = document.activeElement;
    if (ae && ae.tagName === "INPUT") ae.blur();
    /* nothing is focused, so no suggestion list is open. Do NOT remove any panel
       here: the places module holds a reference to its own panel node and would
       keep populating a detached element, which silently kills both pickers. */
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));

    /* gogo-map boots on window.load and, on phones, creates its own #bodyMap in
       the body sized to the whole page. That lands after this code runs and makes
       the document ~450px taller than the screen, so the one page that must never
       scroll would scroll. Keep an empty #heroMap inside the layer so the map's
       boot still finds an element, and drop any stray layer it adds. */
    const stub = document.createElement("div");
    stub.id = "heroMap";
    stub.className = "g2-map-stub";
    stub.setAttribute("aria-hidden", "true");
    layer.insertBefore(stub, layer.firstChild);   /* under the map, not over it */

    const clearStrays = () => {
      const el = document.getElementById("bodyMap");
      if (el && !layer.contains(el)) el.remove();
    };
    clearStrays();
    setTimeout(clearStrays, 700);
    setTimeout(clearStrays, 1800);
    setTimeout(clearStrays, 3500);
    window.addEventListener("load", () => { clearStrays(); setTimeout(clearStrays, 500); });
    if (window.MutationObserver) new MutationObserver(clearStrays).observe(document.body, { childList: true });
  }

  /* gogo.js renders on DOMContentLoaded, so wait for its output */
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const card = document.querySelector("#bookForm") || document.querySelector(".g-book");
    const mapEl = document.getElementById("bodyMap") || document.getElementById("heroMap");
    if (document.querySelector(".g2-sheet")) { clearInterval(timer); return; }
    if (card && mapEl) {
      clearInterval(timer);
      build(mapEl, card.closest(".g-book") || card);
    } else if (tries > 60) clearInterval(timer);
  }, 120);
})();
