/* =========================================================================
   GOGO — FLOATING SUPPORT BUTTON

   A support entry point on EVERY screen, the way Cleanic does it: its ChatWidget
   is mounted in the root layout so no page can forget it. GOGO's pages are
   separate HTML files rather than one React shell, so the equivalent is to have
   the one shared script inject it. gogo.js already loads on all 21 pages, so
   adding it here means it can never go missing from a new page.

   WHY A FLOATING BUTTON AND NOT A FIFTH TAB
   The bottom bar is fixed at four items and is a navigation affordance. A fifth
   would make it 5 equal choices, and four is already the comfortable maximum.
   Support is an escape hatch, not a destination, so it sits above the bar as its
   own thing.

   WHY IT OPENS A PANEL RATHER THAN NAVIGATING
   Sending someone to /gogo/messages.html makes them lose the page they were on
   and the thing they wanted to ask about. A sheet keeps the context behind it.

   The panel reuses GOGOSupport (the same picker, thread, agent and guardrails),
   so there is exactly one support implementation in the product. This file is
   only the button and the sheet around it.
   ========================================================================= */

(function () {
  "use strict";

  /* Pages that already show the agent inline must not also get the button, or a
     user on Messages sees two ways to start the same conversation. */
  var INLINE_PAGES = { join: 1, board: 1, messages: 1 };

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var page = (document.body && document.body.dataset && document.body.dataset.page) || "";
    if (INLINE_PAGES[page]) return;
    if (!window.GOGOSupport) return;          // never inject a dead button
    if (document.getElementById("gsFab")) return;

    /* ── the button ──────────────────────────────────────────────────────── */
    var fab = document.createElement("button");
    fab.id = "gsFab";
    fab.className = "gs-fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "Chat to GOGO support");
    fab.innerHTML =
      '<span class="gs-fab-ic" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
             'stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4-.8L3 21l1.9-4.6a8.4 8.4 0 0 1-.9-3.9 8.4 8.4 0 0 1 8.5-8.4 8.4 8.4 0 0 1 8.5 8.4Z"/>' +
        '</svg>' +
      '</span>' +
      '<span class="gs-fab-lb">Help</span>';

    /* ── the sheet ───────────────────────────────────────────────────────── */
    var sheet = document.createElement("div");
    sheet.id = "gsSheet";
    sheet.className = "gs-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-label", "GOGO support");
    sheet.innerHTML =
      '<div class="gs-sheet-scrim" data-close></div>' +
      '<div class="gs-sheet-panel">' +
        '<header class="gs-sheet-head">' +
          '<span class="gs-sheet-t">Support</span>' +
          '<button class="gs-sheet-x" type="button" aria-label="Close" data-close>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
                 'stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
        '</header>' +
        '<div class="gs-sheet-body" id="gsSheetBody"></div>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(sheet);

    var body = sheet.querySelector("#gsSheetBody");
    var mounted = false;

    function open() {
      sheet.classList.add("on");
      document.body.classList.add("gs-noscroll");
      /* mount on first open only, so the picker is not fetched on every page */
      if (!mounted) {
        mounted = true;
        try { window.GOGOSupport.boot(body); } catch (e) { console.error("support mount failed", e); }
      }
      fab.setAttribute("aria-expanded", "true");
    }

    function close() {
      sheet.classList.remove("on");
      document.body.classList.remove("gs-noscroll");
      fab.setAttribute("aria-expanded", "false");
    }

    fab.setAttribute("aria-expanded", "false");
    fab.addEventListener("click", function () {
      if (sheet.classList.contains("on")) close(); else open();
    });

    sheet.querySelectorAll("[data-close]").forEach(function (el) {
      el.addEventListener("click", close);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sheet.classList.contains("on")) close();
    });

    /* If the agent cannot be reached at all, do not leave a button that opens a
       blank sheet. Say where to go instead. */
    fetch("/api/agent/health").then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ready === false) {
        fab.classList.add("gs-fab-quiet");
        fab.querySelector(".gs-fab-lb").textContent = "Call us";
        fab.addEventListener("click", function () {
          window.location.href = "tel:0780472090";
        }, { once: true });
      }
    }).catch(function () {});
  });
})();
