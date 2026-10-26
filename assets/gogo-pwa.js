/* =========================================================================
   GOGO — PWA

   Registers the service worker and offers an install prompt when the browser
   says the app is installable. Deliberately quiet: a small bar above the
   bottom nav, dismissed once and remembered.

   Chrome fires beforeinstallprompt and lets us trigger the native sheet.
   iOS Safari has no such event, so iPhone and iPad get a one-line hint
   instead, and only once.
   ========================================================================= */

(function () {
  var DISMISS_KEY = "gogo_install_dismissed";

  function dismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch (e) { return false; }
  }
  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) {}
  }

  /* ── register the worker ───────────────────────────────────────────────── */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/gogo/sw.js", { scope: "/gogo/" })
        .catch(function () { /* no worker: the app still works, just no offline */ });
    });
  }

  /* ── the install bar ───────────────────────────────────────────────────── */
  var bar = null;

  function buildBar(label, onClick) {
    if (bar) return bar;
    bar = document.createElement("div");
    bar.className = "g-install";
    bar.innerHTML =
      '<span class="g-install-ic" aria-hidden>' + GEMO("mobile") + '</span>' +
      '<span class="g-install-t">' + label + '</span>' +
      '<button type="button" class="g-install-go">Install</button>' +
      '<button type="button" class="g-install-x" aria-label="Not now">' + GEMO("cross") + '</button>';
    document.body.appendChild(bar);
    bar.querySelector(".g-install-go").addEventListener("click", onClick);
    bar.querySelector(".g-install-x").addEventListener("click", function () {
      bar.remove(); bar = null; dismiss();
    });
    requestAnimationFrame(function () { bar.classList.add("in"); });
    return bar;
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  }

  if (dismissed() || isStandalone()) return;

  var deferred = null;

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    buildBar("Add GOGO to your home screen", function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () {
        deferred = null;
        if (bar) { bar.remove(); bar = null; }
        dismiss();
      });
    });
  });

  /* iOS has no beforeinstallprompt, so show the instruction instead */
  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  if (isIOS && !isStandalone() && !dismissed()) {
    window.addEventListener("load", function () {
      setTimeout(function () {
        buildBar("Add GOGO: tap Share, then Add to Home Screen", function () {
          if (bar) { bar.remove(); bar = null; }
          dismiss();
        });
      }, 2600);   /* after the map has settled, not during load */
    });
  }

  /* once installed, stop offering */
  window.addEventListener("appinstalled", function () {
    if (bar) { bar.remove(); bar = null; }
    dismiss();
  });
})();
