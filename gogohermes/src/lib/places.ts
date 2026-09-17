/* =========================================================================
   GOGO — South African places
   Ported from the app's own dataset in assets/gogo-places.js: every province
   and the towns people actually travel to, with the old names searchable too
   (Gqeberha / Port Elizabeth, Komani / Queenstown). Same source of truth, so
   the landing and the app never disagree about where GOGO goes.
   ========================================================================= */

export type Province = { p: string; c: string; towns: string[] };

export const SA: Province[] = [
  { p: "Eastern Cape", c: "EC", towns: ["Mthatha", "East London", "Gqeberha", "Komani", "Butterworth", "Idutywa", "Mount Frere", "Aliwal North", "Makhanda", "Port St Johns", "Coffee Bay", "Hogsback", "Graaff-Reinet"] },
  { p: "Western Cape", c: "WC", towns: ["Cape Town", "George", "Knysna", "Mossel Bay", "Plettenberg Bay", "Stellenbosch", "Paarl", "Oudtshoorn", "Hermanus"] },
  { p: "KwaZulu-Natal", c: "KZN", towns: ["Durban", "Pietermaritzburg", "Richards Bay", "Ballito", "Umhlanga", "Margate", "Port Shepstone", "Newcastle", "Ladysmith", "Kokstad"] },
  { p: "Gauteng", c: "GP", towns: ["Johannesburg", "Pretoria", "Soweto", "Midrand", "Centurion", "Sandton", "Kempton Park", "OR Tambo Airport"] },
  { p: "Free State", c: "FS", towns: ["Bloemfontein", "Welkom", "Bethlehem", "Harrismith"] },
  { p: "Mpumalanga", c: "MP", towns: ["Mbombela", "eMalahleni", "Middelburg", "Secunda", "Sabie", "Graskop"] },
  { p: "Limpopo", c: "LP", towns: ["Polokwane", "Tzaneen", "Hoedspruit", "Bela-Bela", "Mokopane"] },
  { p: "North West", c: "NW", towns: ["Rustenburg", "Mahikeng", "Potchefstroom", "Hartbeespoort", "Sun City"] },
  { p: "Northern Cape", c: "NC", towns: ["Kimberley", "Upington", "Springbok", "Kuruman"] },
];

/* names people still type */
export const ALIAS: Record<string, string> = {
  "port elizabeth": "Gqeberha", "queenstown": "Komani", "grahamstown": "Makhanda",
  "nelspruit": "Mbombela", "witbank": "eMalahleni", "pietersburg": "Polokwane",
  "dutywa": "Idutywa", "umtata": "Mthatha", "plet": "Plettenberg Bay",
  "pe": "Gqeberha", "joburg": "Johannesburg", "jhb": "Johannesburg",
  "ct": "Cape Town", "durbs": "Durban", "pmb": "Pietermaritzburg",
  "ort": "OR Tambo Airport", "ortia": "OR Tambo Airport",
  "east london cbd": "East London", "uitkyk": "East London",
};

export const norm = (s: unknown) =>
  String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();

/* flat index carrying each town's province, so a pick can record both */
export const INDEX = SA.flatMap((prov) =>
  prov.towns.map((t) => ({ city: t, province: prov.p, code: prov.c }))
);

export function match(text: string) {
  const n = norm(text);
  if (!n) return null;
  const alias = ALIAS[n];
  if (alias) return INDEX.find((r) => r.city === alias) || null;
  return INDEX.find((r) => norm(r.city) === n) || null;
}

export const provinceByName = (text: string) => {
  const n = norm(text);
  return SA.find((x) => norm(x.p) === n || x.c.toLowerCase() === n) || null;
};

/* short label for the button, e.g. "Eastern Cape · EC" */
export const provLabel = (p: Province) => `${p.p} · ${p.c}`;
