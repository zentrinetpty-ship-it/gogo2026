import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Calendar, Clock, Armchair, Briefcase, Scale, Package,
  Search, ArrowRight, ArrowLeftRight, Check, Minus, Plus, Info, ChevronDown,
} from "lucide-react";
import { CityPicker } from "@/components/city-picker";
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
    const missing = !d.pickup ? "pickup" : !d.city ? "pickupCity" : !d.destination ? "destination" : "";
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
      /* the city the rider chose anchors the search; the street text is just
         where they are standing, and "131 Oxford Street" contains no town */
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
      className="gh-glass w-full rounded-2xl border p-4 shadow-lift sm:p-5"
    >
      {/* ── header: the collapse toggle wraps the title on mobile ─────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left md:pointer-events-none"
      >
        <span className="min-w-0">
          <span className="gh-lab mb-1 block">Book in 30 seconds</span>
          <span className="block text-[15px] font-semibold leading-tight">Where are we going?</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.13em] text-neutral-500">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" />
            Live
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-neutral-400 transition-transform duration-300 md:hidden",
              open && "rotate-180"
            )}
          />
        </span>
      </button>

      {/* ── the pickup field sits right under the title, always visible.
             Focusing it is what opens the rest of the form.

             A plain text field, deliberately: whatever the rider types is the
             address, and nothing pops up to compete with it or overwrite it. ── */}
      <div className="g-pickup mt-3.5">
        <MapPin className="h-4 w-4 shrink-0 text-lime" aria-hidden />
        <input
          id="pickup"
          type="text"
          name="pickup"
          className="g-pickup-in"
          value={d.pickup}
          onChange={(e) => set("pickup", e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={isParcel ? "Enter collection address" : "Enter pickup address"}
          autoComplete="street-address"
          enterKeyHint="next"
          required
        />
      </div>

      {/* ── Suburb and the province-and-city picker, under the street field.
             The city anchors the ride search, so it is its own field rather
             than something guessed from the street text. One control holds
             both province and city, grouped by province. ── */}
      <div className="gh-pickup-sub mt-2.5">
        <div className="min-w-0">
          <label className="gh-sub-lab" htmlFor="pickupSuburb">Suburb</label>
          <input
            id="pickupSuburb"
            type="text"
            name="suburb"
            className="gh-sub-in"
            value={d.suburb}
            onChange={(e) => set("suburb", e.target.value)}
            autoComplete="address-level3"
          />
        </div>
        <div className="min-w-0">
          <span className="gh-sub-lab" id="pickupCityLabel">Province and city</span>
          <CityPicker
            id="pickupCity"
            labelledBy="pickupCityLabel"
            value={d.city}
            onChange={(city) => set("city", city)}
            placeholder="Choose province and city"
          />
        </div>
      </div>

      {/* ── the rest of the form. It collapses under the address field and
             opens upward-into-view by pushing the content below it down. ── */}
      <div
        className={cn(
          "grid transition-all duration-300 md:!grid-rows-[1fr] md:!opacity-100",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="pt-3">
            {/* passenger / parcel switch — a lime panel slides under the
                selected side, so the state is obvious at a glance */}
            <div className="gh-seg mb-4" role="tablist" aria-label="What are you sending">
              <span
                aria-hidden
                className="gh-seg-pill"
                style={{ transform: `translateX(${isParcel ? "calc(100% + 0.25rem)" : "0"})` }}
              />
              {(["passenger", "parcel"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  data-on={mode === m}
                  onClick={() => onMode(m)}
                  className="gh-seg-btn"
                >
                  {m === "passenger" ? <Armchair className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                  {m === "passenger" ? "Passenger" : "Parcel"}
                </button>
              ))}
            </div>

            {/* route */}
            <div className="space-y-2.5">
              {/* the destination carries a label like every other field on the
                  card. Without one it read as a stray button floating under
                  the tab switch. */}
              <span className="gh-sub-lab" id="destinationLabel">
                {isParcel ? "Parcel goes to" : "Destination"}
              </span>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <CityPicker
                    id="destination"
                    labelledBy="destinationLabel"
                    value={d.destination}
                    onChange={(city) => set("destination", city)}
                    placeholder="Select your destination city"
                  />
                </div>
                <button
                  type="button"
                  onClick={swap}
                  aria-label="Swap pickup and destination"
                  className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-xl border bg-white text-neutral-500 transition-colors hover:border-neutral-400 hover:text-ink"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* when */}
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <label className="gh-field">
                <Calendar className="h-[18px] w-[18px] shrink-0 text-neutral-400" />
                <select value={d.when} onChange={(e) => set("when", e.target.value as Draft["when"])}>
                  <option value="today">Today</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="any">Any day</option>
                </select>
              </label>
              <label className="gh-field">
                <Clock className="h-[18px] w-[18px] shrink-0 text-neutral-400" />
                <select value={d.slot} onChange={(e) => set("slot", e.target.value)}>
                  {SLOTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {/* seats + luggage, or weight + size */}
            <AnimatePresence mode="wait" initial={false}>
              {isParcel ? (
                <motion.div
                  key="parcel"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="mt-2.5 space-y-2.5"
                >
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="gh-field">
                      <Scale className="h-4 w-4 shrink-0 text-lime" />
                      <input
                        type="number" min={1} max={200} inputMode="decimal"
                        value={d.weightKg}
                        onChange={(e) => set("weightKg", e.target.value)}
                        placeholder="Weight"
                        required
                      />
                      <span className="shrink-0 text-[11.5px] font-bold text-neutral-400">kg</span>
                    </label>
                    <label className="gh-field">
                      <Package className="h-4 w-4 shrink-0 text-amber-500" />
                      <select value={d.size} onChange={(e) => set("size", e.target.value)}>
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                      </select>
                    </label>
                  </div>
                  <label className="gh-field">
                    <Info className="h-[18px] w-[18px] shrink-0 text-neutral-400" />
                    <input
                      value={d.description}
                      onChange={(e) => set("description", e.target.value)}
                      placeholder="What is inside? e.g. 2 boxes of clothing"
                      maxLength={140}
                    />
                  </label>
                </motion.div>
              ) : (
                <motion.div
                  key="pax"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="mt-2.5 grid grid-cols-2 gap-2.5"
                >
                  {/* The seat field is ICON + TEXT + STEPPER in one 46px row.
                      The text used to be flex-1 with no min-width, so it was
                      squeezed to a narrow column between the icon and the two
                      step buttons; min-w-0 plus a tighter step size lets it
                      read normally without ever shrinking. */}
                  <div className="gh-field gh-seat">
                    <Armchair className="h-4 w-4 shrink-0 text-lime" />
                    <span className="gh-seat-txt">
                      {d.seats} seat{d.seats === 1 ? "" : "s"}
                    </span>
                    <span className="gh-stepper">
                      <button type="button" aria-label="One fewer seat"
                        onClick={() => set("seats", Math.max(1, d.seats - 1))}
                        className="grid h-6 w-6 place-items-center rounded-md border text-neutral-500 transition hover:border-neutral-400 hover:text-ink disabled:opacity-30"
                        disabled={d.seats <= 1}>
                        <Minus className="h-3 w-3" />
                      </button>
                      <button type="button" aria-label="One more seat"
                        onClick={() => set("seats", Math.min(4, d.seats + 1))}
                        className="grid h-6 w-6 place-items-center rounded-md border text-neutral-500 transition hover:border-neutral-400 hover:text-ink disabled:opacity-30"
                        disabled={d.seats >= 4}>
                        <Plus className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                  <label className="gh-field">
                    <Briefcase className="h-4 w-4 shrink-0 text-amber-500" />
                    <select value={d.luggage} onChange={(e) => set("luggage", e.target.value as Draft["luggage"])}>
                      <option value="hand">Hand luggage</option>
                      <option value="boot">Boot space</option>
                      <option value="trailer">Trailer</option>
                    </select>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            <button type="submit" className="gh-btn gh-btn-lime mt-4 w-full">
              {done ? (
                <><Check className="h-4 w-4" /> Finding your hike…</>
              ) : isParcel ? (
                <><Package className="h-4 w-4" /> Send my parcel</>
              ) : (
                <><Search className="h-4 w-4" /> Find a hike <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
