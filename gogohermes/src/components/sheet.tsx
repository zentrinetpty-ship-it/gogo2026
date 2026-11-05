/* ══ SHEET ══════════════════════════════════════════════════════════════════
   The bottom sheet, in the landing's own stack.

   Same object the driver screens use — scrim, panel pinned to the bottom edge on
   a phone, centred dialog from 640px up — but built with Tailwind rather than the
   shared .gsheet stylesheet, because the landing is a Vite bundle.

   ══ WHY THE FIRST VERSION MOVED BADLY ══════════════════════════════════════
   Three separate faults, all visible in one look at the class list:

   1. TWO TRANSITIONS, CONFLICTING. The panel carried `transition-transform` and
      the sm: breakpoint added `transition-[transform,opacity]`. Two transition
      declarations for the same property meant the browser used one set of
      durations for the transform and another for opacity, so the panel slid and
      faded at different speeds and neither matched the scrim. On a phone that
      reads as the card lurching twice.

   2. `translate-y-full` IS NOTHING WITHOUT A TRANSFORM-CAPABLE LAYOUT. Combined
      with the sm: centring translate, the element carried two competing
      translate utilities whose resolution order depends on stylesheet order, not
      on the breakpoint the author intended. On a narrow screen it began at the
      wrong offset and then corrected — the jump up, then down, that was reported.

   3. FOCUSING AT 290ms MID-FLIGHT. The effect focused the input while the panel
      was still animating. On iOS that summons the keyboard, which resizes the
      visual viewport mid-transition and shoves the sheet upward. That is the
      other half of the jerk.

   ══ THE FIX ════════════════════════════════════════════════════════════════
   One property, one transition, one place. The panel is positioned by plain
   `bottom/left/right` with no translate utilities at all, and the slide is driven
   by an explicit `transform` written from React — `translate3d(0, 100%, 0)` when
   closed, `translate3d(0, 0, 0)` when open, and on desktop the same value plus
   nothing else. Only `transform` animates; opacity rides on the scrim alone.
   Focus is deferred until the animation has actually finished.

   translate3d rather than translateY: promoting the panel to its own compositor
   layer is what makes the slide smooth on a mid-range Android instead of
   repainting the page behind it every frame.
*/
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";
import "./sheet.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/* the one duration, shared by the panel and the scrim so they cannot disagree */
const DURATION = 280;

export function Sheet({ open, onClose, title, sub, children, footer }: Props) {
  const [shown, setShown] = React.useState(false);
  const panel = React.useRef<HTMLDivElement>(null);



  /* Two frames before starting: the panel must be painted in its closed position
     first, or the browser batches both states and the sheet appears instead of
     rising. This is the difference between a slide and a pop. */
  React.useEffect(() => {
    if (!open) { setShown(false); return; }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setShown(true)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [open]);

  /* Lock the page behind and restore exactly what was there: clobbering overflow
     leaves some Android browsers unable to scroll after closing. */
  React.useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = prev; };
  }, [open]);

  /* ── focus, but only once the sheet has arrived ──────────────────────────
     Focusing during the transition summons the keyboard mid-slide, which resizes
     the visual viewport and jerks the panel upward. Waiting for the transform to
     finish costs nothing and removes the whole class of jump. */
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);

    const el = panel.current;
    let done = false;
    const focusFirst = () => {
      if (done) return;
      done = true;
      const first = el?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea");
      /* the input, not the close button: this sheet exists to be typed into */
      if (first) first.focus({ preventScroll: true });
    };
    const onEnd = (e: TransitionEvent) => { if (e.propertyName === "transform") focusFirst(); };
    el?.addEventListener("transitionend", onEnd);
    /* a timer as backstop: if the animation never fires (reduced motion, or the
       element was already settled) the field still gets focus */
    const t = setTimeout(focusFirst, DURATION + 80);

    return () => {
      document.removeEventListener("keydown", onKey);
      el?.removeEventListener("transitionend", onEnd);
      clearTimeout(t);
    };
  }, [open, onClose]);

  /* ── the sheet only says WHICH state, never the pixels ────────────────────
     Every jerk this sheet has had came from JavaScript guessing the geometry and
     CSS then disagreeing with it. So JS sets one flag and sheet.css decides what
     that means at each breakpoint: bottom-pinned on a phone, a centred dialog
     above 640px. The media query that positions the panel is the same one that
     animates it, so the two cannot diverge and no frame is painted in the wrong
     mode. */
  const panelStyle: React.CSSProperties = {
    "--slide": shown ? "0" : "1",
    transition: `transform ${DURATION}ms cubic-bezier(.22,.61,.36,1)`,
    willChange: "transform",
    maxHeight: "82dvh",
    minHeight: "280px",
  } as React.CSSProperties;

  if (!open) return null;

  /* Rendered into <body>: `fixed` resolves against the nearest TRANSFORMED
     ancestor, not the viewport, and this sheet would otherwise live inside the
     booking card, which animates in with a transform. Portalled, it anchors to
     the screen. */
  return createPortal(
    <div
      className="fixed inset-0 z-[900]"
      style={{ height: "100dvh", width: "100vw" }}
      role="dialog"
      aria-modal="true"
      aria-label={title || "Booking"}
    >
      {/* the scrim fades; it never moves, so it cannot add to the motion */}
      <div
        onClick={onClose}
        style={{ transitionDuration: `${DURATION}ms` }}
        className={cn(
          "gogo-sheet-scrim absolute inset-0 bg-[rgba(16,16,16,.38)] transition-opacity ease-out",
          shown ? "opacity-100" : "opacity-0"
        )}
      />

      {/* ── the panel ────────────────────────────────────────────────────────
             Its position and its slide are both defined in sheet.css, keyed off
             the --slide flag set below. JS does not compute geometry here: every
             jerk this sheet has had came from JS and CSS disagreeing about where
             the panel was, and the only durable fix was to stop having two
             opinions. */}
      <div
        ref={panel}
        style={panelStyle}
        className={cn(
          /* position, width and the slide itself live in sheet.css — see the note
             at the top of that file for why they are not Tailwind utilities */
          "gogo-sheet-panel absolute flex flex-col overflow-y-auto overscroll-contain",
          "rounded-t-[22px] bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-2.5",
          "sm:rounded-[20px] sm:px-6 sm:py-5 sm:shadow-[0_24px_60px_rgba(16,16,16,.22)]"
        )}
      >
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-neutral-200 sm:hidden" aria-hidden />

        <div className="flex items-start gap-2.5 pb-3">
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 className="m-0 text-[18px] font-semibold leading-[1.25] tracking-[-0.022em] text-[#1A1A1A]">{title}</h2>
            ) : null}
            {sub ? <p className="mt-0.5 text-[12px] leading-[1.5] text-neutral-500">{sub}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-neutral-200 bg-white text-[#1A1A1A] transition-colors active:bg-neutral-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3 w-3">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1">{children}</div>
        {footer}
      </div>
    </div>,
    document.body
  );
}
