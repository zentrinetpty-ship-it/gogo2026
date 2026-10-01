/* =========================================================================
   GOGO — address autocomplete (Google Places)

   Replaces the Nominatim path. Why Google here rather than there:

     • Nominatim's usage policy forbids browser calls, so GOGO had to run
       address-proxy.js on :3040 — a second service to keep alive, and one
       more thing that can be down while the app is up.
     • That proxy is throttled to about one upstream request a second, so a
       fast typist is told "no match" for an address that exists.
     • Some SA mobile networks and resolvers block the upstream host outright.
     • Nominatim needs a User-Agent header its own policy requires, and a
       browser silently drops that header — it is on the forbidden list.

   Google Places has none of those problems and has far better South African
   street coverage. The key is restricted by HTTP referrer, so a leaked key is
   useless from another domain.

   ── The two API details that are easy to get wrong here ──────────────────

     1. AutocompleteSuggestion.fetchAutocompleteSuggestions is STATIC on the
        class. Calling it on `new AutocompleteSuggestion()` throws
        "not a function", and if you swallow that in a .catch() the field just
        sits there — indistinguishable from "no results". Never swallow.

     2. locationBias's circle takes { center: { lat, lng }, radius }. The REST
        API's nested latitude/longitude spelling is rejected as
        Invalid LocationBias. Same concept, two shapes, different APIs.

   ── Coverage ─────────────────────────────────────────────────────────────

     No location bias. GOGO is national — a ride can start anywhere in South
     Africa — where Cleanic only collects in East London. The country filter is
     the only limit, and the province GOGO already knows is passed in as `near`
     so a local street still ranks first when the app knows the town.
   ========================================================================= */

const GOGOPlacesGoogle = (() => {
  const KEY =
    (window.GOGO_GOOGLE_MAPS_KEY) ||
    (document.querySelector('meta[name="gogo-maps-key"]') || {}).content ||
    '';

  let loading = null;

  function load() {
    if (window.google && window.google.maps && window.google.maps.places) {
      return Promise.resolve();
    }
    if (loading) return loading;
    if (!KEY) return Promise.reject(new Error('No Google Maps key configured'));

    loading = new Promise((resolve, reject) => {
      const cb = '__gogoMapsReady';
      window[cb] = () => { delete window[cb]; resolve(); };
      const el = document.createElement('script');
      el.src =
        'https://maps.googleapis.com/maps/api/js?key=' +
        encodeURIComponent(KEY) +
        '&libraries=places&loading=async&callback=' + cb;
      el.async = true;
      el.onerror = () => reject(new Error('Could not load Google Maps'));
      document.head.appendChild(el);
    });
    return loading;
  }

  /* Parse a Google place into the shape the rest of GOGO already uses. */
  function parts(place, fallback) {
    const c = place.addressComponents || [];
    const get = (type, short) => {
      const hit = c.find((x) => (x.types || []).indexOf(type) !== -1);
      if (!hit) return '';
      return (short ? hit.shortText || hit.short_name : hit.longText || hit.long_name) || '';
    };
    const number = get('street_number');
    const route = get('route') || get('premise') || get('neighborhood');
    const line = [number, route].filter(Boolean).join(' ') || (fallback || '');
    const loc = place.location;
    return {
      line: line,
      suburb:
        get('sublocality_level_1') || get('sublocality') || get('neighborhood'),
      city: get('locality') || get('postal_town') || get('administrative_area_level_2'),
      province: get('administrative_area_level_1'),
      province_code: get('administrative_area_level_1', true),
      postcode: get('postal_code'),
      formatted: place.formattedAddress || line,
      lat: loc ? loc.lat() : null,
      lng: loc ? loc.lng() : null,
    };
  }

  return { load: load, parts: parts, hasKey: !!KEY };
})();

if (typeof window !== 'undefined') window.GOGOPlacesGoogle = GOGOPlacesGoogle;
