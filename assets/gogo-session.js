/* ═══════════════════════════════════════════════════════════════════════════
   SESSION GUARD

   The booking card remembers what you typed, which is right while you are
   filling it in — a refresh should not lose it. But it should NOT survive
   closing the browser: coming back tomorrow to a pickup address you typed
   yesterday is wrong, and worse, it is an address that may not even be yours
   anymore.

   localStorage persists forever; sessionStorage dies with the tab. So the
   draft is kept in localStorage while the session is alive, and wiped the
   moment a genuinely new session starts.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  var FLAG = "gogo_session_live";

  try {
    var live = sessionStorage.getItem(FLAG);

    if (!live) {
      /* ── a fresh session ────────────────────────────────────────────────
         Nothing in sessionStorage means this is a new visit: the browser was
         closed, or this is a new tab after the old one went away. Any address
         details left over from last time must go, so the rider is never shown
         a stale pickup and never books from an address they have moved out of.

         The typed street, suburb and city are cleared. Preferences that are
         genuinely theirs — seat count, luggage, travel window — are kept, so
         nothing is re-asked that does not have to be. */
      try {
        var raw = localStorage.getItem("gogo_state_v1");
        if (raw) {
          var s = JSON.parse(raw);
          if (s && s.bookingDraft) {
            s.bookingDraft.pickup = "";
            s.bookingDraft.suburb = "";
            s.bookingDraft.city = "";
            s.bookingDraft.pickupAddress = "";
            localStorage.setItem("gogo_state_v1", JSON.stringify(s));
          }
        }
      } catch (e) { /* a broken store must not stop the page loading */ }

      sessionStorage.setItem(FLAG, "1");
    }
  } catch (e) { /* private mode: nothing to clean, and nothing to remember */ }
})();
