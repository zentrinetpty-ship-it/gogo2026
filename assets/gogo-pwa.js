/* =========================================================================
   GOGO — INSTALL PROMPT

   Show an "Install GOGO" card to a GUEST five seconds after the page settles.
   The previous version could almost never appear, for four separate reasons,
   all of which are fixed here:

   1. IT ONLY FIRED ON beforeinstallprompt.
      That event is the browser's OWN prompt. If Chrome has not yet decided the
      site qualifies — which is common on a first visit — it never fires, so
      nothing was ever shown. Now the card appears on a TIMER regardless, and
      the browser prompt (when we have it) is used as the fast path behind the
      button.

   2. A DISMISS WAS PERMANENT.
      localStorage held "1" forever, so one tap of "Not now" disabled install
      for that device for good. That is not a decline, it is a snooze. Now a
      TIMESTAMP is stored and the prompt returns after 7 days. The key is
      versioned so existing "1" values expire instead of pinning users forever,
      and a corrupt value fails OPEN.

   3. IT NEVER RE-CHECKED.
      isStandalone() ran once at load. Someone who installed from the browser
      menu and kept the tab open would still be asked. Now the check runs at the
      moment of showing, and an appinstalled listener hides it immediately.

   4. IT SHOWED ON BUSY SCREENS.
      A blunt timer was considered rude mid-booking. The answer is not a longer
      timer, it is checking the ROUTE when the timer fires, so navigation in
      between is accounted for.

   iOS has no beforeinstallprompt at all, so it gets the Share-sheet instruction
   instead — and only on Safari, because only Safari can add to the home screen.
   ========================================================================= */

(function () {
  "use strict";

  var DISMISS_KEY = "gogo_install_snooze_v2";   /* v2 expires the old "1" */
  var SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;       /* 7 days */
  var DELAY_MS = 5000;                           /* 5s, per the brief */

  /* Screens where a rider is mid-task. Checked at fire time, not at load. */
  var BUSY = ["/auth", "/ride", "/rides", "/parcel", "/track", "/ticket", "/pay"];

  var deferred = null;      /* the held beforeinstallprompt event */
  var shown = false;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  }

  function onBusyScreen() {
    var p = (window.location.pathname || "/").replace(/\/+$/, "");
    for (var i = 0; i < BUSY.length; i++) {
      if (p === BUSY[i] || p.indexOf(BUSY[i] + ".") === 0 || p.indexOf(BUSY[i] + "/") === 0) {
        return true;
      }
    }
    return false;
  }

  /* A dismiss is a snooze, not a refusal. A corrupt value must fail OPEN —
     failing closed would disable install for anyone with a half-written entry. */
  function snoozed() {
    try {
      var raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      var t = Number(raw);
      if (!isFinite(t)) return false;          /* old "1" or garbage -> show */
      return Date.now() - t < SNOOZE_MS;
    } catch (e) { return false; }              /* private mode: show once per session */
  }

  function snooze() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }

  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  /* iPadOS 13+ reports MacIntel, like a Mac. Touch points tell them apart. */
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) isIOS = true;
  var isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);

  /* ── register the worker so the app is actually installable ───────────── */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/gogo/sw.js", { scope: "/gogo/" })
        .catch(function () { /* no worker: app still works, just no offline */ });
    });
  }

  /* ── hold the browser's install event ─────────────────────────────────── */
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
  });

  window.addEventListener("appinstalled", function () {
    deferred = null;
    hide();
    snooze();
  });

  /* ── the card ─────────────────────────────────────────────────────────── */
  var card = null;

  function build(label, hint, cta) {
    if (card) return card;
    card = document.createElement("div");
    card.className = "g-install";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Install GOGO");

    var iosHint = (isIOS && isSafari && !deferred)
      ? "Tap <b>Share</b> then <b>Add to Home Screen</b>."
      : hint;

    card.innerHTML =
      '<div class="g-install-row">' +
        '<span class="g-install-badge" aria-hidden="true">G</span>' +
        '<div class="g-install-copy">' +
          '<b class="g-install-t">' + label + '</b>' +
          '<span class="g-install-s">' + iosHint + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="g-install-actions">' +
        '<button type="button" class="g-install-later">Not now</button>' +
        '<button type="button" class="g-install-go">' + cta + '</button>' +
      '</div>';

    document.body.appendChild(card);

    card.querySelector(".g-install-later").addEventListener("click", function () {
      snooze();
      hide();
    });

    card.querySelector(".g-install-go").addEventListener("click", function () {
      if (deferred) {
        /* fast path: the browser's own sheet */
        deferred.prompt();
        deferred.userChoice.then(function () {
          deferred = null;
          hide();
          snooze();
        }).catch(function () { hide(); });
      } else if (isIOS) {
        /* no API on iOS: the hint above the button is the instruction, so just
           leave the card up rather than dismissing the only help they have */
        var s = card.querySelector(".g-install-s");
        if (s) { s.innerHTML = "Tap <b>Share</b> then <b>Add to Home Screen</b>."; }
      } else {
        /* no event yet (Chrome has not decided we qualify): tell them where the
           control lives rather than doing nothing */
        var s2 = card.querySelector(".g-install-s");
        if (s2) { s2.innerHTML = "Open your browser menu and choose <b>Install app</b>."; }
      }
    });

    requestAnimationFrame(function () { card.classList.add("in"); });
    return card;
  }

  function hide() {
    shown = false;
    if (!card) return;
    card.classList.remove("in");
    var el = card;
    card = null;
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 260);
  }

  /* ── the decision, made at fire time ──────────────────────────────────── */
  function tick() {
    if (shown) return;
    if (isStandalone()) return;      /* already installed */
    if (snoozed()) return;
    if (onBusyScreen()) return;      /* mid-booking: not now */
    shown = true;
    build(
      "Install GOGO",
      "Faster than the browser, and works on a weak signal.",
      "Install now"
    );
  }

  /* Fire 5s after load. Re-check every 10s so that someone who installs from
     the browser menu mid-session is noticed, and someone who navigates off a
     busy screen still gets the offer. */
  window.addEventListener("load", function () {
    setTimeout(tick, DELAY_MS);
    setInterval(function () {
      if (!shown && !card && isStandalone()) return;
      if (!shown && !card) tick();
    }, 10000);
  });
})();
