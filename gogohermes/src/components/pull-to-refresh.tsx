"use client";

import * as React from "react";

/* =========================================================================
   Pull to refresh.

   Why hand-rolled rather than native: `overscroll-behavior` defaults would let
   the BROWSER show its own spinner, which looks like a website and freezes the
   page white on iOS. We keep the browser's version suppressed and draw our own,
   so the gesture stays but the chrome is ours.

   Only engages when the page is already at the top — otherwise it would fight
   every ordinary downward scroll, which is the classic bug in these.

   Threshold is 64px: far enough that a careless swipe back up doesn't trigger
   it, close enough that a deliberate pull doesn't feel like work.
   ========================================================================= */

const THRESHOLD = 64;
const MAX = 110;

export function PullToRefresh() {
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const startY = React.useRef<number | null>(null);
  const active = React.useRef(false);

  React.useEffect(() => {
    const atTop = () => window.scrollY <= 0;

    const onStart = (e: TouchEvent) => {
      /* one finger only — two fingers is a pinch, not a pull */
      if (e.touches.length !== 1 || !atTop()) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null || !atTop()) return;
      const dy = e.touches[0].clientY - startY.current;

      /* upward drag means the rider is scrolling, not pulling — release */
      if (dy <= 0) {
        setPull(0);
        return;
      }

      /* resistance: the pull slows as it grows, so it feels weighted rather
         than glued to the finger. Square root is the cheapest curve that reads
         as physical. */
      const damped = Math.min(MAX, Math.sqrt(dy) * 7);
      setPull(damped);

      /* stop the browser rubber-banding the whole page underneath us */
      if (dy > 8 && e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      startY.current = null;

      if (pull >= THRESHOLD) {
        setRefreshing(true);
        /* a real reload, not a soft reset: the rider is asking for fresh
           hikes, and a soft reset would keep the stale ride list. */
        setTimeout(() => window.location.reload(), 260);
      } else {
        setPull(0);
      }
    };

    /* passive: false on move so preventDefault actually works — the default
       is passive on touchmove in Chrome and calling it would be ignored */
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pull]);

  if (pull <= 0 || refreshing) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  const ready = progress >= 1;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-center"
      style={{ transform: `translateY(${Math.min(pull, MAX)}px)`, opacity: progress }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full border-[2.5px] border-lime bg-white shadow-sm transition-transform duration-150"
        style={{ transform: `rotate(${progress * 180}deg) scale(${0.8 + progress * 0.2})` }}
      >
        {/* the mark itself rotates to show progress — no spinner, no library */}
        <span className="gh-g-mark select-none text-[15px] leading-none">G</span>
      </span>
    </div>
  );
}
