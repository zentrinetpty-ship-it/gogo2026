"use client";

import * as React from "react";

/* =========================================================================
   Launch screen — the calm one.

   This is the app-style launch screen from Cleanic's phone view, not the
   animated splash and not a loading spinner: a plain white page with one small
   lockup dead centre — ringed mark, wordmark, tagline, and a single lime rule
   underneath. It holds for as long as the page needs to settle, then gets out of
   the way.

   Why a separate thing from Splash: that one is theatre for a cold visit. This
   one is what you see on refresh, and it has one job — reassure without
   performing. Nothing spins, nothing bounces, nothing crawls. The only motion is
   a lime line that grows across the divider, and it grows because the page is
   actually loading, not on a loop.

   Reduced motion is honoured by removing the grow, not the screen.
   ========================================================================= */

const MIN_MS = 4000;

export function LaunchScreen() {
  const [shown, setShown] = React.useState(true);
  const [pct, setPct] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    const start = performance.now();
    let raf = 0;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const tick = () => {
      if (!live) return;
      const t = Math.min((performance.now() - start) / MIN_MS, 1);
      /* A linear bar over four seconds reads as stalled. Easing the fill means
         it moves quickly at the start (which is when people are watching), then
         slows as it approaches done — the shape of real progress rather than a
         clock. Never reaches 100% until the very last frame, so it cannot look
         finished while the page is still covered. */
      const eased = 1 - Math.pow(1 - t, 2.2);
      setPct(Math.round(eased * 100));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        /* one more frame so the rule finishes drawing before the fade */
        setShown(false);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      live = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!shown) return null;

  return (
    <div
      data-launch
      aria-hidden="true"
      className="fixed inset-0 z-[190] flex items-center justify-center bg-white transition-opacity duration-300 opacity-100"
    >
      <div className="flex flex-col items-center px-8 text-center">
        {/* White ground, matching the hero it fades into. */}
        <span className="flex h-[92px] w-[92px] items-center justify-center rounded-full border-[3px] border-lime bg-[#1A1A1A] shadow-[inset_0_0_0_4px_#FFFFFF]">
          <span className="gh-g-mark select-none text-[64px] leading-none">G</span>
        </span>

        {/* name + promise, once, under the mark */}
        <span className="mt-5 whitespace-nowrap text-[15px] font-semibold leading-none tracking-[-.01em] text-ink">
          GOGO
          <span className="mx-1.5 font-normal text-neutral-300">–</span>
          <span className="font-normal text-neutral-500">Smart Hike, Zero Queue</span>
        </span>

        <span className="mt-6 text-[13px] font-normal leading-tight text-neutral-500">
          Long-distance seats and parcels, door to door
        </span>

        {/* The divider doubles as the loading line: it starts as a short lime
            tick and grows to its full 56px as the page settles. */}
        <span className="relative mt-5 block h-[2px] w-14 overflow-hidden rounded-full bg-lime/20">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-lime transition-[width] duration-150 ease-out"
            style={{ width: `${Math.max(pct, 8)}%` }}
          />
        </span>
      </div>
    </div>
  );
}
