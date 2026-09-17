/* =========================================================================
   GOGO — renamed places

   South Africa renamed a batch of towns and cities. The gazetted changes took
   effect 6 February 2026 under the South African Geographical Names Council
   Act, so both the old and the new name are in live use: road signs and
   residents still say East London, while maps and newer systems say KuGompo
   City. A rider typing either must find the right place, and the app must show
   a name they recognise.

   The pairs below are verified against OpenStreetMap, which is what the address
   lookup returns. Where a name has NOT been changed in the map data (Queenstown
   is still Queenstown on the ground for many people, even though the local
   municipality is now Lukhanji) it is still listed, so typing either name works.

   Also here: the local-municipality names, which are what the lookup sometimes
   hands back instead of the town. Those are mapped back to the town a person
   would actually say.
   ========================================================================= */
(function () {
  /* old name -> new name */
  var RENAMED = {
    "east london": "KuGompo City",
    "king william's town": "Qonce",
    "king williams town": "Qonce",
    "queenstown": "Komani",
    "umtata": "Mthatha",
    "port elizabeth": "Gqeberha",
    "butterworth": "Gcuwa",
    "fort beaufort": "KwaMaqoma",
    "aliwal north": "Maletswai",
    "somerset east": "KwaNojoli",
    "graaff-reinet": "Robert Sobukwe Town",
    "graaff reinet": "Robert Sobukwe Town",
    "aberdeen": "Xamdeboo",
    "adendorp": "Bishop Limba",
    "barkly east": "Ekhephini",
    "cradock": "Nxuba",
    "dordrecht": "Dordrecht",
    "indwe": "Indwe",
    "molteno": "Molteno",
    "steynsburg": "Steynsburg",
    "venterstad": "Venterstad",
    "burgersdorp": "Burgersdorp",
    "tarkastad": "Tarkastad",
    "lady grey": "Lady Grey",
    "hofmeyr": "Hofmeyr",
    "middelburg": "Middelburg",
    "stutterheim": "Stutterheim",
    "komga": "Komga",
    "cathcart": "Cathcart",
  };

  /* what the lookup returns -> what a person calls it.
     The lookup often answers with a municipality name. Showing "Camdeboo Local
     Municipality" to someone who typed Graaff-Reinet is useless, so map back. */
  var MUNICIPALITY_TO_TOWN = {
    "kugompo city": "East London",
    "buffalo city": "East London",
    "lukhanji local municipality": "Komani",
    "lukhanji": "Komani",
    "mnquma local municipality": "Gcuwa",
    "mnquma": "Gcuwa",
    "nkonkobe local municipality": "KwaMaqoma",
    "nkonkobe": "KwaMaqoma",
    "walter sisulu local municipality": "Maletswai",
    "walter sisulu": "Maletswai",
    "blue crane route local municipality": "Somerset East",
    "blue crane route": "Somerset East",
    "inxuba yethemba local municipality": "Cradock",
    "inxuba yethemba": "Cradock",
    "camdeboo local municipality": "Graaff-Reinet",
    "camdeboo": "Graaff-Reinet",
    "senqu local municipality": "Barkly East",
    "senqu": "Barkly East",
    "emalahleni local municipality": "Indwe",
    "emalahleni": "Indwe",
    "inkwanca local municipality": "Molteno",
    "inkwanca": "Molteno",
    "king sabata dalindyebo local municipality": "Mthatha",
    "king sabata dalindyebo": "Mthatha",
    "nelson mandela bay": "Gqeberha",
  };

  /* ── ward names are not suburbs ──────────────────────────────────────────
     The lookup returns voting wards in the suburb slot: "Cape Town Ward 115",
     "Buffalo City Ward 47", "eThekwini Ward 32". No rider says that. The city
     prefix and the "Ward N" are stripped, and if nothing real is left the ward
     is dropped entirely rather than put in the Suburb field.
       "Cape Town Ward 115"  -> ""           (drop it, the City field has it)
       "eThekwini Ward 32"   -> ""
       "Buffalo City Ward 47"-> ""
     A genuine suburb name is passed through untouched. */
  function cleanSuburb(name) {
    var s = String(name || "").trim();
    if (!s) return "";
    /* "Something Ward 12" — a ward, not a place anyone names */
    if (/\bward\s*\d+\b/i.test(s)) return "";
    /* "Something (Ward 12)" or a trailing parenthetical ward */
    s = s.replace(/\(?\bward\s*\d+\b\)?/ig, "").trim();
    if (!s) return "";
    /* drop a trailing "Local Municipality" the same way the town mapping does */
    return s.replace(/\s*local municipality$/i, "").trim();
  }

  function norm(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  /* the new name for an old one, or "" if it was not renamed */
  function newNameOf(name) {
    return RENAMED[norm(name)] || "";
  }

  /* if the lookup handed back a municipality, give the town instead */
  function townOf(name) {
    var n = norm(name);
    if (MUNICIPALITY_TO_TOWN[n]) return MUNICIPALITY_TO_TOWN[n];
    /* strip a trailing " local municipality" and try again */
    var stripped = n.replace(/\s*local municipality$/, "");
    if (MUNICIPALITY_TO_TOWN[stripped]) return MUNICIPALITY_TO_TOWN[stripped];
    return name;
  }

  /* Both spellings, so a search for either finds the place. */
  function variantsOf(name) {
    var n = norm(name);
    var out = [name];
    if (RENAMED[n]) out.push(RENAMED[n]);
    /* and the reverse: typing the new name should also find the old one */
    for (var old in RENAMED) {
      if (norm(RENAMED[old]) === n) out.push(old);
    }
    /* the lookup answers with the new name, so searching the old one needs the
       new one too — and the town behind a municipality name */
    var town = townOf(name);
    if (town && norm(town) !== n) out.push(town);
    return out.filter(function (v, i) { return v && out.indexOf(v) === i; });
  }

  window.GOGORenames = {
    RENAMED: RENAMED,
    newNameOf: newNameOf,
    townOf: townOf,
    variantsOf: variantsOf,
    cleanSuburb: cleanSuburb,
    norm: norm,
  };
})();
