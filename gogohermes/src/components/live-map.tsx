import * as React from "react";
import { motion } from "framer-motion";

/* =========================================================================
   The live map background.

   Ported from the GOGO map module so the landing keeps the same corridor:
   key-free ArcGIS light tiles, the N2 corridor with its real towns, and a
   fuel stop on the way. No library, no API key — just slippy-tile maths.
   ========================================================================= */

const TILE = 256;

/* whitish, key-free. The colourful OSM tiles are the fallback. */
const BASEMAPS = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
];

const CENTER = { lat: -32.05, lng: 28.05 };
const ZOOM = 8;

type Town = { name: string; lat: number; lng: number; hub?: boolean; note: string };

const CITIES: Town[] = [
  { name: "East London", lat: -33.0153, lng: 27.9116, hub: true, note: "12 seats leaving today" },
  { name: "Komani", lat: -31.8976, lng: 26.8753, note: "hop off R120" },
  { name: "Butterworth", lat: -32.3309, lng: 28.1499, note: "hop off R170" },
  { name: "Idutywa", lat: -32.0976, lng: 28.3079, note: "hop off R195" },
  { name: "Mthatha", lat: -31.5889, lng: 28.7844, hub: true, note: "arrives 10:10" },
];

const POIS = [{ lat: -32.5746, lng: 27.4432, label: "Fuel on the N2" }];

