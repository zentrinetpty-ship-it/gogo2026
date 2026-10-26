"use client";

import * as React from "react";

/* =========================================================================
   Splash — the LIGHT one.

   Matches the calm landing splash on cleanic.co.za rather than the dark app
   screen: a warm white-to-lime-tinted radial ground, one slow hub of rings, the
   wordmark, a hairline subtitle and a determinate bar.

   The differences from Cleanic are only the ones that have to be: GOGO's marks
   and words in place of Cleanic's. The geometry, the timings, the easing and the
   light treatment are the same, because that is what makes it read as calm
   rather than as a loading screen shouting at you.

   Structure, outside in:
     - radial ground  #FFFFFF -> #FAFCF4 -> #F4F9E8
     - soft lime glow behind the hub
     - dashed ring, spinning slowly clockwise
     - hairline ring, spinning counter-clockwise
     - an orbiting lime dot
     - two ripples expanding out
     - the mark, dead centre, popping in once

   It unmounts itself and never blocks the page underneath. Reduced motion skips
   it entirely.
   ========================================================================= */

const MIN_MS = 1900;

export function Splash() {
  const [shown, setShown] = React.useState(true);
  const [pct, setPct] = React.useState(0);
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(false);
      return;
    }

    let live = true;
    const start = performance.now();
    let raf = 0;

    const tick = () => {
      if (!live) return;
      const t = Math.min((performance.now() - start) / MIN_MS, 1);
      setPct(Math.round(t * 100));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setLeaving(true);
        setTimeout(() => live && setShown(false), 460);
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
      data-splash
      aria-hidden="true"
      className={`ghs-root fixed inset-0 z-[200] flex items-center justify-center overflow-hidden transition-opacity duration-[460ms] ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* the glow: a wide, weak lime wash so the centre feels lit, not coloured */}
      <div className="ghs-glow pointer-events-none absolute left-1/2 top-[38%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full" />

      {/* rising specks — barely there, they stop the background reading as flat */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="ghs-bub pointer-events-none absolute bottom-0 rounded-full"
          style={{
            left: `${12 + i * 15}%`,
            width: `${5 + (i % 3) * 3}px`,
            height: `${5 + (i % 3) * 3}px`,
            animationDuration: `${7 + (i % 4) * 1.6}s`,
            animationDelay: `${i * 0.9}s`,
          }}
        />
      ))}

      <div className="relative flex flex-col items-center px-6 text-center">
        {/* the hub */}
        <div className="ghs-hub relative mb-2 h-[min(64vw,300px)] w-[min(64vw,300px)]">
          <span className="ghs-ring-dash absolute -inset-[7%] rounded-full" />
          <span className="ghs-ring-thin absolute -inset-[3%] rounded-full" />

          {/* one lime dot travelling the hub's edge */}
          <span className="ghs-orbit absolute inset-0">
            <span className="absolute left-1/2 top-[-9px] -ml-[7px] h-[14px] w-[14px] rounded-full bg-lime" />
          </span>

          <span className="ghs-ripple absolute inset-[8%] rounded-full" />
          <span className="ghs-ripple ghs-r2 absolute inset-[8%] rounded-full" />

          {/* the mark itself, centred */}
          <span className="ghs-badge absolute left-1/2 top-1/2 flex h-[56%] w-[56%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white">
            <span className="flex items-baseline text-[clamp(20px,6vw,34px)] font-black uppercase leading-none tracking-[-.03em] text-ink">
              <span>GO</span>
              <span aria-hidden className="inline-block w-[.09em]" />
              <span className="text-lime-deep">GO</span>
            </span>
          </span>
        </div>

        <p className="ghs-word mt-1 text-[clamp(28px,7vw,40px)] font-extrabold leading-none tracking-[-.02em] text-[#111827]">
          Smart Hike
        </p>

        <p className="ghs-sub mt-3 flex items-center gap-3 text-[clamp(10px,2.6vw,12px)] font-semibold uppercase tracking-[.16em] text-[#111827]/70">
          <i aria-hidden className="block h-px w-8 bg-lime-deep" />
          <span>
            Zero Queue<b className="ml-1.5 font-extrabold text-lime-deep">Ready</b>
          </span>
        </p>

        <div className="ghs-prog mt-9 w-[208px]">
          <div className="h-[6px] overflow-hidden rounded-full bg-[#111827]/[.08]">
            <div
              className="ghs-fill h-full rounded-full transition-[width] duration-150 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="ghs-pct mt-2.5 text-[9.5px] font-semibold uppercase tracking-[.32em] text-[#111827]/45">
            Getting the boots ready · {pct}%
          </div>
        </div>
      </div>
    </div>
  );
}
