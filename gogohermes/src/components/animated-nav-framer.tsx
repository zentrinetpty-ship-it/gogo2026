// components/animated-nav-framer.tsx
"use client";

import * as React from "react";
import { Home, LayoutGrid, ReceiptText, User } from "lucide-react";
import { cn } from "@/lib/utils";

/* Bottom navigation.

   Full-width flat white bar, flush to the bottom edge — not a floating pill.
   That reads as a native app tab bar rather than a widget sitting on the page,
   which is what the rest of the product already looks like.

   The four items are fixed across every screen so the bar never changes shape.
   Parcel is not a tab of its own: it is a mode on the booking card.

   Icons are line glyphs, not emoji. Emoji render differently on every platform
   and cannot be tinted, so an "active" state was impossible to express with
   them. Line icons take the ink colour directly, which is how the active tab
   reads as solid black and the rest as grey. */
const navItems = [
  { name: "Home", href: "/gogo/", Icon: Home },
  { name: "Dashboard", href: "/gogo/dashboard", Icon: LayoutGrid },
  { name: "Messages", href: "/gogo/messages", Icon: ReceiptText },
  /* More points at How it works, not the /gogo/more nav shell. That shell was a
     menu of links with no content of its own; the explainer is the page people
     actually want when they tap "more" on a service they do not understand yet.
     It is also where the landing's own "How it works" link goes, so the tab and
     the link now agree. */
  { name: "More", href: "/gogo/why.html", Icon: User },
];

export function AnimatedNavFramer({ pathname }: { pathname?: string }) {
  // The landing page lives at /gogo/, so treat that as Home. Everything else
  // matches on its own segment, with a trailing slash tolerated.
  const path = (pathname || (typeof window !== "undefined" ? window.location.pathname : "/")).replace(/\/+$/, "") || "/";
  const activeIndex = Math.max(
    0,
    navItems.findIndex((item, i) =>
      i === 0
        ? path === "/gogo" || path === "/gogo/index.html" || path === ""
        : path.startsWith(item.href.replace(/\/+$/, ""))
    )
  );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200/70 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-[58px] items-stretch">
        {navItems.map((item, idx) => {
          const active = idx === activeIndex;
          const { Icon } = item;
          return (
            <li key={item.name} className="flex-1">
              <a
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-[3px]",
                  "transition-colors duration-150",
                  active ? "text-ink" : "text-neutral-400 hover:text-neutral-600"
                )}
              >
                <Icon
                  aria-hidden="true"
                  className="h-[21px] w-[21px]"
                  strokeWidth={active ? 2.2 : 1.7}
                />
                <span className="text-[10px] font-semibold leading-none tracking-[.01em]">
                  {item.name}
                </span>
                {/* Active marker: a dot under the label, in the brand accent.
                    It carries the only colour in the bar, so "where am I" reads
                    at a glance without tinting the whole tab. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-[1px] h-1 w-1 rounded-full transition-opacity duration-150",
                    active ? "bg-lime opacity-100" : "opacity-0"
                  )}
                />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
