/* =========================================================================
   GOGO — the address field
   Wraps an existing input with:
     • live address suggestions from GOGOAddress (Nominatim)
     • keyboard support (up/down/enter/escape)
     • a "type it myself" route into street / suburb / town, which always works

   The wrapped input is never replaced and its id and change events are
   untouched, so the booking logic that reads it keeps working.
   ========================================================================= */

const GOGOAddressField = (() => {

  function mount(input) {
    if (!input || input.dataset.addrMounted) return;
    input.dataset.addrMounted = "1";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");

    /* Two nested wrappers, deliberately:
       .g-addr        groups the field with the manual accordion for layout
       .g-addr-anchor is just the input, and is what the dropdown positions
                      against — so the panel opens directly under the FIELD
                      rather than under the whole group (which would push it
                      down past the accordion row). */
    /* The host field keeps holding exactly ONE thing — the input. The wrapper
       that carries the manual button and the manual form is placed OUTSIDE the
       field, right after it, so it can never stretch or crowd the field. */
    /* The wrapper must sit OUTSIDE the field row, not inside it: inside, the
       flex row squeezes it and the label ends up stacked against the input.
       So the field row itself is the anchor — .g-field on the static pages,
       .gh-field on the React landing — and the wrapper goes after that. */
    const host = input.closest(".gh-field") || input.closest(".g-field") || input.parentNode;

    const wrap = document.createElement("div");
    wrap.className = "g-addr";
    /* place it after the whole field row, whatever the host turned out to be */
    const after = host.closest(".g-field, .gh-field") || host;
    after.parentNode.insertBefore(wrap, after.nextSibling);

    /* the input stays in the field; this anchor inside the field is what the
       suggestion panel positions against, so it drops right under the field */
    const anchor = document.createElement("div");
    anchor.className = "g-addr-anchor";
    anchor.style.cssText = "position:relative;flex:1 1 auto;min-width:0;display:flex;align-items:center";
    input.parentNode.insertBefore(anchor, input);
    anchor.appendChild(input);
    input.style.cssText += ";flex:1 1 auto;min-width:0;align-self:center;height:auto;padding:0;border:0;background:transparent;font-size:16px";

    const list = document.createElement("div");
    list.className = "g-addr-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    anchor.appendChild(list);

    /* ── the manual route ─────────────────────────────────────────────────
       A small button sits OUTSIDE the field. Tapping it swaps the field itself
       for the street / suburb / city form, so there is never a second input
       squeezed inside the first. Cancel puts the normal field back. ──────── */
    /* ── the search field IS the address ──────────────────────────────────
       The rider types their street and house number into the one field at the
       top; there is no second address box repeating it. Picking a suggestion
       fills Suburb and City. If the lookup finds nothing, whatever they typed
       stands as the address and they just add suburb and city — no button, no
       re-typing, nothing lost. ─────────────────────────────────────────── */
    /* ── collapse, on narrow screens only ────────────────────────────────
       A phone has one job here: get the rider's street. Suburb and City are
       detail, so on mobile they fold away behind the address field and the
       rider only sees them if they want them. On a wide screen everything is
       open and the toggle is not shown at all — the CSS decides, this only
       supplies the structure and the tap target. */
    /* ── collapse, on narrow screens only ────────────────────────────────
       No extra button and no extra label. The address field itself is the
       switch: tap it and Suburb and City appear underneath. On a wide screen
       everything is open from the start and nothing collapses — the CSS
       decides, this only supplies the structure. */
    const manual = document.createElement("div");
    manual.className = "g-addr-manual";
    manual.innerHTML = `
      <div class="g-addr-extra">
        <div class="g-addr-manual-grid">
          <label class="g-addr-fld"><span>Suburb</span><input class="g-addr-u" type="text" placeholder="" autocomplete="address-level3"></label>
          <label class="g-addr-fld"><span>City</span><input class="g-addr-t" type="text" placeholder="" autocomplete="address-level2"></label>
        </div>
      </div>`;
    wrap.appendChild(manual);

    const extra = manual.querySelector(".g-addr-extra");

    /* Tapping the field reveals the rest. Opening on a tap rather than on
       focus means a rider tabbing through on a desktop never triggers it,
       and the panel is already open there anyway. */
    const reveal = () => {
      if (manual.classList.contains("is-open")) return;
      manual.classList.add("is-open");
    };
    anchor.addEventListener("click", reveal);
    anchor.addEventListener("focus", reveal);
    /* keep it open once opened: these fields are useless hidden while the
       rider is filling them in */
    const keepOpen = () => manual.classList.add("is-open");
    manual.querySelectorAll("input").forEach((el) => {
      el.addEventListener("focus", keepOpen);
      el.addEventListener("click", keepOpen);
    });

    const $u = manual.querySelector(".g-addr-u");
    const $t = manual.querySelector(".g-addr-t");

    let rows = [], active = -1, timer = null, seq = 0;

    const close = () => {
      list.hidden = true;
      list.innerHTML = "";
      rows = []; active = -1;
      input.setAttribute("aria-expanded", "false");
    };

    /* Nothing is hidden or swapped. The search field and the form coexist, so
       a rider who finds their street uses the suggestions, and a rider who does
       not simply types in the fields below. Neither path blocks the other. */
    const openManual = () => { close(); };
    const closeManual = () => {};

    /* ── keeping the two in step ───────────────────────────────────────────
       The one field at the top holds the address; the two below refine it.
       Together they are what gets booked, and they recompose on every edit so
       the driver always receives what the rider sees. */
    let picked = false;
    const syncFromFields = () => {
      const val = GOGOAddress.compose(input.value, $u.value, $t.value);
      input.dataset.addr = val;
    };
    [$u, $t].forEach((el) => {
      el.addEventListener("input", syncFromFields);
      el.addEventListener("change", () => {
        picked = false;
        syncFromFields();
        input.dispatchEvent(new Event("change", { bubbles: true }));
        /* The City and Suburb fields anchor the lookup, so filling one in after
           typing an address must re-run the search — otherwise the rider sits
           on a stale "nothing found" that the town they just added would fix. */
        if (input.value.trim() && searchable(input.value)) {
          clearTimeout(timer);
          timer = setTimeout(run, 250);
        }
      });
    });

    /* ── how a suggestion reads ────────────────────────────────────────────
       The top line is the full address as a person would write it: house
       number, street, suburb, then town. `street` already carries the house
       number when the map has one, but many South African streets have none,
       so the line degrades to street, then suburb, then town rather than
       showing a gap. The second line is whatever detail is left over. */
    const houseNo = (r) => (r.parts && r.parts.house) ? String(r.parts.house).trim() : "";

    /* ── splitting what the rider typed ─────────────────────────────────────
       South African streets are largely unmapped at house-number level, so the
       rider almost always types a number the map does not know. Their number is
       the truth; the map only supplies the suburb and city. This pulls the
       number off the front of whatever they typed so it can be reunited with
       the street the map returns, and nothing they typed is ever lost.

         "131 Oxford Street"  -> { num: "131", rest: "Oxford Street" }
         "8 st georges"       -> { num: "8",   rest: "st georges" }
         "Oxford Street"      -> { num: "",    rest: "Oxford Street" }
         "12A Currie Street"  -> { num: "12A", rest: "Currie Street" }        */
    const splitTyped = (text) => {
      const t = String(text || "").trim();
      const m = t.match(/^(\d+[a-zA-Z]?(?:\s*[-/]\s*\d+[a-zA-Z]?)?)\s+(.*)$/);
      if (m) return { num: m[1].trim(), rest: m[2].trim() };
      return { num: "", rest: t };
    };

    const streetOf = (r) => {
      const st = (r.parts && r.parts.street) ? String(r.parts.street).trim() : "";
      const h = houseNo(r);
      /* street already starts with the number when the map knows it */
      if (st && h && st.indexOf(h) === 0) return st;
      if (st && h) return h + " " + st;
      return st || h;
    };
    const fullLine = (r) => {
      const p = r.parts || {};
      const bits = [streetOf(r), p.suburb, p.town].filter(Boolean);
      return bits.length ? bits.join(", ") : (r.display || "");
    };
    const subLine = (r) => {
      const p = r.parts || {};
      const bits = [p.town, p.postcode].filter(Boolean);
      const line = bits.join(", ");
      /* only shown when it adds something the top line did not already say */
      return line && fullLine(r).indexOf(line) === -1 ? line : "";
    };

    const paint = (noHits, unreachable) => {
      if (!rows.length) {
        /* Nothing found just closes quietly. The Suburb and City fields are
           already on screen and the rider's own text stands as the address, so
           there is nothing to apologise for and no second route to offer — a
           "no match" notice here would only make a working form look broken.
           The one thing worth saying is a connection problem, because then the
           rider knows to keep typing rather than wait. */
        if (!noHits) { close(); return; }
        if (unreachable) {
          list.innerHTML = `<div class="g-addr-empty">Could not reach the address lookup. Keep typing — the driver will still find you.</div>`;
          list.hidden = false;
          input.setAttribute("aria-expanded", "true");
          return;
        }
        close();
        return;
      }

      list.innerHTML = rows.map((r, i) => `
        <button type="button" class="g-addr-row${i === active ? " on" : ""}" role="option"
                aria-selected="${i === active}" data-i="${i}">
          <span class="g-addr-ic" aria-hidden>' + GEMO("pin") + '</span>
          <span class="g-addr-txt">
            <b>${fullLine(r)}</b>
            <span>${subLine(r)}</span>
          </span>
        </button>`).join("");
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };

    /* ── picking a suggestion ──────────────────────────────────────────────
       The rider's own house number is the truth, because the map rarely has it.
       So their number is kept and the map only contributes the street, suburb
       and city. They are dropped straight into the editable fields, so they can
       correct any part by tapping it — no separate confirmation step, and
       nothing they already typed is lost. */
    const choose = (i) => {
      const r = rows[i];
      if (!r) return;
      const p = r.parts || {};
      const typed = splitTyped(input.value);

      /* the street the map knows, without any number on it */
      let street = String(p.street || "").trim();
      const knownNum = houseNo(r);
      if (knownNum && street.indexOf(knownNum) === 0) {
        street = street.slice(knownNum.length).trim();
      }

      /* their number wins; if they typed none, fall back to the map's */
      const num = typed.num || knownNum;
      const addressLine = [num, street || typed.rest].filter(Boolean).join(" ").trim()
        || input.value.trim();

      /* the address goes back into the one field; only the two below are
         filled, so the address is never shown twice */
      $u.value = p.suburb || "";
      $t.value = p.town || "";
      /* the postcode and coordinates travel with the choice, so the booking
         carries what the map actually verified */
      manual.dataset.postcode = p.postcode || "";
      input.dataset.lat = r.lat;
      input.dataset.lon = r.lon;

      close();
      input.value = addressLine;
      input.dataset.addr = addressLine;
      picked = true;
      /* the caret lands at the end of the address, so a house number the map
         does not know can be typed straight on without re-typing the street */
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    /* A bare house number is not a search yet. Nobody types "131" and expects
       a street back, and firing a lookup then saying "no match" reads as the
       app being broken. The search only starts once a number is followed by a
       street word, or the rider types a word with no number at all. */
    const searchable = (text) => {
      const t = String(text || "").trim();
      if (!t) return false;
      if (/^\d+[a-zA-Z]?$/.test(t)) return false;          /* just "131" */
      if (/^[\d\s\-/]+$/.test(t)) return false;            /* "131 ", "131-133" */
      return t.replace(/[\d\s\-/]/g, "").length >= 2;      /* a real word exists */
    };

    const run = async () => {
      const q = input.value;
      if (!searchable(q) || q.trim().length < (window.GOGOAddress ? GOGOAddress.MIN_CHARS : 4)) {
        close();
        return;
      }
      const mine = ++seq;

      /* Never leave the user staring at a field that does nothing. If the
         lookup is slow, say so, and offer the manual route immediately. */
      const slow = setTimeout(() => {
        if (mine !== seq || document.activeElement !== input) return;
        list.innerHTML = `<div class="g-addr-empty">Looking up addresses…</div>`;
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
      }, 900);

      /* ── which town anchors the search ─────────────────────────────────
         The Suburb and City fields describe where the rider IS, so they beat
         the destination: a pickup of "131 Oxford Street" with City "East
         London" must search East London, not the place they are travelling to.
         Anchoring on the destination made "131 Oxford Street" return nothing
         whenever the destination was a different town, because it asked for
         Oxford Street in Mthatha — a street that does not exist there.
         Order: City field, then Suburb, then the destination as a last resort. */
      const cityField = ($t && $t.value ? $t.value : "").trim();
      const subField = ($u && $u.value ? $u.value : "").trim();
      const destField = (input.dataset.near
        || (document.querySelector("#to") ? document.querySelector("#to").value : "") || "").trim();
      const near = cityField || subField || destField;
      let found = [];
      let unreachable = false;
      try {
        const r = await GOGOAddress.search(q, near);
        if (r && r.failed) { unreachable = true; found = []; }
        else { found = r || []; }
      } catch (e) {
        unreachable = true;
        found = [];
      }
      clearTimeout(slow);

      if (mine !== seq) return;              /* a newer keystroke won */
      if (document.activeElement !== input) return;
      rows = found;
      active = -1;
      /* "no match" and "could not reach the lookup" are different problems and
         must not look the same to the user */
      paint(found.length === 0, unreachable);
    };

    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(run, 450);
    });

    input.addEventListener("keydown", (e) => {
      if (list.hidden) {
        if (e.key === "ArrowDown" && rows.length) { paint(); }
        return;
      }
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, rows.length - 1); paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, -1); paint(); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(active); }
      else if (e.key === "Escape") { close(); }
    });

    list.addEventListener("mousedown", (e) => {
      /* mousedown, not click: the input's blur would otherwise close the list
         before the click registers (the same trap the province picker hit) */
      const self = e.target.closest("[data-self]");
      if (self) { e.preventDefault(); openManual(); return; }
      const row = e.target.closest("[data-i]");
      if (row) { e.preventDefault(); choose(Number(row.dataset.i)); }
    });

    input.addEventListener("blur", () => setTimeout(() => { close(); }, 160));
  }

  /* mount every address field currently on the page */
  function mountAll(scope) {
    (scope || document).querySelectorAll("input.g-addr-in").forEach(mount);
  }

  return { mount, mountAll };
})();

window.GOGOAddressField = GOGOAddressField;
