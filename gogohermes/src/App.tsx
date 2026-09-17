import * as React from "react";
import { motion } from "framer-motion";
import { MapPin, Package } from "lucide-react";
import { AnimatedNavFramer } from "@/components/animated-nav-framer";
import { BookingCard, type Mode } from "@/components/booking-card";
import { LiveMap } from "@/components/live-map";
import { GoGoLogo } from "@/components/logo";
import { AccountButton, MobileAccountButton } from "@/components/account-button";

const FADE = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.2, 0.8, 0.2, 1] } },
};
const STAGGER = { show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };

export default function App() {
  /* the mode lives here so the hero buttons and the card stay in step */
  const [mode, setMode] = React.useState<Mode>(() => {
    try {
      const raw = localStorage.getItem("gogo_hermes_draft_v1");
      return raw ? (JSON.parse(raw).mode as Mode) || "passenger" : "passenger";
    } catch { return "passenger"; }
  });

  /* One screen, no scroll. min-h-dvh matches the viewport including the mobile
     address bar; pb-24 used to add 96px below the hero, pushing the page past
     the fold — which is what made the map look short. */
  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-white pt-[68px] md:min-h-[100svh] md:pb-0">
      <AnimatedNavFramer />

      <TopBar />

      {/* mobile: Login sits top-right, over the map */}
      <MobileCtas onMode={setMode} />

      {/* the landing is deliberately one screen: the booking card over the map,
          with the hero copy under it. No page footer here — that belongs on the
          inner pages. Everything else lives on /gogo/why, /gogo/rides,
          /gogo/driver, so this stays clean and compact. */}
      <Hero mode={mode} onMode={setMode} />
    </div>
  );
}

/* ── mobile only: Login, top right ─────────────────────────────────────── */
function MobileCtas({ onMode }: { onMode: (m: Mode) => void }) {
  return (
    <div className="fixed right-4 top-4 z-40 flex flex-col items-end gap-2 md:hidden">
      <MobileAccountButton />
    </div>
  );
}

/* ── the thin bar across the top: wordmark left, login right ───────────── */
function TopBar() {
  return (
    <header className="gh-topbar fixed inset-x-0 top-0 z-40">
      <div className="container flex h-[68px] items-center justify-between">
        <a href="/gogo/" aria-label="GOGO, book a hike">
          <GoGoLogo size={38} />
        </a>
        {/* Sign in goes to the auth screen. It used to be a dead "#book"
            anchor that only scrolled the page, which is why the button looked
            broken. "next" returns the rider to the booking flow afterwards. */}
        <AccountButton />
      </div>
    </header>
  );
}

/* ── hero: the booking card sits directly on the map ────────────────────── */
function Hero({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  /* The hero fills exactly the space under the top bar on every screen. It was
     min-h-[calc(100dvh-68px)] with md:min-h-0, and that md reset dropped it to
     the content's own height on desktop — 500px in a 569px viewport — leaving
     the map short. A flex column that grows with the viewport fixes it. */
  return (
    <section className="gh-hero relative flex min-h-[calc(100dvh-68px)] flex-1 flex-col overflow-hidden pb-[30rem] pt-4 sm:pb-[32rem] md:min-h-[calc(100svh-68px)] md:pb-12 md:pt-6">
      {/* the live map is the background, under a soft scrim so copy stays legible */}
      <LiveMap />

      {/* the booking card is lifted onto the map itself, not laid over a panel.
          On phones it sits in flow, right at the top of the hero, so opening it
          grows downward over the copy below. */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        <div className="container mx-auto h-full">
          <div className="pointer-events-auto absolute right-5 top-8 hidden w-[27rem] md:block lg:right-[max(1.25rem,calc((100%-1280px)/2+1.25rem))]">
            <BookingCard mode={mode} onMode={onMode} />
          </div>
        </div>
      </div>

      {/* on phones the card is pinned clear of the nav. It is `fixed`, not
          absolute, and its height is capped so an expanded form can never grow
          down into the nav — it scrolls internally instead. The nav occupies
          the bottom 78px (62px tall at bottom-16px), so 104px is the floor and
          the card's max-height stops it short of it. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[104px] z-[30] md:hidden">
        <div className="pointer-events-auto mx-auto max-w-[27rem] px-4">
          <div className="max-h-[calc(100dvh-200px)] overflow-y-auto overscroll-contain no-sb">
            <BookingCard mode={mode} onMode={onMode} />
          </div>
        </div>
      </div>

      <div className="container relative grid items-start gap-12 lg:grid-cols-[1.05fr_minmax(0,27rem)] lg:gap-16">
        <motion.div
          variants={STAGGER}
          initial="hidden"
          animate="show"
          className="pt-2"
        >
          {/* the impact headline — the one heading that wears the display face.
              "Zero Queue." is struck through in lime, as the app sets it. */}
          <motion.h1
            variants={FADE}
            className="gh-impact text-[clamp(3.8rem,10.4vw,7.8rem)]"
            style={{ WebkitTextStroke: "1.1px #0B0B0B" }}
          >
            Smart Hike.
            <br />
            <span className="gh-strike">Zero Queue.</span>
          </motion.h1>

          <motion.p
            variants={FADE}
            className="mt-5 text-[clamp(12.5px,1.5vw,15px)] font-extrabold uppercase tracking-[.07em]"
          >
            Your seat, your{" "}
            <span className="shadow-[inset_0_-3px_0_rgba(141,182,0,.9)]">doorstep</span>
          </motion.p>

          <motion.p
            variants={FADE}
            className="mx-auto mt-6 max-w-[34rem] text-[16.5px] font-medium leading-[1.62] text-neutral-700 md:mx-0"
          >
            <b className="font-extrabold text-ink">We fetch you from your door.</b>
            <br />
            Book a seat on a hike leaving your road, or send a parcel in a boot already going there.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}

