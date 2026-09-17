// components/animated-nav-framer.tsx
"use client";

import * as React from "react";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

/* The same four items on every screen, landing and app alike, so the nav does
   not change shape as a rider moves around. Parcel is not a tab of its own —
   it is a mode on the booking card and a section of the dashboard. */
const navItems = [
  { name: "Home", href: "/gogo/", emoji: "🏠" },
  { name: "Dashboard", href: "/gogo/dashboard", emoji: "📊" },
  { name: "Messages", href: "/gogo/messages", emoji: "💬" },
  { name: "More", href: "/gogo/more", emoji: "⋯" },
];

const EXPAND_SCROLL_THRESHOLD = 80;

/* same animation contract as the original component — only the anchor moved
   to the bottom of the screen */
const containerVariants = {
  expanded: {
    y: 0,
    opacity: 1,
    width: "auto",
    transition: {
      y: { type: "spring", damping: 18, stiffness: 250 },
      opacity: { duration: 0.3 },
      type: "spring",
      damping: 20,
      stiffness: 300,
      staggerChildren: 0.07,
      delayChildren: 0.2,
    },
  },
  collapsed: {
    y: 0,
    opacity: 1,
    width: "3rem",
    transition: {
      type: "spring",
      damping: 20,
      stiffness: 300,
      when: "afterChildren",
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
};

const itemVariants = {
  expanded: { opacity: 1, x: 0, scale: 1, transition: { type: "spring", damping: 15 } },
  collapsed: { opacity: 0, x: -20, scale: 0.95, transition: { duration: 0.2 } },
};

const collapsedIconVariants = {
  expanded: { opacity: 0, scale: 0.8, transition: { duration: 0.2 } },
  collapsed: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", damping: 15, stiffness: 300, delay: 0.15 },
  },
};

export function AnimatedNavFramer() {
  const [isExpanded, setExpanded] = React.useState(true);

  const { scrollY } = useScroll();
  const lastScrollY = React.useRef(0);
  const scrollPositionOnCollapse = React.useRef(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = lastScrollY.current;

    if (isExpanded && latest > previous && latest > 150) {
      setExpanded(false);
      scrollPositionOnCollapse.current = latest;
    } else if (!isExpanded && latest < previous && (scrollPositionOnCollapse.current - latest > EXPAND_SCROLL_THRESHOLD)) {
      setExpanded(true);
    }

    lastScrollY.current = latest;
  });

  const handleNavClick = (e: React.MouseEvent) => {
    if (!isExpanded) {
      e.preventDefault();
      setExpanded(true);
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 sm:bottom-6">
      <motion.nav
        initial={{ y: 80, opacity: 0 }}
        animate={isExpanded ? "expanded" : "collapsed"}
        variants={containerVariants}
        whileHover={!isExpanded ? { scale: 1.1 } : {}}
        whileTap={!isExpanded ? { scale: 0.95 } : {}}
        onClick={handleNavClick}
        className={cn(
          "gh-dock flex h-[62px] items-center overflow-visible rounded-full",
          !isExpanded && "cursor-pointer justify-center"
        )}
      >
        <motion.div
          className={cn(
            "flex items-center gap-1.5 px-1 sm:gap-2.5 sm:px-2",
            !isExpanded && "pointer-events-none"
          )}
        >
          {navItems.map((item, idx) => (
            <motion.a
              key={item.name}
              href={item.href}
              variants={itemVariants}
              onClick={(e) => e.stopPropagation()}
              /* Home is where the landing sits, so it reads as the current page
                 and picks up the lime rim */
              aria-current={idx === 0 ? "page" : undefined}
              className="gh-nav-item group flex flex-col items-center gap-1 px-3 py-1.5 sm:px-4"
            >
              <span className="relative z-10 text-[21px] leading-none transition-transform duration-200 group-hover:-translate-y-0.5" aria-hidden>
                {item.emoji}
              </span>
              <span className="relative z-10 text-[11.5px] font-bold leading-none text-neutral-600 transition-colors group-hover:text-ink">
                {item.name}
              </span>
            </motion.a>
          ))}
        </motion.div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <motion.div variants={collapsedIconVariants} animate={isExpanded ? "expanded" : "collapsed"}>
            <Menu className="h-6 w-6" />
          </motion.div>
        </div>
      </motion.nav>
    </div>
  );
}
