/* ── South African town names ──────────────────────────────────────────────
   Many towns on the GOGO corridor were officially renamed, and both names are
   still in daily use: a rider in their fifties says "Umtata", a municipal form
   says "Mthatha", and OpenStreetMap may say either depending which boundary you
   hit. Showing only the new name loses the older rider; showing only the old
   name looks out of date.

   So each display string carries the former name in brackets, and matching
   accepts BOTH — see matchesCity(). The bracket is a display concern only; the
   canonical name stays clean in storage so filters and ride data keep working.

   Renames verified against the South African Geographical Names Council list
   (Eastern Cape renamings gazetted 2004–2024), not guessed. East London →
   KuGompo is additionally confirmed from the OSM data this app queries.
*/

export type TownName = {
  /** canonical name, as stored and as matched against ride.from */
  name: string;
  /** former name(s), shown in brackets */
  former?: string[];
};

export const TOWNS: TownName[] = [
  /* corridor towns — these are the ones rides actually run to */
  { name: "East London", former: ["KuGompo"] },
  { name: "Mthatha", former: ["Umtata"] },
  { name: "Komani", former: ["Queenstown"] },
  { name: "Ngcobo", former: ["Engcobo"] },
  { name: "Butterworth", former: ["Gcuwa"] },
  { name: "Idutywa", former: ["Dutywa"] },
  { name: "Cala", former: [] },
  { name: "Kokstad", former: [] },
  { name: "Port Shepstone", former: [] },
  { name: "Durban", former: [] },

  /* reachable / served on longer runs */
  { name: "Gqeberha", former: ["Port Elizabeth"] },
  { name: "Makhanda", former: ["Grahamstown"] },
  { name: "Fort Beaufort", former: ["KwaMaqoma"] },
  { name: "Cradock", former: ["Nxuba"] },
  { name: "Qonce", former: ["King William's Town", "King Williams Town"] },
  { name: "Kariega", former: ["Uitenhage"] },
  { name: "Bhisho", former: ["Bisho"] },
  { name: "Mount Frere", former: ["KwaBhaca"] },
  { name: "Stutterheim", former: [] },
  { name: "Bizana", former: [] },
  { name: "Port St Johns", former: [] },
  { name: "Beaufort West", former: [] },
  { name: "Cape Town", former: [] },
  { name: "Johannesburg", former: [] },
];

const BY_NAME = new Map(TOWNS.map((t) => [t.name.toLowerCase(), t]));

/** Lower-case, strip punctuation and collapse spaces — "Port  St. Johns" → "port st johns" */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Every string a rider might type for this town, old and new. */
export function aliasesFor(name: string): string[] {
  const town = BY_NAME.get(norm(name));
  if (!town) return [norm(name)];
  return [norm(town.name), ...(town.former || []).map(norm)];
}

/**
 * Does the rider's text refer to this town, by either name?
 * Used wherever a typed address is compared to a ride's origin.
 */
export function matchesCity(input: string, canonical: string): boolean {
  const q = norm(input);
  return aliasesFor(canonical).some((a) => a.length > 2 && (q === a || q.includes(a)));
}

/**
 * Display form: `Komani (Queenstown)`.
 *
 * New name first so the app looks current, old name second so the rider
 * recognises where they are going. Towns never renamed return bare.
 */
export function displayCity(name: string): string {
  const town = BY_NAME.get(norm(name));
  if (!town || !town.former || town.former.length === 0) return name;
  return `${town.name} (${town.former.join(", ")})`;
}

/**
 * Resolve any typed / OSM-supplied name to the canonical one. Returns null for
 * places we don't know, which callers must treat as "not on our corridor"
 * rather than silently defaulting to something wrong.
 */
export function canonicalCity(input: string): string | null {
  const q = norm(input);
  for (const town of TOWNS) {
    if (aliasesFor(town.name).some((a) => a.length > 2 && (q === a || q.includes(a)))) {
      return town.name;
    }
  }
  return null;
}
