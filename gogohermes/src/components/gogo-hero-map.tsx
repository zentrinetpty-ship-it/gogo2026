"use client";

import * as React from "react";

/* =========================================================================
   The hero map backdrop.

   Deliberately imperative: the SVG is built once on mount by GogoHeroMap and
   never re-rendered. A React-rendered version would rebuild ~30 SVG nodes on
   every state change in App (ride list, city, form open/closed), which is
   wasted work for something that is pure decoration and never changes.

   The script is loaded from whatever copy the page already has — if it has not
   loaded yet (slow connection, script order), this retries briefly and then
   gives up quietly. A backdrop must never be able to break the page.
   ========================================================================= */

export function GogoHeroMap() {
  const host = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let tries = 0;
    let timer: number | undefined;
    let done = false;

    const attempt = () => {
      if (done || !host.current) return;
      const api = (window as any).GogoHeroMap;
      if (api && typeof api.boot === "function") {
        api.boot(host.current, {
          /* the dot sits low-right of centre so it is not hidden behind the
             logo lockup, which is dead centre */
          dot: { x: 58, y: 46 },
        });
        done = true;
        return;
      }
      if (tries++ < 40) timer = window.setTimeout(attempt, 100);
    };

    attempt();
    return () => {
      done = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return <div ref={host} className="h-full w-full" />;
}
