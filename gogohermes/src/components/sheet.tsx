/* ══ SHEET ══════════════════════════════════════════════════════════════════
   The bottom sheet, in the landing's own stack.

   Same object the driver screens use — scrim, panel pinned to the bottom edge on
   a phone, centred dialog from 640px up, slide-up transition — but built with
   Tailwind rather than the shared .gsheet stylesheet, because the landing is a
   Vite bundle and pulling a 23KB static stylesheet into it to draw one panel is
   a bad trade. The measurements are copied deliberately from that stylesheet:
   22px top radius, 82dvh cap, 260ms cubic-bezier(.22,.61,.36,1). If one changes,
   change both — they are meant to be the same object seen from two stacks.

   WHY dvh AND NOT vh
   A phone's address bar collapses on scroll. vh is measured against the tall
   state, so the foot of the sheet ends up under the browser chrome exactly when
   the rider is reaching for the button at the bottom of it.
*/
import * as React from "react";
import { cn } from "../lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Sheet({ open, onClose, title, sub, children, footer }: Props) {
  const [shown, setShown] = React.useState(false);
  const panel = React.useRef<HTMLDivElement>(null);

  /* Two frames, not one: the panel has to be painted in its off-screen state
     before the transform is removed, or the browser batches both and the sheet
     simply appears. This is the difference between rising and popping. */
  React.useEffect(() => {
    if (!open) { setShown(false); return; }
    const a = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(a);
  }, [open]);

  /* Lock the page behind, and restore exactly what was there: clobbering
     overflow leaves some Android browsers unable to scroll after closing. */
  React.useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = prev; };
  }, [open]);

  /* Escape closes. Focus lands in the panel so a keyboard user is not typing
     into the page behind the scrim. */
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button");
      if (first) first.focus({ preventScroll: true });
    }, 290);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[900]" role="dialog" aria-modal="true" aria-label={title || "Booking"}>
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-[rgba(16,16,16,.38)] transition-opacity duration-200 ease-out",
          shown ? "opacity-100" : "opacity-0"
        )}
      />

      <div
        ref={panel}
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto overscroll-contain rounded-t-[22px] bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-2.5",
          "transition-transform duration-[260ms] ease-[cubic-bezier(.22,.61,.36,1)]",
          shown ? "translate-y-0" : "translate-y-full",
          /* from 640px it stops being a bottom sheet and becomes a centred
             dialog: a sheet stretched across a desktop reads as a footer */
          "sm:inset-x-auto sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:max-h-[84dvh] sm:w-[min(460px,92vw)]",
          "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:px-6 sm:py-5 sm:shadow-[0_24px_60px_rgba(16,16,16,.22)]",
          shown ? "sm:opacity-100" : "sm:opacity-0",
          "sm:transition-[transform,opacity]"
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

        <div>{children}</div>
        {footer}
      </div>
    </div>
  );
}
