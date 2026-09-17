import * as React from "react";
import { cn } from "@/lib/utils";

/* =========================================================================
   The go-go wordmark.

   Just the name now: lowercase, in the display face, with the second "go"
   carrying the lime. No mark in front of it.
   ========================================================================= */

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
  return (
    <div className={cn("flex items-center", className)}>
      <span
        className="font-display uppercase leading-none tracking-[-.01em]"
        style={{ fontSize: size, fontWeight: 900, color: ink }}
      >
        GO<span style={{ color: "#8DB600" }}>GO</span>
      </span>
    </div>
  );
}
