import * as React from "react";
import {
  MapPin,
  Bell,
  Search,
  SlidersHorizontal,
  Car,
  CalendarClock,
  Package,
  Users,
  Route,
  ChevronDown,
  ArrowRight,
  Armchair,
} from "lucide-react";
import { AnimatedNavFramer } from "@/components/animated-nav-framer";
import { BookingCard, type Mode } from "@/components/booking-card";
import { GoGoLogo } from "@/components/logo";
import { LaunchScreen } from "@/components/launch-screen";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { GogoHeroMap } from "@/components/gogo-hero-map";
import { cn } from "@/lib/utils";
import { getActiveCity, getHomeCity, setBookingCity } from "@/lib/city";
import { displayCity } from "@/lib/towns";

/* =========================================================================
   Home.

   A light, quiet screen: white ground, near-black type, and lime used only
   where it means something (the live dot, the active tab, the one primary
   action). The reference this follows is almost entirely greyscale, which is
   what makes it feel calm — so the lime here is a highlight, never a fill.

   Order of the page, top to bottom:
     1. location bar      — where the rider is, and a way to change it
     2. greeting          — who we are talking to
     3. search            — the one thing most people came to do
     4. choose your ride  — the two ways to book, side by side
     5. services          — what GOGO actually offers, in a quiet grid
     6. routes            — the hikes people are booking now

   Nothing here computes a price. The API is the only source of money, and
   this screen only shows what it is told.
   ========================================================================= */

type Service = {
  id: string;
  label: string;
  blurb: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
  href: string;
};

/* GOGO's real services. Bike Ride / Luxury Car / Hourly Rent from the reference
   are deliberately absent: this is a long-distance shuttle, not an urban
   ride-hail, and offering a service the fleet cannot deliver is worse than
   leaving it out. What is here maps to something we actually run. */
const SERVICES: Service[] = [
  {
    id: "seat",
    label: "Passenger",
    blurb: "A seat on a hike",
    Icon: Car,
    href: "/gogo/rides.html",
  },
  {
    id: "parcel",
    label: "Parcel",
    blurb: "Send in a boot",
    Icon: Package,
    href: "/gogo/parcel.html",
  },
  {
    id: "schedule",
    label: "Reserve",
    blurb: "Book for later",
    Icon: CalendarClock,
    href: "/gogo/rides.html?when=later",
  },
  {
    id: "group",
    label: "Group",
    blurb: "Seats together",
    Icon: Users,
    href: "/gogo/rides.html?seats=4",
  },
  {
    id: "routes",
    label: "Routes",
    blurb: "Where we go",
    Icon: Route,
    href: "/gogo/why.html",
  },
];

type Ride = {
  id: string;
  from: string;
  to: string;
  depart: string;
  vehicle: string;
  seats: number;
  legs?: Record<string, number>;
};

