import * as React from "react";
import { cn } from "@/lib/utils";

/* =========================================================================
   The go-go wordmark.

   GO + the swap mark + GO. The mark is two lines that fold once — the top one
   runs right and folds down, the bottom one runs left and folds up — so the
   pair reads as a single return trip rather than two arrows. That is the
   product: you go, and you come back.

   Geometry, all in em so the mark holds its proportion at every size:
     width   1.16em
     height  .8em
     stroke  5.8 of a 24-unit viewBox = 0.193em

   0.193em is measured, not guessed: Anton's own stem rasterises to 0.210em at
   cap height, and a butt-capped fold reads slightly heavier than a flat stem of
   the same width, so it lands just under. A mark drawn at a fixed pixel stroke
   looks pasted on at one size and broken at another.

   Butt caps and miter joins on purpose. Rounded ends would contradict the
   squared 2px language the rest of the interface uses.
   ========================================================================= */

function SwapMark({ color }: { color: string }) {
  /* Two parallel horizontal arrows in opposite directions — the swap glyph.
     Both shafts horizontal, one head pointing right, one left, stacked.

     Sized in em so the mark holds its proportion at any font-size, stroked at
     5.8 of a 24-unit viewBox. Butt caps and miter joins: a squared mark,
     matching the 2px language the rest of the interface uses. */
  return (
    <svg
      viewBox="0 0 34 24"
      width=".72em"
      height=".51em"
      aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto" }}
    >
      <g
        fill="none"
        strokeWidth="5.8"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeMiterlimit="6"
      >
        <path d="M3 7h26" stroke={color} />
        <path d="M23 3l6 4-6 4" stroke={color} />
        <path d="M31 17H5" stroke={color} />
        <path d="M11 13l-6 4 6 4" stroke={color} />
      </g>
    </svg>
  );
}

export function GoGoLogo({
  size = 30,
  className = "",
  dark = false,
}: {
  size?: number;
  className?: string;
  dark?: boolean;
}) {
  const ink = dark ? "#FFFFFF" : "#0B0B0B";
  const lime = dark ? "#A3E635" : "#8DB600";
  return (
    <div className={cn("flex items-center", className)}>
      <span
        className="font-display uppercase leading-none tracking-[-.01em]"
        style={{
          fontSize: size,
          fontWeight: 900,
          display: "inline-flex",
          alignItems: "center",
          color: ink,
        }}
      >
        GO
        <span style={{ width: ".075em" }} />
        <SwapMark color={lime} />
        <span style={{ width: ".075em" }} />
        <span style={{ color: lime }}>GO</span>
      </span>
    </div>
  );
}
