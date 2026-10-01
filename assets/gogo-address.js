/* =========================================================================
   GOGO — ADDRESS LOOKUP
   Autocomplete for the pickup field, with a manual fallback.

   Type a street and it suggests real South African addresses from Nominatim
   (OpenStreetMap). Pick one and the full address is written into the field.

   Rural coverage in OSM is thin — exactly where most of our corridor runs — so
   this never blocks the user. If nothing is found, or the lookup fails, the
   field stays a plain text input and they type street, suburb and town by hand.
   There is also a visible "enter it myself" route so nobody waits on a spinner.

   Nominatim is free and keyless but asks for at most one request a second, so
   typing is debounced and results are cached per query.
   ========================================================================= */

const GOGOAddress = (() => {
  /* One Autocomplete session token, reused. Google bills per session rather
     than per keystroke, so it must survive across a single address instead of
     being recreated on every lookup. */
  let session = null;

  /* Our own proxy, not Nominatim directly. Calling the map service from the
     browser gets rate-limited (429) and is blocked on some SA networks; going
     through our domain means one honest server-side identity, a shared cache,
     and a request the browser can always make. Falls back to the direct host
     only if the proxy is not deployed yet. */
  const PROXY = "/gogo/api/address";
  const DIRECT = "https://nominatim.openstreetmap.org/search";
  const MIN_CHARS = 4;          /* below this a lookup is just noise */
  const DEBOUNCE_MS = 450;      /* keeps us under Nominatim's 1 req/sec */
  const SA_BOUNDS = {           /* bias results to South Africa */
    left: 16.3, right: 33.0, top: -22.0, bottom: -35.0,
  };

  const cache = new Map();

  function shorten(display) {
    /* Nominatim returns long comma chains. Keep the part a driver needs:
       street, suburb, town, postcode — drop the country and province tails. */
    const parts = String(display || "")
      .split(",")
      .map(p => p.trim())
      .filter(Boolean);
    const drop = /^(south africa|za)$/i;
    const keep = parts.filter(p => !drop.test(p));
    return keep.slice(0, 4).join(", ");
  }

  function label(addr) {
    const a = addr.address || {};
    const roadName = a.road || a.pedestrian || a.footway || "";
    const houseNum = a.house_number || "";
    const street = [houseNum, roadName].filter(Boolean).join(" ");
    /* The lookup sometimes returns a voting ward as the suburb — "Cape Town
       Ward 115", "Buffalo City Ward 47". Nobody says that. A real suburb name
       is preferred, and a ward is only used if there is nothing else, with the
       "Ward N" and the city prefix stripped off. */
    const rawSuburb = a.suburb || a.neighbourhood || a.residential || a.village || a.hamlet
      || a.quarter || a.borough || "";
    const suburb = window.GOGORenames
      ? GOGORenames.cleanSuburb(rawSuburb)
      : rawSuburb;
    /* The lookup often hands back an administrative boundary: "KuGompo City"
       where a person says East London, or "Camdeboo Local Municipality" where
       they say Graaff-Reinet. GOGORenames maps those back to the name people
       actually use, so the suggestion reads the way the rider expects. */
    const raw = a.city || a.town || a.city_district || a.municipality || a.county || a.state_district || "";
    const town = window.GOGORenames ? GOGORenames.townOf(raw) : raw;
    const house = houseNum;
    return { street, suburb, town, house, postcode: a.postcode || "" };
  }

  async function search(query, near) {
    const q = String(query || "").trim();
    const town = String(near || "").trim();
    /* The same street name exists in many cities, so if we know the town, ask
       with it — "12 Currie Street, East London" returns the right one. */
    const key = town ? q + " | " + town : q;
    if (q.length < MIN_CHARS) return [];
    if (cache.has(key)) return cache.get(key);

    /* ── Google Places first ────────────────────────────────────────────────
       Replaces the OpenStreetMap route. Reasons this is better here, not just
       different:

         • Nominatim's policy forbids browser calls, so a proxy had to exist on
           :3040 — one more service that can be down while the app is up.
         • That proxy is throttled to about one request a second, so a fast typist
           was told "no match" for an address that exists.
         • Some SA mobile networks and DNS resolvers block the host outright.
         • Google has far better South African street coverage.

       The result SHAPE is unchanged — display, raw, parts{street,suburb,town,
       house,postcode}, lat, lon — so the suggestion list, the manual fallback
       and every page that consumes this keep working exactly as they did. That
       is the whole point of putting it here rather than in the UI.

       If Google is unavailable — no key, blocked, quota — this returns null and
       the caller falls through to the old path, so the field degrades instead of
       dying. */
    try {
      const g = await askGoogle(q, town);
      if (g && g.length) { cache.set(key, g); return g; }
      if (g && g.length === 0) { cache.set(key, []); return []; }
    } catch (e) { /* fall through to the old route */ }

    /* A renamed place must be findable by BOTH names. The map data answers to
       the new name (KuGompo City) while riders still type the old one (East
       London), so the query is widened to cover both. */
    const variants = (window.GOGORenames ? GOGORenames.variantsOf(town || "") : [])
      .filter(v => v && !q.toLowerCase().includes(String(v).toLowerCase()));
    const place = variants.length ? variants[0] : town;
    const full = place && !q.toLowerCase().includes(String(place).toLowerCase())
      ? `${q}, ${place}, South Africa`
      : q;

    /* Two passes. The first carries the South Africa viewbox, which biases
       results to the right country. If it comes back empty we ask again without
       it — a viewbox request can miss an address that the plain query finds. */
    const ask = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 14000);
      try {
        /* The proxy takes one query and applies the South Africa bias itself. */
        const res = await fetch(PROXY + "?q=" + encodeURIComponent(full), {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        });
        if (res.status === 429) { throttled = true; return null; }
        if (!res.ok) {
          /* the proxy is not deployed on this host, or is down: fall back to
             the map service directly so the field still works */
          return await askDirect();
        }
        const json = await res.json();
        return (json || []).map(r => ({
          display: shorten(r.display_name),
          raw: r.display_name,
          parts: label(r),
          lat: Number(r.lat),
          lon: Number(r.lon),
        }));
      } finally {
        clearTimeout(timer);
      }
    };

    /* Only used when the proxy is missing. The browser cannot set a
       User-Agent here, which is why the proxy is the preferred route. */
    const askDirect = async () => {
      try {
        const r = await fetch(DIRECT + "?format=jsonv2&addressdetails=1&limit=6&countrycodes=za"
          + "&q=" + encodeURIComponent(full), { headers: { Accept: "application/json" } });
        if (!r.ok) return null;
        const j = await r.json();
        return (j || []).map(r2 => ({
          display: shorten(r2.display_name),
          raw: r2.display_name,
          parts: label(r2),
          lat: Number(r2.lat),
          lon: Number(r2.lon),
        }));
      } catch (e) { return null; }
    };

    let rows = [];
    let failed = false;
    let throttled = false;
    try {
      /* Nominatim's usage policy asks for a descriptive header. Browsers will
         not let us set User-Agent, so the referrer carries our identity. */
      rows = await ask();
      if (rows === null) { failed = true; rows = []; }

      /* when a town was given, put its matches first — the user told us where
         they are, so a same-named street in another province is noise */
      if (town && rows.length) {
        const t = town.toLowerCase();
        rows.sort((a, b2) => {
          const av = (a.parts.town + " " + a.raw).toLowerCase().includes(t) ? 0 : 1;
          const bv = (b2.parts.town + " " + b2.raw).toLowerCase().includes(t) ? 0 : 1;
          return av - bv;
        });
      }
    } catch (e) {
      /* Offline, blocked or too slow. Report it as a failure rather than an
         empty result, so the panel can say "could not reach the lookup"
         instead of falsely claiming there is no match for the address. */
      failed = true;
      rows = [];
    }

    /* Only a real answer is cached. Caching a failure would make that address
       permanently unmatchable for the rest of the session after one blip. */
    if (!failed) cache.set(key, rows);
    return failed ? { failed: true, rows: [] } : rows;
  }

  /* ── the manual fallback: street, suburb, town ─────────────────────────── */
  /* ── Google Places lookup ─────────────────────────────────────────────
     Returns the SAME row shape search() already produces, so nothing
     downstream needs to know which provider answered. */
  async function askGoogle(q, town) {
    if (!window.GOGOPlacesGoogle) return null;
    await window.GOGOPlacesGoogle.load();
    const w = window;
    const P = w.google && w.google.maps && w.google.maps.places;
    if (!P) return null;

    const token = session || (session = new P.AutocompleteSessionToken());
    const req = {
      input: town && q.toLowerCase().indexOf(String(town).toLowerCase()) === -1
        ? q + " " + town
        : q,
      sessionToken: token,
      includedRegionCodes: ["za"],
    };

    /* fetchAutocompleteSuggestions is STATIC on the class. Calling it on
       `new AutocompleteSuggestion()` throws "not a function" — and a swallowed
       throw is indistinguishable from "no results". Hence the plain await. */
    const res = await P.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
    const preds = (res && res.suggestions || [])
      .filter(function (s) { return s.placePrediction; })
      .map(function (s) { return s.placePrediction; });
    if (!preds.length) return [];

    /* Resolve each prediction to its address parts. This is a second call per
       suggestion, so they run together and a failure on one does not lose the
       rest. */
    const rows = await Promise.all(preds.slice(0, 6).map(async function (pred) {
      try {
        const place = new P.Place({ id: pred.placeId });
        await place.fetchFields({
          fields: ["addressComponents", "formattedAddress", "location"],
        });
        const c = place.addressComponents || [];
        const get = function (t, short) {
          const hit = c.find(function (x) { return (x.types || []).indexOf(t) !== -1; });
          if (!hit) return "";
          return (short ? hit.shortText || hit.short_name : hit.longText || hit.long_name) || "";
        };
        const house = get("street_number");
        const road = get("route") || get("premise") || get("neighborhood");
        const street = [house, road].filter(Boolean).join(" ") || pred.mainText.text || "";
        /* "KuGompo City" -> "East London", the same mapping the OSM path used,
           so a suggestion reads the way the rider expects. */
        const rawTown = get("locality") || get("postal_town") || get("administrative_area_level_2") || "";
        const townName = w.GOGORenames && GOGORenames.townOf ? GOGORenames.townOf(rawTown) : rawTown;
        const rawSuburb = get("sublocality_level_1") || get("sublocality") || get("neighborhood") || "";
        const suburb = w.GOGORenames && GOGORenames.cleanSuburb
          ? GOGORenames.cleanSuburb(rawSuburb) : rawSuburb;
        const loc = place.location;
        return {
          display: pred.secondaryText && pred.secondaryText.text
            ? (pred.mainText.text || "") + ", " + pred.secondaryText.text
            : (place.formattedAddress || pred.mainText.text || ""),
          raw: place.formattedAddress || pred.mainText.text || "",
          parts: {
            street: street,
            suburb: suburb,
            town: townName,
            house: house,
            postcode: get("postal_code"),
          },
          lat: loc ? loc.lat() : null,
          lon: loc ? loc.lng() : null,
        };
      } catch (e) { return null; }
    }));
    return rows.filter(Boolean);
  }

  function compose(street, suburb, town) {
    return [street, suburb, town]
      .map(s => String(s || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  return { search, compose, shorten, MIN_CHARS };
})();

window.GOGOAddress = GOGOAddress;
