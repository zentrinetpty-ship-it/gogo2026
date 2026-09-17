import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** merge conditional classes without duplicate Tailwind utilities */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