/* Web-Mercator, the same projection the old map used */
function project(lat: number, lng: number, z: number) {
  const n = TILE * Math.pow(2, z);
  const x = ((lng + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

export function LiveMap() {
  const box = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [basemap, setBasemap] = React.useState(0);
  const reduce =
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  const { w, h } = size;
  const ready = w > 0 && h > 0;

  /* tile window: origin is the top-left tile of the grid we paint */
  const tiles = React.useMemo(() => {
    if (!ready) return [];
    const c = project(CENTER.lat, CENTER.lng, ZOOM);
    const t0x = Math.floor((c.x - w / 2) / TILE) - 1;
    const t0y = Math.floor((c.y - h / 2) / TILE) - 1;
    const cols = Math.ceil(w / TILE) + 3;
    const rows = Math.ceil(h / TILE) + 3;
    const max = Math.pow(2, ZOOM) - 1;
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        const x = t0x + cc, y = t0y + r;
        if (x < 0 || y < 0 || x > max || y > max) continue;
        out.push({ x, y });
      }
    }
    return out;
  }, [ready, w, h]);

  /* the pan that puts our centre where we want it */
  const view = React.useMemo(() => {
    if (!ready) return { originX: 0, originY: 0, tx: 0, ty: 0, cx: 0, cy: 0 };
    const c = project(CENTER.lat, CENTER.lng, ZOOM);
    const t0x = Math.floor((c.x - w / 2) / TILE) - 1;
    const t0y = Math.floor((c.y - h / 2) / TILE) - 1;
    const originX = t0x * TILE, originY = t0y * TILE;
    /* On phones the booking card owns the bottom of the screen, so the corridor
       is pushed well up to sit in the clear band above it. From md up the card
       moves to the right column instead, so it only needs the app's small nudge
       left and down. */
    const isPhone = w < 768;
    const tx = -(c.x - originX - w / 2) - w * 0.05;
    const ty = -(c.y - originY - h / 2) - h * (isPhone ? 0.30 : -0.06);
    return { originX, originY, tx, ty, cx: c.x, cy: c.y };
  }, [ready, w, h]);

  /* where a town lands on screen, relative to the tile grid origin */
  const place = (lat: number, lng: number) => {
    const p = project(lat, lng, ZOOM);
    return { left: p.x - view.originX, top: p.y - view.originY };
  };

  const corridor = CITIES.map((t) => place(t.lat, t.lng));
  const pois = POIS.map((p) => place(p.lat, p.lng));

  const src = (x: number, y: number) =>
    BASEMAPS[basemap].replace("{z}", String(ZOOM)).replace("{x}", String(x)).replace("{y}", String(y));

  return (
    <div
      ref={box}
      aria-hidden="true"
      className="gh-map pointer-events-none absolute overflow-hidden bg-white"
      style={{ inset: "0", top: "-68px", height: "calc(100% + 68px)" }}
    >
      {ready && (
        <div
          className="absolute"
          style={{
            width: Math.ceil(w / TILE) * TILE + TILE * 3,
            height: Math.ceil(h / TILE) * TILE + TILE * 3,
            transform: `translate(${view.tx}px, ${view.ty}px)`,
          }}
        >
          {tiles.map((t) => (
            <img
              key={`${t.x}-${t.y}`}
              src={src(t.x, t.y)}
              alt=""
              loading="eager"
              decoding="async"
              onError={() => { if (basemap === 0) setBasemap(1); }}
              className="absolute select-none"
              style={{
                left: t.x * TILE - view.originX,
                top: t.y * TILE - view.originY,
                width: TILE,
                height: TILE,
              }}
              draggable={false}
            />
          ))}

          {/* the corridor, drawn over the tiles so the line sits on the road */}
          <svg
            className="absolute"
            width={Math.ceil(w / TILE) * TILE + TILE * 3}
            height={Math.ceil(h / TILE) * TILE + TILE * 3}
            style={{ left: 0, top: 0 }}
          >
            <polyline
              points={corridor.map((p) => `${p.left},${p.top}`).join(" ")}
              fill="none"
              stroke="#8DB600"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
            <polyline
              points={corridor.map((p) => `${p.left},${p.top}`).join(" ")}
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* towns on the corridor */}
          {CITIES.map((t, i) => (
            <div
              key={t.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: corridor[i].left, top: corridor[i].top }}
            >
              <div
                className={
                  "grid place-items-center rounded-md border shadow-sm " +
                  (t.hub
                    ? "h-9 w-9 border-lime bg-lime text-ink"
                    : "h-7 w-7 border-neutral-300 bg-white text-neutral-500")
                }
              >
                {t.hub ? (
                  <svg viewBox="0 0 48 26" className="h-4 w-4" fill="currentColor" aria-hidden>
                    <path d="M3.4 18.8V15l2.2-.2 1-3.2L11 9l5.2-2.6h21.2l4.8 3.8 2.8 3.2.6 1.8v3.6H3.4Z" />
                    <circle cx="13.1" cy="18.8" r="3.5" />
                    <circle cx="34.1" cy="18.8" r="3.5" />
                  </svg>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-current" />
                )}
              </div>
              <div className="mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border bg-white/95 px-2 py-0.5 text-[10.5px] font-bold text-ink shadow-sm" style={{ position: "absolute", left: "50%", top: "100%" }}>
                {t.name}
                <span className="ml-1 font-medium text-neutral-400">{t.note}</span>
              </div>
            </div>
          ))}

          {/* one fuel stop on the way */}
          {POIS.map((p, i) => (
            <div
              key={p.label}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: pois[i].left, top: pois[i].top }}
            >
              <div className="grid h-7 w-7 place-items-center rounded-md border border-amber-300 bg-white text-[13px] shadow-sm">
                ⛽
              </div>
            </div>
          ))}

          {/* a van working the corridor, as the app shows */}
          {!reduce && corridor.length > 1 && (
            <motion.div className="absolute" style={{ left: 0, top: 0 }}>
              <motion.div
                className="grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg border-2 border-white bg-ink shadow-lg"
                animate={{
                  left: corridor.map((p) => p.left),
                  top: corridor.map((p) => p.top),
                }}
                transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", times: [0, 0.25, 0.5, 0.75, 1] }}
              >
                <svg viewBox="0 0 48 26" className="h-4 w-4 text-lime" fill="currentColor" aria-hidden>
                  <path d="M3.4 18.8V15l2.2-.2 1-3.2L11 9l5.2-2.6h21.2l4.8 3.8 2.8 3.2.6 1.8v3.6H3.4Z" />
                  <circle cx="13.1" cy="18.8" r="3.5" />
                  <circle cx="34.1" cy="18.8" r="3.5" />
                </svg>
              </motion.div>
            </motion.div>
          )}
        </div>
      )}

      {/* the page has to stay readable, so the map sits under a soft white scrim.
          It stays light on the left where the copy is, and opens up on the right
          so the corridor and the towns actually show through. */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/70 to-white/25 lg:from-white/90 lg:via-white/45 lg:to-transparent" />
    </div>
  );
}