export default function App() {
  const [rides, setRides] = React.useState<Ride[]>([]);
  /* Tracks whether /api/rides has answered — success OR failure. Without this the
     routes section cannot tell "still waiting" from "answered with nothing", and
     would show the loading skeleton forever on an empty or failed response. */
  const [ridesLoaded, setRidesLoaded] = React.useState(false);
  /* Whether the booking form has expanded. Lifted here because the hero has to
     react to it: once the form opens the card needs the space more than the
     marketing copy does. */
  const [formOpen, setFormOpen] = React.useState(false);
  /* The town the rider is booking from, once their address resolves. Null means
     "no address chosen yet", which is different from "chose a town we don't
     serve" — the list shows everything before a choice, and the honest empty
     state after an unmatched one. */
  /* The landing page shows the ACTIVE city: the town of the address most
     recently typed, falling back to the rider's home city. Read on mount so a
     returning visitor sees their own town before touching anything — and read
     from the store rather than a default, because "no city" and "their city"
     produce different ride lists. */
  const [bookingCity, setBookingCityState] = React.useState<string | null>(
    () => (typeof window === "undefined" ? null : getActiveCity())
  );
  const [homeCity] = React.useState<string | null>(
    () => (typeof window === "undefined" ? null : getHomeCity())
  );

  /* A resolved pick-up writes the BOOKING city only. The home city is never
     touched here: booking a trip from another town is not a change of address. */
  const rememberCity = React.useCallback((city: string | null) => {
    setBookingCityState(city);
    if (city) setBookingCity(city);
  }, []);
  /* The pickup address is the rider's own street, remembered between visits —
     most people are collected from the same place every time, and retyping it
     on a phone is the slowest part of booking. */
  const [pickup, setPickup] = React.useState(() => {
    try {
      return localStorage.getItem("gogo_pickup") || "";
    } catch {
      return "";
    }
  });

  const rememberPickup = React.useCallback((v: string) => {
    setPickup(v);
    try {
      localStorage.setItem("gogo_pickup", v);
    } catch {
      /* a blocked store just means it is not remembered next time */
    }
  }, []);

  /* Passenger or parcel. The booking card and the service shortcuts both read
     this, so tapping "Parcel" in Services opens the card already in that mode. */
  const [mode, setMode] = React.useState<Mode>("passenger");

  /* The catalogue comes from the server so the money shown on the cards is the
     money the server will charge. If it fails, the page still works — the
     routes section simply stays empty rather than inventing figures. */
  React.useEffect(() => {
    let live = true;
    fetch("/api/rides")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (live && Array.isArray(d?.rides)) setRides(d.rides);
      })
      .catch(() => {
        /* leaving the list empty is the honest failure: no invented prices */
      })
      .finally(() => {
        /* answer received either way — stop the skeleton */
        if (live) setRidesLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-white">
      <LaunchScreen />
      <PullToRefresh />

      {/* ── map backdrop ────────────────────────────────────────────────
             A street map behind the whole hero, in the reference's treatment:
             white roads on pale ground, flat mint parks, no depth cues. It sits
             at z-0 and is pointer-events:none, so it is purely atmosphere — the
             booking card and every tap still own their space. The fade at the
             bottom of .gh-mapfield::after is what keeps the card readable
             without putting a solid panel over the streets. */}
      <div className="gh-mapfield" aria-hidden="true">
        <GogoHeroMap />
      </div>

      <AnimatedNavFramer />
      <Header />

      {/* ── HERO ──────────────────────────────────────────────────────────
             The page is a column pinned to the bottom of the screen. The hero
             copy and the two ride cards fill the space above the booking field,
             so the field sits low on first view and everything above it is
             story — which is what makes a first screen feel intentional rather
             than empty.

             When the rider starts typing, the card grows upward over this
             content instead of pushing it down (see BookingCard's `open`
             state): on a phone the form is a sheet, and a sheet rises. */}
      <div className="flex flex-1 flex-col justify-end">
        <div className="mx-auto w-full max-w-[520px] px-5 md:max-w-[560px] md:px-6">
          {/* ── the hero steps aside ──────────────────────────────────────
              When the booking form opens, the hero is collapsed away. Two
              reasons: the expanded card plus the phone keyboard needs every
              pixel, and marketing copy competing with a form the rider is
              actively filling in is noise.

              Collapsed with a height/opacity transition rather than unmounted —
              unmounting would drop the `gh-rise` animation state and snap the
              layout. `overflow-hidden` + `max-h-0` means it takes no space but
              keeps its box, so the card below glides up instead of jumping. */}
          <div
            className={cn(
              "overflow-hidden transition-[max-height,opacity] duration-300 ease-out",
              formOpen ? "max-h-0 opacity-0" : "max-h-[520px] opacity-100"
            )}
            aria-hidden={formOpen}
          >
            <div className="gh-rise"><HeroCopy /></div>
            <div className="gh-rise gh-rise-1"><ChooseYourRide pickup={pickup} mode={mode} onMode={setMode} /></div>
          </div>
        </div>
      </div>

      {/* the booking card, at the bottom of the column */}
      <div className="relative z-20 mx-auto w-full max-w-[520px] px-5 md:max-w-[560px] md:px-6">
        <div className="gh-rise gh-rise-2"><BookingCard mode={mode} onMode={setMode} onOpenChange={setFormOpen} onCityResolved={rememberCity} /></div>
      </div>

      {/* the rest of the page scrolls below the fold */}
      <div className="mx-auto w-full max-w-[520px] scroll-mt-24 px-5 pb-[calc(96px+env(safe-area-inset-bottom))] pt-7 md:max-w-[560px] md:px-6">
        <div className="gh-rise gh-rise-3"><ServicesGrid /></div>
        <div className="gh-rise gh-rise-4"><RoutesList rides={rides} pickup={pickup} loaded={ridesLoaded} city={bookingCity} /></div>

        {/* ── the closing call to action ───────────────────────────────────
               Borrowed from Cleanic's reviews page, where it closes the page
               with a dark panel and one lime button. On GOGO it does the same
               job: after someone has scanned hikes and services, give them one
               obvious next step and tell them what it costs. Colours are taken
               from that section rather than invented — #1A1A1A ground, white
               heading, 65%-white supporting line, and the lime reserved for the
               single button so it is the only thing that glows. */}
        <section className="mt-9 rounded-[24px] bg-[#1A1A1A] px-5 py-6 text-center">
          <h2 className="text-[18px] font-bold leading-tight text-white">
            Join them
          </h2>
          <p className="mx-auto mt-1.5 max-w-[19rem] text-[13px] font-normal leading-relaxed text-white/65">
            First pickup is free. Pay cash or card on the first delivery.
          </p>
          <a
            href="/gogo/rides.html"
            className="mt-5 inline-flex h-[46px] items-center justify-center rounded-full bg-lime px-7 text-[14px] font-semibold text-[#1A1A1A] transition-opacity hover:opacity-90"
          >
            Book your first pickup
          </a>
        </section>
      </div>
    </div>
  );
}

/* ── hero copy ───────────────────────────────────────────────────────────── */

/* ── header ──────────────────────────────────────────────────────────────── */
function Header() {
  return (
    /* No bar, no border, no blur: the controls sit directly on the page's own
       ground. A header band drew a line across the hero before anyone read a
       word of it, and on a white page it was a line around nothing. */
    <header className="relative z-40">
      <div className="mx-auto flex h-[62px] w-full max-w-[520px] items-center justify-end px-5 md:max-w-[560px] md:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white"
          >
            <Bell className="h-[17px] w-[17px] text-ink" strokeWidth={1.9} />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-lime ring-2 ring-white" />
          </button>
          <a
            href="/gogo/auth.html"
            className="flex h-9 items-center rounded-full bg-lime px-4 text-[12.5px] font-semibold text-[#1A1A1A]"
          >
            Sign in
          </a>
        </div>
      </div>
    </header>
  );
}

/* The logo is the hero now. Wordmark, then the promise as its tagline, then one
   supporting line. Nothing else competes with it at the top of the page. */
function HeroCopy() {
  return (
    <div className="pb-5">
      {/* The mark is back in the hero, centred — the same lockup the launch
          screen shows, so the load screen and the page read as one thing. */}
      <div className="flex flex-col items-center text-center">
        <span className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full border-[3px] border-lime bg-[#1A1A1A] shadow-[inset_0_0_0_4px_#FFFFFF]">
          {/* 58px, not 66: the inset white ring takes 4px off the inside edge,
              and at 66 the G's bowl touched it. */}
          <span className="gh-g-mark select-none text-[58px] leading-none">G</span>
        </span>

        {/* Smaller but heavier: the promise is a label, not a sentence, so it
            earns attention through weight and a tight cap-height rather than
            size. The name keeps its size so the two read as one line. */}
        <span className="mt-4 whitespace-nowrap text-[15px] leading-none tracking-[-.005em]">
          <span className="font-bold text-ink">GOGO</span>
          <span className="mx-1.5 font-normal text-neutral-300">–</span>
          <span className="font-semibold text-neutral-600">Smart Hike, Zero Queue</span>
        </span>
      </div>

      <p className="mt-7 max-w-[24rem] text-center text-[13.5px] font-normal leading-relaxed text-neutral-500">
        We collect you at your gate and drive you town to town. Sending a parcel
        works the same way: it goes in a boot that is already heading your way.
      </p>
    </div>
  );
}

/* ── 2. greeting ─────────────────────────────────────────────────────────── */
function Greeting() {
  return (
    <div className="mt-7">
      <h1 className="text-[30px] font-extrabold leading-[1.08] tracking-[-.02em] text-ink">
        Go when you want,
        <br />
        <span className="gh-quiet">anywhere.</span>
      </h1>
    </div>
  );
}

/* ── 3. search ───────────────────────────────────────────────────────────── */
function SearchRow({ pickup }: { pickup: string }) {
  return (
    <form
      action="/gogo/rides.html"
      className="mt-6 flex items-center gap-2.5"
      onSubmit={(e) => {
        /* the field posts its value as ?to=, and the pickup rides along as
           ?pickup=, so the ride page opens already knowing both ends and the
           rider never retypes what they have already told us. */
        e.preventDefault();
        const input = (e.currentTarget.elements.namedItem("to") as HTMLInputElement) || null;
        const q = input?.value.trim() || "";
        const params = new URLSearchParams();
        if (q) params.set("to", q);
        if (pickup.trim()) params.set("pickup", pickup.trim());
        const qs = params.toString();
        window.location.href = `/gogo/rides.html${qs ? `?${qs}` : ""}`;
      }}
    >
      <label className="relative flex h-[52px] flex-1 items-center rounded-full border border-neutral-200 bg-white pl-4 pr-3 focus-within:border-ink">
        <Search className="mr-2.5 h-[17px] w-[17px] shrink-0 text-neutral-400" strokeWidth={2} />
        <input
          name="to"
          type="text"
          placeholder="Where to?"
          aria-label="Where to?"
          className="w-full bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-neutral-400"
        />
      </label>

      <button
        type="submit"
        aria-label="Filter rides"
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-ink text-white"
      >
        <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
    </form>
  );
}

/* ── 4. choose your ride ─────────────────────────────────────────────────── */
function ChooseYourRide({
  pickup,
  mode,
  onMode,
}: {
  pickup: string;
  mode: Mode;
  onMode: (m: Mode) => void;
}) {
  const qs = pickup.trim() ? `?pickup=${encodeURIComponent(pickup.trim())}` : "";

  return (
    <section className="pb-5">
      <SectionHead title="What are you sending?" />

      {/* Two big choices, acting as the segmented control for the booking card
          below. Previously this pair was Ride / Schedule, and the card carried
          its own Passenger / Parcel switch — two different ways to answer one
          question, one of them buried inside the form. The mode now lives here,
          where it is the first thing a rider sees, and the card stays a card. */}
      <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-neutral-100 p-1.5" role="tablist" aria-label="What are you sending">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "passenger"}
          onClick={() => onMode("passenger")}
          className={cn(
            "group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 active:scale-[.97]",
            mode === "passenger"
              ? "border-[#1A1A1A] bg-[#1A1A1A] shadow-[0_10px_24px_-12px_rgba(26,26,26,.55)]"
              : "border-transparent bg-transparent hover:bg-white/70"
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
              mode === "passenger" ? "bg-lime text-[#1A1A1A] shadow-[0_0_0_3px_rgba(163,230,53,.16)]" : "bg-neutral-200/70 text-ink"
            )}
          >
            <Car className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block text-[14px] font-bold leading-none",
                mode === "passenger" ? "text-white" : "text-ink"
              )}
            >
              Ride
            </span>
            <span
              className={cn(
                "mt-1 flex items-center gap-1.5 text-[11px] font-medium leading-tight",
                mode === "passenger" ? "text-white/60" : "text-neutral-500"
              )}
            >
              {/* live dot: seats are actually available on a hike leaving today */}
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
              Next hike 06:30
            </span>
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mode === "parcel"}
          onClick={() => onMode("parcel")}
          className={cn(
            "group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 active:scale-[.97]",
            mode === "parcel"
              ? "border-[#1A1A1A] bg-[#1A1A1A] shadow-[0_10px_24px_-12px_rgba(26,26,26,.55)]"
              : "border-transparent bg-transparent hover:bg-white/70"
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
              mode === "parcel" ? "bg-lime text-[#1A1A1A] shadow-[0_0_0_3px_rgba(163,230,53,.16)]" : "bg-neutral-200/70 text-ink"
            )}
          >
            <Package className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block text-[14px] font-bold leading-none",
                mode === "parcel" ? "text-white" : "text-ink"
              )}
            >
              Parcel
            </span>
            <span
              className={cn(
                "mt-1 block truncate text-[11px] font-medium leading-tight",
                mode === "parcel" ? "text-white/60" : "text-neutral-500"
              )}
            >
              In a boot going there
            </span>
          </span>
        </button>
      </div>

      {/* the link through to the full list, on its own line so the two big
          buttons stay the primary action */}
      <a
        href={`/gogo/rides.html${qs}`}
        className="mt-3 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-neutral-500 hover:text-ink"
      >
        See all hikes
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
      </a>
    </section>
  );
}

