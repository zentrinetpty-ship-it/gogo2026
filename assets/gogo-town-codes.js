/* =========================================================================
   GOGO — South African town codes.

   These are the codes South Africans actually use for their towns, taken from
   the country's vehicle registration system. Two series matter here:

     1. The current plate prefix for the town (CE = East London, CH = Komani,
        CCY = Mthatha). Still on every car on the road.
     2. The old Transkei homeland codes for the same towns (XA = Mthatha,
        XB = Butterworth, XE = Ngcobo). Locals in the Eastern Cape still say
        these, and they are the shorter, punchier form.

   Where a town has both, the shorter local form leads. The full name always
   sits underneath it on the card.

   Source: Vehicle registration plates of South Africa (current prefixes and
   the Transkei homeland series).

   Attached to window, matching the convention the other GOGO assets use.
   ========================================================================= */

const GOGOTownCodes = (() => {
  const TOWNS = {
    /* ── Eastern Cape ───────────────────────────────────────────────── */
    "Mthatha":        { code: "XA",  also: "CCY", name: "Mthatha",         province: "Eastern Cape" },
    "East London":    { code: "EL",  also: "CE",  name: "East London",     province: "Eastern Cape" },
    "Komani":         { code: "CH",  also: "XAC", name: "Komani",          province: "Eastern Cape" },
    "Queenstown":     { code: "CH",  also: "XAC", name: "Komani",          province: "Eastern Cape" },
    "Butterworth":    { code: "XB",  also: "CCV", name: "Butterworth",     province: "Eastern Cape" },
    "Idutywa":        { code: "XN",  also: "CDC", name: "Idutywa",         province: "Eastern Cape" },
    "Dutywa":         { code: "XN",  also: "CDC", name: "Idutywa",         province: "Eastern Cape" },
    "Ngcobo":         { code: "XE",  also: "CDB", name: "Ngcobo",          province: "Eastern Cape" },
    "Engcobo":        { code: "XE",  also: "CDB", name: "Ngcobo",          province: "Eastern Cape" },
    "Cala":           { code: "XAC", also: "CCZ", name: "Cala",            province: "Eastern Cape" },
    "Gqeberha":       { code: "CB",  name: "Gqeberha",        province: "Eastern Cape" },
    "Port Elizabeth": { code: "CB",  name: "Gqeberha",        province: "Eastern Cape" },
    "Makhanda":       { code: "CF",  name: "Makhanda",        province: "Eastern Cape" },
    "Grahamstown":    { code: "CF",  name: "Makhanda",        province: "Eastern Cape" },
    "Graaff-Reinet":  { code: "CAZ", name: "Graaff-Reinet",   province: "Eastern Cape" },
    "Aliwal North":   { code: "CAE", name: "Aliwal North",    province: "Eastern Cape" },
    "Mount Frere":    { code: "XK",  also: "CDS", name: "Mount Frere",     province: "Eastern Cape" },
    "Mount Ayliff":   { code: "XJ",  also: "CDW", name: "Mount Ayliff",    province: "Eastern Cape" },
    "Bizana":         { code: "XAF", also: "CDJ", name: "Bizana",          province: "Eastern Cape" },
    "Flagstaff":      { code: "XAH", also: "CDN", name: "Flagstaff",       province: "Eastern Cape" },
    "Lusikisiki":     { code: "XC",  also: "CDO", name: "Lusikisiki",      province: "Eastern Cape" },
    "Port St Johns":  { code: "XF",  also: "CDF", name: "Port St Johns",   province: "Eastern Cape" },
    "Cofimvaba":      { code: "XD",  also: "CDM", name: "Cofimvaba",       province: "Eastern Cape" },
    "Tsomo":          { code: "XAC", also: "CFF", name: "Tsomo",           province: "Eastern Cape" },
    "Elliot":         { code: "CDA", name: "Elliot",          province: "Eastern Cape" },
    "Lady Frere":     { code: "XR",  also: "CAX", name: "Lady Frere",      province: "Eastern Cape" },
    "Centane":        { code: "XY",  name: "Centane",         province: "Eastern Cape" },
    "Ngqeleni":       { code: "XZ",  name: "Ngqeleni",        province: "Eastern Cape" },
    "Qumbu":          { code: "XV",  name: "Qumbu",           province: "Eastern Cape" },
    "Libode":         { code: "XU",  name: "Libode",          province: "Eastern Cape" },
    "Tsolo":          { code: "XO",  name: "Tsolo",           province: "Eastern Cape" },
    "Mount Fletcher": { code: "XW",  name: "Mount Fletcher",  province: "Eastern Cape" },
    "Tabankulu":      { code: "XAB", name: "Tabankulu",       province: "Eastern Cape" },
    "Nqamakwe":       { code: "XAA", name: "Nqamakwe",        province: "Eastern Cape" },
    "Mqanduli":       { code: "XAE", name: "Mqanduli",        province: "Eastern Cape" },
    "Gatyana":        { code: "XAG", name: "Gatyana",         province: "Eastern Cape" },
    "Willowvale":     { code: "XAG", name: "Gatyana",         province: "Eastern Cape" },
    "Matatiele":      { code: "CCX", name: "Matatiele",       province: "Eastern Cape" },
    "Sterkspruit":    { code: "XAD", name: "Sterkspruit",     province: "Eastern Cape" },

    /* ── KwaZulu-Natal ──────────────────────────────────────────────── */
    "Durban":         { code: "ND",  name: "Durban",          province: "KwaZulu-Natal" },
    "Kokstad":        { code: "NCW", also: "CCW", name: "Kokstad", province: "KwaZulu-Natal" },
    "Port Shepstone": { code: "NP",  name: "Port Shepstone",  province: "KwaZulu-Natal" },

    /* ── Gauteng ────────────────────────────────────────────────────── */
    "Johannesburg":   { code: "JHB", also: "GP", name: "Johannesburg", province: "Gauteng" },
    "Pretoria":       { code: "PTA", also: "GP", name: "Pretoria",     province: "Gauteng" },
    "Ekurhuleni":     { code: "EKU", name: "Ekurhuleni",      province: "Gauteng" },

    /* ── Western Cape ───────────────────────────────────────────────── */
    "Cape Town":      { code: "CPT", also: "CA", name: "Cape Town",    province: "Western Cape" },

    /* ── Free State ─────────────────────────────────────────────────── */
    "Bloemfontein":   { code: "BFN", name: "Bloemfontein",    province: "Free State" },

    /* ── others that show up on the corridor ────────────────────────── */
    "Bhisho":         { code: "BI",  name: "Bhisho",          province: "Eastern Cape" },
    "Zwelitsha":      { code: "ZW",  name: "Zwelitsha",       province: "Eastern Cape" },
    "Kariega":        { code: "CB",  name: "Kariega",         province: "Eastern Cape" },
    "Uitenhage":      { code: "CB",  name: "Kariega",         province: "Eastern Cape" },
    "Qonce":          { code: "CD",  name: "Qonce",           province: "Eastern Cape" },
    "King William's Town": { code: "CD", name: "Qonce",       province: "Eastern Cape" },
  };

  /* A code for any town name. Falls back to initials so a card never shows a
     blank space where the code should be. */
  function codeFor(name) {
    const hit = TOWNS[name];
    if (hit) return hit;
    const initials = String(name || "")
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
    return { code: initials || "—", name: name, province: null };
  }

  return { TOWNS, codeFor };
})();

window.GOGOTownCodes = GOGOTownCodes;
