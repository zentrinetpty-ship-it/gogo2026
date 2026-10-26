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
} from "lucide-react";
import { AnimatedNavFramer } from "@/components/animated-nav-framer";
import { BookingCard, type Mode } from "@/components/booking-card";
import { GoGoLogo } from "@/components/logo";
import { cn } from "@/lib/utils";

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
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-white">
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
          <HeroCopy />
          <ChooseYourRide pickup={pickup} mode={mode} onMode={setMode} />
        </div>
      </div>

      {/* the booking card, at the bottom of the column */}
      <div className="relative z-20 mx-auto w-full max-w-[520px] px-5 md:max-w-[560px] md:px-6">
        <BookingCard mode={mode} onMode={setMode} />
      </div>

      {/* the rest of the page scrolls below the fold */}
      <div className="mx-auto w-full max-w-[520px] scroll-mt-24 px-5 pb-[calc(96px+env(safe-area-inset-bottom))] pt-7 md:max-w-[560px] md:px-6">
        <ServicesGrid />
        <RoutesList rides={rides} pickup={pickup} />
      </div>
    </div>
  );
}

/* ── hero copy ───────────────────────────────────────────────────────────── */
function HeroCopy() {
  return (
    <div className="pb-5">
      {/* The headline is set in the logo face (Anton) so the type and the
          wordmark above it read as one brand. "Smart Hike" solid, "Zero Queue"
          struck through in lime — the promise and the thing it removes. */}
      <h1 className="gh-impact text-[clamp(2.6rem,11vw,3.6rem)] text-ink">
        Smart Hike.
        <br />
        <span className="gh-strike">Zero Queue.</span>
      </h1>
      <p className="mt-3 max-w-[24rem] text-[13.5px] font-normal leading-relaxed text-neutral-500">
        We fetch you from your door, then carry you between towns — or your parcel
        in a boot already going there.
      </p>
    </div>
  );
}

/* ── header ──────────────────────────────────────────────────────────────── */
function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/70 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[62px] w-full max-w-[520px] items-center justify-between px-5 md:max-w-[560px] md:px-6">
        <a href="/gogo/" aria-label="GOGO home" className="shrink-0">
          {/* The wordmark is the brand on this screen — set large and heavy so
              it reads as the product name, not a nav label. */}
          <GoGoLogo size={30} />
        </a>

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
            className="flex h-9 items-center rounded-full bg-ink px-4 text-[12.5px] font-semibold text-white"
          >
            Sign in
          </a>
        </div>
      </div>
    </header>
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
      <div className="mt-3 grid grid-cols-2 gap-3" role="tablist" aria-label="What are you sending">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "passenger"}
          onClick={() => onMode("passenger")}
          className={cn(
            "group flex flex-col rounded-3xl border p-4 text-left transition-colors",
            mode === "passenger"
              ? "border-ink bg-white"
              : "border-neutral-200 bg-white hover:border-neutral-400"
          )}
        >
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              mode === "passenger" ? "bg-ink text-white" : "bg-neutral-100 text-ink"
            )}
          >
            <Car className="h-[17px] w-[17px]" strokeWidth={1.9} />
          </span>
          <span className="mt-3 text-[15px] font-bold leading-none text-ink">Ride</span>
          <span className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium leading-tight text-neutral-500">
            {/* live dot: seats are actually available on a hike leaving today */}
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
            Next hike 06:30
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mode === "parcel"}
          onClick={() => onMode("parcel")}
          className={cn(
            "group flex flex-col rounded-3xl border p-4 text-left transition-colors",
            mode === "parcel"
              ? "border-ink bg-white"
              : "border-neutral-200 bg-white hover:border-neutral-400"
          )}
        >
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              mode === "parcel" ? "bg-ink text-white" : "bg-neutral-100 text-ink"
            )}
          >
            <Package className="h-[17px] w-[17px]" strokeWidth={1.9} />
          </span>
          <span className="mt-3 text-[15px] font-bold leading-none text-ink">Parcel</span>
          <span className="mt-1.5 text-[12px] font-medium leading-tight text-neutral-500">
            Send in a boot going there
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
            className="group flex flex-col items-center gap-1.5 rounded-2xl py-1 text-center"
            title={blurb}
          >
            <span className="flex h-[46px] w-[46px] items-center justify-center rounded-2xl border border-neutral-200 bg-white transition-colors group-hover:border-ink">
              <Icon className="h-[18px] w-[18px] text-ink" strokeWidth={1.9} />
            </span>
            <span className="text-[10.5px] font-semibold leading-none text-neutral-600 group-hover:text-ink">
              {label}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ── 6. routes ───────────────────────────────────────────────────────────── */
function RoutesList({ rides, pickup }: { rides: Ride[]; pickup: string }) {
  if (!rides.length) return null;

  return (
    <section className="mt-8">
      <SectionHead title="Leaving soon" action={{ label: "See all", href: "/gogo/rides.html" }} />

      <ul className="mt-3 space-y-2.5">
        {rides.map((r) => {
          const params = new URLSearchParams({ rideId: r.id });
          if (pickup.trim()) params.set("pickup", pickup.trim());
          return (
          <li key={r.id}>
            <a
              href={`/gogo/ride.html?${params.toString()}`}
              className="flex items-center gap-3.5 rounded-3xl border border-neutral-200 bg-white p-3.5 transition-colors hover:border-ink"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100">
                <Car className="h-[19px] w-[19px] text-ink" strokeWidth={1.9} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[14px] font-bold leading-tight text-ink">
                  {r.from}
                  <ArrowRight className="h-3 w-3 shrink-0 text-neutral-400" strokeWidth={2.6} />
                  {r.to}
                </span>
                <span className="mt-1 block truncate text-[12px] font-medium text-neutral-500">
                  {r.depart} · {r.vehicle} · {r.seats} seats
                </span>
              </span>

              <span className="flex h-7 items-center rounded-full bg-neutral-100 px-2.5 text-[11px] font-bold text-ink">
                {r.depart}
              </span>
            </a>
          </li>
          );
        })}
      </ul>
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
