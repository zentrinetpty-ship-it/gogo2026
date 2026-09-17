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
  function compose(street, suburb, town) {
    return [street, suburb, town]
      .map(s => String(s || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  return { search, compose, shorten, MIN_CHARS };
})();

window.GOGOAddress = GOGOAddress;