/* ── 5. services ─────────────────────────────────────────────────────────── */
function ServicesGrid() {
  return (
    <section className="mt-8">
      <SectionHead title="Services" action={{ label: "See all", href: "/gogo/why.html" }} />

      <div className="mt-3 grid grid-cols-5 gap-2">
        {SERVICES.map(({ id, label, blurb, Icon, href }) => (
          <a
            key={id}
            href={href}
            className="group flex flex-col items-center gap-1.5 rounded-2xl py-1 text-center outline-none"
            title={blurb}
          >
            {/* Dark tiles, matching the selected Ride/Parcel state on the booking
                card. Five white squares in a row read as filler; five charcoal
                ones read as a set of tools, and the lime icon on dark is the same
                pairing the rest of the page uses. */}
            <span className="flex h-[46px] w-[46px] items-center justify-center rounded-2xl bg-ink transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-lime group-focus-visible:ring-offset-2">
              <Icon className="h-[18px] w-[18px] text-lime" strokeWidth={1.9} />
            </span>
            <span className="text-[10.5px] font-semibold leading-none text-neutral-600 transition-colors group-hover:text-ink">
              {label}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ── 6. routes ───────────────────────────────────────────────────────────── */
function RoutesList({
  rides,
  pickup,
  loaded,
  city,
}: {
  rides: Ride[];
  pickup: string;
  loaded: boolean;
  city: string | null;
}) {
  /* Filter to the town the rider is booking from. Before an address is chosen
     (city === null) everything is shown, because the list is still discovery.
     Once a town is known, only hikes leaving that town are relevant — showing
     a Mthatha departure to someone standing in East London is noise. */
  const shown = city ? rides.filter((r) => r.from === city) : rides;

  return (
    <section className="mt-8">
      <SectionHead
        title={city ? `Leaving soon · ${displayCity(city)}` : "Leaving soon"}
        action={{ label: "See all", href: "/gogo/rides.html" }}
      />

      {/* ── loading ──────────────────────────────────────────────────────
          Only while we are actually waiting. Once the request has answered —
          with rides or with nothing — this clears, so a failed or empty API can
          never leave a permanent skeleton on screen. */}
      {!loaded && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="flex items-center gap-2 px-1 pb-2">
            <span className="gh-pulse-seat h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />
            <span className="text-[12px] font-semibold text-ink">Now loading</span>
            <span className="text-[12px] font-normal text-neutral-400">
              checking seats
            </span>
          </div>

          {[0, 1].map((i) => (
            <div
              key={i}
              className="gh-skeleton mb-2.5 flex items-center gap-3.5 rounded-3xl border border-neutral-100 bg-white p-3.5"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-neutral-100" />
              <span className="flex-1">
                <span className="block h-3 w-2/3 rounded-full bg-neutral-100" />
                <span className="mt-2 block h-2.5 w-1/2 rounded-full bg-neutral-100" />
              </span>
              <span className="h-7 w-12 rounded-full bg-neutral-100" />
            </div>
          ))}
        </div>
      )}

      <ul className="mt-3 space-y-2.5">
        {shown.map((r) => {
          const params = new URLSearchParams({ rideId: r.id });
          if (pickup.trim()) params.set("pickup", pickup.trim());
          /* Seats are the thing a rider actually needs to decide on, so they get
             the right-hand slot as a number, not a sentence buried in the meta
             line. Colour carries the urgency: lime when there is room, amber
             under four, red for a last seat. */
          const tight = r.seats <= 1;
          const filling = r.seats > 1 && r.seats <= 3;
          return (
          <li key={r.id}>
            <a
              href={`/gogo/ride.html?${params.toString()}`}
              className="flex items-center gap-3.5 rounded-3xl border border-neutral-200 bg-white p-3.5 transition-all duration-200 hover:border-ink active:scale-[.99]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink">
                <Car className="h-[19px] w-[19px] text-lime" strokeWidth={1.9} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[14px] font-bold leading-tight text-ink">
                  {r.from}
                  <ArrowRight className="h-3 w-3 shrink-0 text-neutral-400" strokeWidth={2.6} />
                  {r.to}
                </span>
                <span className="mt-1 block truncate text-[12px] font-medium text-neutral-500">
                  {r.depart} · {r.vehicle}
                </span>
              </span>

              {/* Seat count with a chair. This is the number a rider is actually
                  deciding on, so it gets the icon the loading state no longer
                  uses — the chair means "seat" everywhere on this page, once. */}
              <span className="flex shrink-0 flex-col items-end">
                <span
                  className={cn(
                    "flex h-8 min-w-[2.6rem] items-center justify-center gap-1 rounded-full px-2 text-[13px] font-bold tabular-nums",
                    tight
                      ? "bg-red-50 text-red-600"
                      : filling
                        ? "bg-amber-50 text-amber-700"
                        : "bg-lime/15 text-ink"
                  )}
                >
                  <Armchair className="h-[13px] w-[13px]" strokeWidth={2} aria-hidden="true" />
                  {r.seats}
                </span>
                <span className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[.08em] text-neutral-400">
                  {r.seats === 1 ? "seat left" : "seats left"}
                </span>
              </span>
            </a>
          </li>
          );
        })}
      </ul>

      {/* Answered, and genuinely nothing: say so rather than leaving a bare
          heading that looks like a rendering fault. */}
      {loaded && shown.length === 0 && (
        <p className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[12.5px] font-medium text-neutral-500">
          {city
            ? `No hikes leaving ${displayCity(city)} right now. Check back shortly.`
            : "No hikes scheduled right now. Check back shortly."}
        </p>
      )}
    </section>
  );
}

/* ── shared ──────────────────────────────────────────────────────────────── */
function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[15.5px] font-extrabold tracking-[-.01em] text-ink">{title}</h2>
      {action && (
        <a href={action.href} className="text-[12.5px] font-semibold text-neutral-500 hover:text-ink">
          {action.label}
        </a>
      )}
    </div>
  );
}
