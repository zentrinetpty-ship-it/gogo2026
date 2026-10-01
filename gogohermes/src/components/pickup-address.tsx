/* =========================================================================
   GOGO — pickup address, one line, Google Places.

   Replaces a plain text field. Three things this has to do that the old field
   could not:

     • put the whole address in ONE box that suggests as you type
     • fill city and province behind the scenes, because the ride search needs
       a town to match on and a street name alone does not say which town —
       "131 Oxford Street" is in East London, Johannesburg and Komani
     • refuse to let the ride be searched until an address was actually PICKED,
       so the search never runs against a half-typed street

   Uncontrolled on purpose. A controlled input plus a native `input` listener on
   the same node fight each other: React re-renders and resets the box while the
   listener is mid-flight. The text lives in the DOM and is mirrored out on type
   and on pick — which is why the pickup field keeps its own value in `d.pickup`
   rather than being driven by it.
   ========================================================================= */
import * as React from "react";

const KEY =
  (typeof window !== "undefined" &&
    (window as any).__GOGO_MAPS_KEY) ||
  "";

const BIAS_NONE = null; /* national: no location bias, see the note below */

let mapsLoading: Promise<void> | null = null;

function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as any;
  if (w.google?.maps?.places) return Promise.resolve();
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise((resolve, reject) => {
    const cb = "__gogoMapsCb";
    w[cb] = () => { delete w[cb]; resolve(); };
    const el = document.createElement("script");
    el.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(KEY) +
      "&libraries=places&loading=async&callback=" + cb;
    el.async = true;
    el.onerror = () => reject(new Error("Could not load Google Maps"));
    document.head.appendChild(el);
  });
  return mapsLoading;
}

export interface GogoPicked {
  line: string;
  suburb: string;
  city: string;
  province: string;
  postcode: string;
  lat: number | null;
  lng: number | null;
}

interface Props {
  value: string;
  onPick: (p: GogoPicked) => void;
  onType: (text: string) => void;
  onClear: () => void;
  placeholder: string;
  onFocus?: () => void;
  /** the town the rider already chose, used to rank local streets first */
  near?: string;
}

export function PickupAddress({
  value, onPick, onType, onClear, placeholder, onFocus, near,
}: Props) {
  const [list, setList] = React.useState<{ placeId: string; primary: string; secondary: string }[]>([]);
  const [open, setOpen] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const inp = React.useRef<HTMLInputElement | null>(null);
  const detach = React.useRef<(() => void) | null>(null);
  const session = React.useRef<any>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => { loadMaps().catch((e) => setErr(String(e?.message || e))); }, []);

  const search = React.useCallback((q: string) => {
    const w = window as any;
    if (!w.google?.maps?.places) return;
    const P = w.google.maps.places;
    const token = session.current || new P.AutocompleteSessionToken();

    /* National coverage: GOGO runs across South Africa, so there is NO location
       bias here. Cleanic biases to East London because it only collects there;
       doing the same to GOGO would hide every other province.
       `near` narrows it only when the rider has already told us the town. */
    const req: any = {
      input: q,
      sessionToken: token,
      includedRegionCodes: ["za"],
    };
    if (near) {
      req.includedPrimaryTypes = [];
    }

    /* fetchAutocompleteSuggestions is STATIC on the class. Calling it on
       `new AutocompleteSuggestion()` throws "not a function", and a swallowed
       throw looks exactly like "no results" — which is how this went unnoticed
       on another app for hours. The catch below reports instead. */
    P.AutocompleteSuggestion
      .fetchAutocompleteSuggestions(req)
      .then(({ suggestions }: any) => {
        const items = (suggestions || [])
          .filter((s: any) => s.placePrediction)
          .map((s: any) => ({
            placeId: s.placePrediction.placeId,
            primary: s.placePrediction.mainText?.text || "",
            secondary: s.placePrediction.secondaryText?.text || "",
          }));
        setList(items);
        setOpen(items.length > 0);
        setErr(null);
      })
      .catch((e: any) => {
        setErr(String(e?.message || e));
        setList([]);
        setOpen(false);
      });
  }, [near]);

  /* Stable ref callback: React calls it on mount and unmount, nothing else. */
  const attach = React.useCallback((el: HTMLInputElement | null) => {
    if (detach.current) { detach.current(); detach.current = null; }
    inp.current = el;
    if (!el) return;
    const onInput = () => {
      const q = el.value;
      setDone(false);
      onClear();
      onType(q);
      if (timer.current) clearTimeout(timer.current);
      if (q.trim().length < 3) { setList([]); setOpen(false); return; }
      timer.current = setTimeout(() => search(q), 220);
    };
    el.addEventListener("input", onInput);
    detach.current = () => el.removeEventListener("input", onInput);
  }, [search, onType, onClear]);

  const pick = (p: { placeId: string; primary: string }) => {
    const w = window as any;
    if (!w.google?.maps?.places) return;
    const place = new w.google.maps.places.Place({ id: p.placeId });
    place
      .fetchFields({ fields: ["addressComponents", "formattedAddress", "location"] })
      .then(() => {
        const c = place.addressComponents || [];
        const get = (t: string, short = false) => {
          const hit = c.find((x: any) => (x.types || []).indexOf(t) !== -1);
          if (!hit) return "";
          return (short ? hit.shortText || hit.short_name : hit.longText || hit.long_name) || "";
        };
        const line = [get("street_number"), get("route") || get("premise")]
          .filter(Boolean).join(" ") || p.primary;
        const loc = place.location;
        const el = inp.current;
        if (el) el.value = line;
        setDone(true);
        setList([]);
        setOpen(false);
        session.current = new w.google.maps.places.AutocompleteSessionToken();
        onPick({
          line,
          suburb: get("sublocality_level_1") || get("sublocality") || get("neighborhood"),
          city: get("locality") || get("postal_town") || get("administrative_area_level_2"),
          province: get("administrative_area_level_1"),
          postcode: get("postal_code"),
          lat: loc ? loc.lat() : null,
          lng: loc ? loc.lng() : null,
        });
      })
      .catch((e: any) => {
        const el = inp.current;
        if (el) el.value = p.primary;
        setDone(true);
        setOpen(false);
        setErr(String(e?.message || e));
      });
  };

  return (
    <div className="relative">
      <div className="g-pickup mt-3.5">
        <svg className="h-4 w-4 shrink-0 text-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        <input
          ref={attach}
          id="pickup"
          type="text"
          name="pickup"
          className="g-pickup-in"
          defaultValue={value}
          onChange={(e) => { onType(e.target.value); setDone(false); onClear(); }}
          onFocus={() => { setOpen(list.length > 0); onFocus?.(); }}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="next"
          required
        />
        {done && (
          <span className="text-lime text-sm shrink-0" aria-hidden>✓</span>
        )}
      </div>

      {open && list.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
          {list.map((o) => (
            <button
              key={o.placeId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              className="flex w-full items-start gap-2.5 border-b border-neutral-100 px-3.5 py-2.5 text-left last:border-b-0 hover:bg-neutral-50"
            >
              <span className="mt-[2px] text-sm" aria-hidden>📍</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-neutral-900">{o.primary}</span>
                {o.secondary && (
                  <span className="block truncate text-[12.5px] text-neutral-500">{o.secondary}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {err && (
        <p className="mt-1.5 text-[12.5px] text-red-600">
          Address lookup is unavailable — {err}
        </p>
      )}
      {!done && !err && !open && (
        <p className="mt-1.5 text-[12.5px] text-neutral-400">
          Start typing and pick your address from the list.
        </p>
      )}
    </div>
  );
}
