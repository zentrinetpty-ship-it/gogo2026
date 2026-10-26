import * as React from "react";
import {
  MapPin, Armchair, Briefcase, Package,
  ArrowUpDown, ChevronDown, CalendarDays, User,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── the real GOGO numbers, one source of truth ─────────────────────────── */
export const FEE = { pickup: 19.99, platform: 9.99, parcelBooking: 19.99 };

export const CITIES = [
  "East London", "Komani", "Cala", "Ngcobo", "Butterworth", "Idutywa", "Mthatha",
  "Mthatha CBD", "Kokstad", "Port Shepstone", "Durban", "Fort Beaufort", "Makhanda",
  "Gqeberha", "Cradock", "Beaufort West", "Cape Town", "Johannesburg", "Queenstown",
  "Stutterheim", "Mount Frere", "Bizana", "Port St Johns",
];

const SLOTS = [
  { v: "", label: "Any time" },
  { v: "6", label: "06:00 – 08:00" }, { v: "8", label: "08:00 – 10:00" },
  { v: "10", label: "10:00 – 12:00" }, { v: "12", label: "12:00 – 14:00" },
  { v: "14", label: "14:00 – 16:00" }, { v: "16", label: "16:00 – 18:00" },
  { v: "18", label: "18:00 – 20:00" }, { v: "20", label: "20:00 – 22:00" },
];

export type Mode = "passenger" | "parcel";

export type Draft = {
  mode: Mode;
  pickup: string;
  /* where the pickup IS. The city is what the search anchors on, so it is
     captured here rather than inferred from the street text. */
  suburb: string;
  city: string;
  destination: string;
  when: "today" | "tomorrow" | "any";
  slot: string;
  seats: number;
  luggage: "hand" | "boot" | "trailer";
  pickupDate: string;
  pickupTime: string;
  weightKg: string;
  size: string;
  description: string;
  /* the coordinates of the picked pickup address. The ride search and the
     driver's navigation both use them, and they arrive free with the same
     lookup that produced the address. */
  lat?: number | null;
  lng?: number | null;
};

const EMPTY: Draft = {
  mode: "passenger", pickup: "", suburb: "", city: "", destination: "", when: "today", slot: "",
  seats: 1, luggage: "hand", pickupDate: new Date().toISOString().slice(0, 10),
  pickupTime: "", weightKg: "", size: "small", description: "",
};

const KEY = "gogo_hermes_draft_v1";

export function BookingCard({
  mode,
  onMode,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
}) {
  const [d, setD] = React.useState<Draft>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return EMPTY;
      const saved = { ...EMPTY, ...JSON.parse(raw) };

      /* ── what survives a return visit, and what does not ────────────────
         Preferences the rider set once and would not want to re-answer —
         seats, luggage, travel window — come back.

         WHERE THEY ARE GOING DOES NOT. A destination restored from a previous
         visit is a town they picked days ago and may not want now, and it
         would sit there looking like a deliberate choice. Every new session
         starts with the destination empty, so choosing it is always an act. */
      saved.destination = "";

      /* the pickup address is cleared too, for the same reason: booking a
         collection from an address you have since moved out of is worse than
         retyping a street. */
      saved.pickup = "";
      saved.suburb = "";
      saved.city = "";

      return saved;
    } catch { return EMPTY; }
  });
  const [done, setDone] = React.useState(false);
  /* collapsed on phones so the card is a single address field at the top of the
     hero; desktop always shows the whole form */
  const [open, setOpen] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth >= 768
  );

  /* live address suggestions for the pick-up field */
  const [focused, setFocused] = React.useState(false);
  const [candidates, setCandidates] = React.useState<string[]>([]);

  /* destination matching — the server decides which hikes reach what was typed */
  const [destFocused, setDestFocused] = React.useState(false);
  const [matches, setMatches] = React.useState<
    Array<{ stop: string; from: string; to: string; depart: string; vehicle: string; fare: number; rideId: string }>
  >([]);
  const [noMatchSuggestion, setNoMatchSuggestion] = React.useState<string | null>(null);
  const [alternatives, setAlternatives] = React.useState<
    Array<{ stop: string; from: string; depart: string; fare: number; rideId: string }>
  >([]);
  const [destLoading, setDestLoading] = React.useState(false);
  const setDestList = React.useCallback(() => {
    setMatches([]);
    setNoMatchSuggestion(null);
  }, []);
  React.useEffect(() => {
    const q = d.destination.trim();
    if (q.length < 2) { setMatches([]); setNoMatchSuggestion(null); return; }
    let live = true;
    setDestLoading(true);
    const t = setTimeout(() => {
      fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data) => {
          if (!live) return;
          setMatches(Array.isArray(data?.matches) ? data.matches : []);
          setNoMatchSuggestion(data?.suggestion || null);
          setAlternatives(Array.isArray(data?.alternatives) ? data.alternatives : []);
        })
        .catch(() => {
          if (live) { setMatches([]); setNoMatchSuggestion(null); setAlternatives([]); }
        })
        .finally(() => { if (live) setDestLoading(false); });
    }, 280);
    return () => { live = false; clearTimeout(t); };
  }, [d.destination]);

  React.useEffect(() => {
    const q = d.pickup.trim();
    if (q.length < 4) { setCandidates([]); return; }
    let live = true;
    const t = setTimeout(() => {
      fetch(`/api/address/?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((rows) => {
          if (!live || !Array.isArray(rows)) return;
          setCandidates(
            rows.map((r: { display_name?: string }) => r?.display_name)
                .filter((v: unknown): v is string => typeof v === "string" && v.length > 0)
                .slice(0, 6)
          );
        })
        .catch(() => { /* no suggestions is not an error worth showing */ });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [d.pickup]);

  /* the mode is owned by the page so the hero buttons can set it too */
  React.useEffect(() => { setD((p) => ({ ...p, mode })); }, [mode]);

  /* every keystroke is saved, so nothing is ever asked twice */
  React.useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...d, mode })); } catch {}
  }, [d, mode]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const isParcel = mode === "parcel";
  const swap = () => setD((p) => ({ ...p, pickup: p.destination, destination: p.pickup }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    /* The rider must choose where they are going and where they are. Neither
       is guessed: a default town would send the search somewhere they never
       asked for, and a street with no city gives the search nothing to match
       on. Focus the first missing field so it is obvious what to do. */
    /* The rider must say where they are going and where they are. Neither is
       guessed: a default town would send the search somewhere they never asked
       for.

       The pick-up only has to be non-empty. It used to also require a separate
       `city` field that the old address picker filled in, but the pick-up is now
       a plain typed field — so requiring a city would reject a perfectly good
       address and leave the rider with a dead Search button. What the search
       actually needs is where the hike leaves from, and the ride page resolves
       that from the routes themselves. */
    const missing = !d.pickup.trim() ? "pickup" : !d.destination ? "destination" : "";
    if (missing) {
      const el = document.getElementById(missing);
      if (el) { (el as HTMLInputElement).focus(); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
      setOpen(true);
      return;
    }

    setDone(true);

    /* Everything the user filled in must reach the booking screen, so it is
       handed over two ways: in the URL (works on a shared link or a fresh
       device) and into the app's own draft store, which the ride page reads
       to prefill the join form. The React card keeps its own key, so the two
       stores are bridged here — that bridge was missing, which is why the
       pickup address never survived the handoff. */
    const q = new URLSearchParams({
      /* the city if we have one, otherwise the typed address — the ride page
         matches on whichever it gets */
      from: d.city || d.pickup || "East London",
      /* no default town: a destination the rider never picked would send the
         search somewhere they never asked for. The form requires a choice. */
      ...(d.destination ? { to: d.destination } : {}),
      seats: String(d.seats),
      when: d.when,
      luggage: d.luggage,
      ...(d.slot ? { slot: d.slot } : {}),
      ...(d.pickup ? { pickup: d.pickup } : {}),
      ...(d.suburb ? { suburb: d.suburb } : {}),
      ...(d.city ? { city: d.city } : {}),
      mode,
    });

    try {
      const raw = localStorage.getItem("gogo_state_v1");
      const state = raw ? JSON.parse(raw) : {};
      state.bookingDraft = {
        mode,
        pickup: d.pickup,
        suburb: d.suburb,
        city: d.city,
        destination: d.destination,
        when: d.when,
        slot: d.slot,
        seats: String(d.seats),
        luggage: d.luggage,
        pickupDate: d.pickupDate,
        pickupTime: d.pickupTime,
        weightKg: d.weightKg,
        size: d.size,
        description: d.description,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem("gogo_state_v1", JSON.stringify(state));
    } catch { /* a blocked store just means the URL still carries everything */ }

    setTimeout(() => { window.location.href = `/gogo/rides.html?${q}`; }, 900);
  };

  return (
    <form
      id="book"
      onSubmit={submit}
      className="w-full rounded-[24px] bg-white p-5"
    >
      {/* ── the one field that is always visible ─────────────────────────
             Collapsed, the card IS this field: "Where do we get you?". Typing
             into it opens the rest of the form and the text becomes the pick-up
             address — so there is no second place to enter the same thing, and
             no "Book in 30 seconds" label that means nothing to a rider.

             On desktop the form is always open, so the label sits above the
             full form instead. */}
      <div className={cn(open && "mb-4")}>
        <label htmlFor="pickup" className="mb-1 block text-[11px] font-bold uppercase tracking-[.11em] text-neutral-400">
          Where do we get you?
        </label>
        <div className="relative">
          <input
            id="pickup"
            type="text"
            value={d.pickup}
            onChange={(e) => {
              set("pickup", e.target.value);
              /* typing is the signal to open: the rider has started telling us
                 where they are, so the rest of the questions become relevant */
              if (!open) setOpen(true);
            }}
            onFocus={() => {
              setFocused(true);
              if (!open) setOpen(true);
            }}
            onBlur={() => {
              /* let a tap on a suggestion land before the list unmounts, but
                 do not clobber a field the rider has already returned to —
                 that race is why suggestions used to vanish on re-render */
              setTimeout(() => {
                if (document.activeElement?.id !== "pickup") {
                  setFocused(false);
                }
              }, 150);
            }}
            placeholder="Enter your pick-up address"
            autoComplete="street-address"
            /* A hairline border marks where the field begins. Without it the
               text floated on the card with nothing to say it was tappable —
               invisible on a phone until you happened to press it. Regular
               weight, not bold: an address is long and bold makes it shout. */
            className="w-full rounded-full border border-neutral-300 bg-white px-4 py-3.5 text-[16px] font-normal leading-tight text-ink outline-none transition-colors placeholder:font-normal placeholder:text-neutral-400 focus:border-ink"
          />

          {/* live suggestions, anchored under the field */}
          {focused && candidates.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full z-30 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-neutral-200 bg-white py-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,.18)]"
            >
              {candidates.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => { e.preventDefault(); set("pickup", c); setCandidates([]); }}
                    className="flex w-full items-start gap-2 px-4 py-2.5 text-left text-[13px] font-normal text-neutral-700 hover:bg-neutral-50"
                  >
                    <MapPin className="mt-[2px] h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={2} />
                    <span className="min-w-0 truncate">{c}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={cn(!open && "hidden")}>
        {/* The Passenger / Parcel switch used to live here. It now sits above the
            card as the two big Ride / Parcel buttons, because the question "what
            are you sending" is answered before the form is opened — not inside
            it. This card only asks for the details that follow. */}

        {/* ── TO + swap ──────────────────────────────────────────────────── */}
        <div className="relative">
          {/* The From row is gone: the pick-up is the big field above, which is
              the whole point — one place to type where we collect you. This row
              is only the destination, so the connector and dot are gone with it. */}
          <Row
            marker={<MapPin className="mt-[3px] h-3.5 w-3.5 shrink-0 text-ink" strokeWidth={2.4} />}
            label="To"
          >
            <input
              id="destination"
              type="text"
              value={d.destination}
              onChange={(e) => {
                set("destination", e.target.value);
                setDestList();
              }}
              onFocus={() => setDestFocused(true)}
              onBlur={() => {
                setTimeout(() => {
                  if (document.activeElement?.id !== "destination") setDestFocused(false);
                }, 150);
              }}
              placeholder="Where to?"
              autoComplete="off"
              className="w-full bg-transparent pr-11 text-[16px] font-bold leading-tight text-ink outline-none placeholder:font-medium placeholder:text-neutral-400"
            />
          </Row>

          {/* The destination is typed, not picked from a list we invented. The
              server matches whatever is entered against the stops it actually
              serves and returns the hikes that get there — see /match. */}
          {destFocused && d.destination.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_16px_40px_-12px_rgba(0,0,0,.18)]">
              {destLoading && (
                <p className="px-4 py-3 text-[13px] font-medium text-neutral-400">Looking for hikes…</p>
              )}

              {!destLoading && matches.length > 0 && (
                <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
                  {matches.map((m) => (
                    <li key={`${m.rideId}-${m.stop}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={d.destination === m.stop}
                        onMouseDown={(e) => { e.preventDefault(); set("destination", m.stop); setDestFocused(false); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50"
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={2} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-ink">{m.stop}</span>
                          <span className="block text-[11.5px] font-medium text-neutral-500">
                            {m.from} · leaves {m.depart} · {m.vehicle}
                          </span>
                        </span>
                        <span className="shrink-0 text-[13px] font-bold text-ink">R{m.fare}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!destLoading && matches.length === 0 && d.destination.trim().length >= 3 && (
                <div className="px-4 py-3">
                  {/* Not "we don't go there" — that claims the town is off our
                      network, which we cannot know. There is simply no direct
                      hike to it right now, so we say that and show the nearest
                      rides that can take them today. */}
                  <p className="text-[13px] font-semibold text-ink">
                    No direct ride to “{d.destination.trim()}” at the moment.
                  </p>

                  {alternatives.length > 0 ? (
                    <>
                      <p className="mt-1 text-[11.5px] font-medium uppercase tracking-[.08em] text-neutral-400">
                        Nearest hikes running now
                      </p>
                      <ul className="mt-1.5 -mx-1">
                        {alternatives.map((a) => (
                          <li key={`${a.rideId}-${a.stop}`}>
                            <button
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); set("destination", a.stop); setDestFocused(false); }}
                              className="flex w-full items-center gap-2 rounded-xl px-1 py-2 text-left hover:bg-neutral-50"
                            >
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={2} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-semibold text-ink">{a.stop}</span>
                                <span className="block text-[11px] font-medium text-neutral-500">
                                  {a.from} · leaves {a.depart}
                                </span>
                              </span>
                              <span className="shrink-0 text-[12.5px] font-bold text-ink">R{a.fare}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-neutral-500">
                      Try another town along the route.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* swap: still useful — it flips the typed address with the chosen
              town, which is how someone booking a return trip thinks */}
          <button
            type="button"
            onClick={swap}
            aria-label="Swap pick-up and destination"
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white transition-opacity hover:opacity-85"
          >
            <ArrowUpDown className="h-[15px] w-[15px]" strokeWidth={2.2} />
          </button>
        </div>

        {/* ── date + passengers, split by a hairline ─────────────────────── */}
        <div className="mt-4 border-t border-neutral-200 pt-4">
          <div className="grid grid-cols-2">
            <div className="pr-3">
              <Field
                icon={<CalendarDays className="h-[15px] w-[15px] text-neutral-400" strokeWidth={2} />}
                label="Date"
              >
                <select
                  value={d.when}
                  onChange={(e) => set("when", e.target.value as Draft["when"])}
                  className="w-full appearance-none bg-transparent text-[15px] font-bold leading-tight text-ink outline-none"
                >
                  <option value="today">Today</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="later">Any day</option>
                </select>
              </Field>
            </div>

            <div className="border-l border-neutral-200 pl-3">
              <Field
                icon={<User className="h-[15px] w-[15px] text-neutral-400" strokeWidth={2} />}
                label={isParcel ? "Weight" : "Passengers"}
              >
                {isParcel ? (
                  <input
                    type="number"
                    min={1}
                    max={200}
                    inputMode="decimal"
                    value={d.weightKg}
                    onChange={(e) => set("weightKg", e.target.value)}
                    placeholder="kg"
                    className="w-full bg-transparent text-[15px] font-bold leading-tight text-ink outline-none placeholder:font-medium placeholder:text-neutral-400"
                  />
                ) : (
                  <select
                    value={String(d.seats)}
                    onChange={(e) => set("seats", Number(e.target.value))}
                    className="w-full appearance-none bg-transparent text-[15px] font-bold leading-tight text-ink outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "passenger" : "passengers"}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </div>
        </div>

        {/* ── luggage stays, it is a real GOGO option the reference lacks ── */}
        <div className="mt-4">
          <Field
            icon={<Briefcase className="h-[15px] w-[15px] text-neutral-400" strokeWidth={2} />}
            label="Luggage"
          >
            <select
              value={d.luggage}
              onChange={(e) => set("luggage", e.target.value as Draft["luggage"])}
              className="w-full appearance-none bg-transparent text-[15px] font-bold leading-tight text-ink outline-none"
            >
              <option value="hand">Hand luggage</option>
              <option value="one">One bag</option>
              <option value="big">Big bag + bags</option>
            </select>
          </Field>
        </div>

        {/* ── search ─────────────────────────────────────────────────────── */}
        <button
          type="submit"
          className="mt-5 flex h-[52px] w-full items-center justify-center rounded-full bg-ink text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          {done ? "Opening rides…" : "Search"}
        </button>

        <p className="mt-3 text-center text-[11px] font-medium text-neutral-400">
          Free pickup · pay on first delivery
        </p>
      </div>
    </form>
  );
}

/* ── small pieces ────────────────────────────────────────────────────────── */

/* A from/to row: a marker in the left rail, then a stacked label + value. */
function Row({
  marker,
  label,
  children,
}: {
  marker: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-[10px] pt-[3px]">{marker}</span>
      <label className="min-w-0 flex-1">
        <span className="mb-0.5 block text-[11.5px] font-medium text-neutral-400">{label}</span>
        {children}
      </label>
    </div>
  );
}

/* A date / passengers / luggage cell: icon, label, value. */
function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2">
      <span className="mt-[2px] shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="mb-0.5 block text-[11.5px] font-medium text-neutral-400">{label}</span>
        {children}
      </span>
      <ChevronDown className="mt-[3px] h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={2.2} />
    </label>
  );
}
