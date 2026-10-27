/* =========================================================================
   GOGO — INSTALL PROMPT

   Show an "Install GOGO" card to a GUEST five seconds after the page settles,
   with step-by-step instructions specific to the platform they are actually on.
   A single generic line ("add to home screen") was not enough: the steps differ
   completely between Android Chrome, Samsung Internet, desktop Chrome and iOS
   Safari, and the wrong steps read as instructions that do not work.

   Four faults in the original version, all fixed here:

   1. IT ONLY FIRED ON beforeinstallprompt.
      That event is the browser's OWN prompt. If Chrome has not yet decided the
      site qualifies — common on a first visit — it never fires, so nothing was
      ever shown. Now the card appears on a TIMER regardless, and the browser
      prompt (when we have it) is used as the fast path behind the button.

   2. A DISMISS WAS PERMANENT.
      localStorage held "1" forever, so one tap of "Not now" disabled install
      for that device for good. Now a TIMESTAMP with a 7-day snooze, a v2 key so
      existing "1" values expire, and a corrupt value fails OPEN.

   3. IT NEVER RE-CHECKED.
      isStandalone() ran once at load. Now it runs at the moment of showing, and
      an appinstalled listener hides the card immediately.

   4. IT SHOWED ON BUSY SCREENS.
      Fixed by checking the ROUTE when the timer fires, not by lengthening it.
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
    } catch (e) { return false; }
  }

  function snooze() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }

  /* ── what platform are we on? ────────────────────────────────────────────
     This decides which instructions to show, so it matters. Getting iPadOS
     wrong is easy: since 13 it reports MacIntel, exactly like a Mac. Touch
     points are the only reliable way to tell them apart. */
  var ua = navigator.userAgent || "";

  var isAndroid = /Android/.test(ua);
  var isSamsung = /SamsungBrowser/.test(ua);
  var isFirefox = /Firefox|FxiOS/.test(ua);
  var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) isIOS = true;
  /* only Safari can add to the home screen on iOS — Chrome/Firefox on iOS
     cannot, so telling someone to use the share sheet in Chrome would be a lie */
  var isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  var isDesktop = !isAndroid && !isIOS;

  /* ── inline line icons, so the steps need no image requests ───────────────
     24-viewBox, 1.75 stroke, round caps — the same grammar as gogo-icons.js */
  var ICONS = {
    share: '<path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    plus:  '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
    menu:  '<path d="M4 7h16M4 12h16M4 17h16"/>',
    down:  '<path d="M12 4v11M12 15l-4-4M12 15l4-4"/><path d="M5 19h14"/>',
    home:  '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    bolt:  '<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/>'
  };

  function ico(name, cls) {
    return '<svg class="' + (cls || "g-inst-ic") + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }

  /* ── the instructions ────────────────────────────────────────────────────
     Each step is an icon plus a short line. Written for the platform in front
     of the user, because "tap the share icon" means nothing on Android and
     "tap the menu" means nothing on iOS. */
  function steps() {
    if (isIOSSafari) {
      return [
        { icon: "share", text: 'Tap the <b>Share</b> button in Safari\u2019s toolbar' },
        { icon: "down",  text: 'Scroll the sheet and tap <b>Add to Home Screen</b>' },
        { icon: "check", text: 'Tap <b>Add</b> \u2014 GOGO opens full screen, like an app' }
      ];
    }
    if (isIOS && !isIOSSafari) {
      return [
        { icon: "menu",  text: 'iOS adds to the home screen from <b>Safari</b> only' },
        { icon: "phone", text: 'Open <b>go-go.city</b> in Safari to install it' }
      ];
    }
    if (isSamsung) {
      return [
        { icon: "menu", text: 'Tap the <b>\u2261</b> menu at the bottom right' },
        { icon: "down", text: 'Choose <b>Add page to</b> then <b>Home screen</b>' },
        { icon: "check", text: 'Tap <b>Add</b> \u2014 GOGO sits with your other apps' }
      ];
    }
    if (isAndroid) {
      return [
        { icon: "menu",  text: 'Tap the <b>\u22ee</b> menu in the top right' },
        { icon: "down",  text: 'Choose <b>Install app</b> or <b>Add to Home screen</b>' },
        { icon: "check", text: 'Tap <b>Install</b> \u2014 GOGO opens full screen' }
      ];
    }
    if (isFirefox && isDesktop) {
      return [
        { icon: "menu", text: 'Open the <b>\u2261</b> menu' },
        { icon: "down", text: 'Choose <b>Install</b> or <b>Add to Taskbar</b>' }
      ];
    }
    return [
      { icon: "menu", text: 'Look for the <b>install</b> icon at the right of the address bar' },
      { icon: "down", text: 'Or open the <b>\u22ee</b> menu and choose <b>Install GOGO</b>' }
    ];
  }

  /* the benefit line changes by platform too: on iOS there is no push, so
     "notifications" would be a promise the platform cannot keep */
  function benefit() {
    if (isIOS) return "One tap from your home screen, no browser bar, works offline.";
    return "One tap from your home screen, no browser bar, and faster on a weak signal.";
  }

  /* ── register the worker so the app is actually installable ───────────── */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/gogo/sw.js", { scope: "/gogo/" })
        .catch(function () {});
    });
  }

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

  function build() {
    if (card) return card;

    var list = steps();
    var rows = list.map(function (s) {
      return '<li class="g-inst-step">' +
               '<span class="g-inst-step-ic">' + ico(s.icon) + '</span>' +
               '<span class="g-inst-step-t">' + s.text + '</span>' +
             '</li>';
    }).join("");

    card = document.createElement("div");
    card.className = "g-install";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "false");
    card.setAttribute("aria-label", "Install GOGO");

    card.innerHTML =
      '<div class="g-inst-head">' +
        '<span class="g-inst-badge" aria-hidden="true">G</span>' +
        '<div class="g-inst-headtx">' +
          '<b class="g-inst-title">Install GOGO</b>' +
          '<span class="g-inst-benefit">' + ico("bolt", "g-inst-bolt") + benefit() + '</span>' +
        '</div>' +
        '<button type="button" class="g-inst-close" aria-label="Not now">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
          'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
      '</div>' +
      '<ol class="g-inst-steps">' + rows + '</ol>' +
      '<div class="g-inst-actions">' +
        '<button type="button" class="g-inst-later">Not now</button>' +
        '<button type="button" class="g-inst-go">' +
          ico("down", "g-inst-goic") + '<span>Install now</span>' +
        '</button>' +
      '</div>';

    document.body.appendChild(card);

    card.querySelector(".g-inst-later").addEventListener("click", function () {
      snooze(); hide();
    });
    card.querySelector(".g-inst-close").addEventListener("click", function () {
      snooze(); hide();
    });

    card.querySelector(".g-inst-go").addEventListener("click", function () {
      if (deferred) {
        /* fast path: the browser's own sheet */
        deferred.prompt();
        deferred.userChoice.then(function () {
          deferred = null; hide(); snooze();
        }).catch(function () { hide(); });
        return;
      }
      /* No held event. Rather than a dead button, point at the step that does
         the job on this platform — the instructions are already on screen, so
         highlight the first one instead of repeating text. */
      var first = card.querySelector(".g-inst-step");
      if (first) {
        first.classList.remove("g-inst-flash");
        void first.offsetWidth;              /* restart the animation */
        first.classList.add("g-inst-flash");
        first.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    build();
  }

  /* Fire 5s after load. Re-check every 10s so an install from the browser menu
     mid-session is noticed, and someone who leaves a busy screen still gets it. */
  window.addEventListener("load", function () {
    setTimeout(tick, DELAY_MS);
    setInterval(function () {
      if (!shown && !card) tick();
    }, 10000);
  });
})();
