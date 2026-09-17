/* =========================================================================
   GOGO — POPULAR ROUTES, BY CITY

   The dashboard shows the six journeys people actually make from the rider's
   own city, each one a link straight into live search results.

   These are the real corridors, not invented pairs. East London sits on the
   N2 and the N6, so Mthatha, Komani and Gqeberha are the ones that matter;
   Mthatha radiates to Durban and Kokstad; Gqeberha runs up the N2 to Makhanda
   and inland to Graaff-Reinet. A city not listed falls back to the national
   spine, so the block is never empty.

   Every entry is [destination, why it is popular]. The "why" is shown as the
   sub-line, so the rider knows what they are looking at.
   ========================================================================= */

window.GOGORoutes = (function () {
  var R = {
    "East London": [
      ["Mthatha",  "N2 · 3h"],
      ["Komani",   "N6 · 2h"],
      ["Gqeberha", "N2 · 3h30"],
      ["Butterworth", "N2 · 1h30"],
      ["Idutywa",  "N2 · 1h"],
      ["Makhanda", "N2 · 2h30"],
    ],
    "KuGompo City": [
      ["Mthatha",  "N2 · 3h"],
      ["Komani",   "N6 · 2h"],
      ["Gqeberha", "N2 · 3h30"],
      ["Butterworth", "N2 · 1h30"],
      ["Idutywa",  "N2 · 1h"],
      ["Makhanda", "N2 · 2h30"],
    ],
    "Mthatha": [
      ["Durban",      "N2 · 5h"],
      ["East London", "N2 · 3h"],
      ["Kokstad",     "N2 · 2h"],
      ["Port St Johns", "R61 · 2h"],
      ["Mthatha CBD", "town"],
      ["Mount Frere", "N2 · 1h30"],
    ],
    "Gqeberha": [
      ["Makhanda",    "N2 · 1h30"],
      ["East London", "N2 · 3h30"],
      ["Mthatha",     "N2 · 5h"],
      ["Graaff-Reinet", "R75 · 3h"],
      ["Port Elizabeth", "town"],
      ["Butterworth", "N2 · 4h30"],
    ],
    "Komani": [
      ["East London", "N6 · 2h"],
      ["Mthatha",     "N2 · 4h"],
      ["Gqeberha",    "N2 · 5h"],
      ["Cradock",     "R61 · 2h"],
      ["Makhanda",    "N2 · 4h"],
      ["Butterworth", "N2 · 2h30"],
    ],
    "Durban": [
      ["Mthatha",         "N2 · 5h"],
      ["Port Shepstone",  "N2 · 1h30"],
      ["Kokstad",         "N2 · 3h"],
      ["East London",     "N2 · 7h"],
      ["Johannesburg",    "N3 · 6h"],
      ["Mthatha CBD",     "N2 · 5h"],
    ],
    "Cape Town": [
      ["Gqeberha",   "N2 · 8h"],
      ["East London", "N2 · 11h"],
      ["Mthatha",    "N2 · 13h"],
      ["George",     "N2 · 4h30"],
      ["Beaufort West", "N1 · 5h"],
      ["Komani",     "N6 · 10h"],
    ],
    "Johannesburg": [
      ["Durban",     "N3 · 6h"],
      ["Mthatha",    "N2 · 9h"],
      ["East London", "N2 · 10h"],
      ["Bloemfontein", "N1 · 4h"],
      ["Kokstad",    "N2 · 7h"],
      ["Gqeberha",   "N2 · 12h"],
    ],
  };

  /* the national spine, used when a city has no list of its own */
  var FALLBACK = [
    ["Mthatha",     "N2"],
    ["East London", "N2"],
    ["Komani",      "N6"],
    ["Gqeberha",    "N2"],
    ["Durban",      "N2"],
    ["Makhanda",    "N2"],
  ];

  function forCity(city) {
    var key = String(city || "").trim();
    if (!key) return FALLBACK.slice(0, 4);
    /* exact first, then case-insensitive, then the rename map */
    if (R[key]) return R[key].slice(0, 4);
    var low = key.toLowerCase();
    var hit = Object.keys(R).filter(function (k) { return k.toLowerCase() === low; })[0];
    if (!hit && window.GOGORenames && GOGORenames.townOf) {
      var alt = GOGORenames.townOf(key);
      if (alt && R[alt]) return R[alt].slice(0, 4);
    }
    return FALLBACK.slice(0, 4);
  }

  return { forCity: forCity, all: R };
})();
