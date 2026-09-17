import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Search, ChevronDown } from "lucide-react";
import { SA, INDEX, norm, ALIAS, provinceByName, type Province } from "@/lib/places";
import { cn } from "@/lib/utils";

/* =========================================================================
   The Going-to picker.

   Matches /gogo exactly: the menu opens on all nine provinces as rows, each
   with a pin, the name and a chevron. Picking one unfolds its towns INSIDE
   the same menu, in a two-column grid indented under a hairline — no second
   screen, no back button. Tapping the open province again folds it.

   Type an empty field to get the provinces; type anything and it searches
   every town at once, grouped under province headers.
   ========================================================================= */

export function CityPicker({
  value,
  onChange,
  placeholder = "Select your destination city",
  id,
  labelledBy,
}: {
  value: string;
  onChange: (city: string, province?: string) => void;
  placeholder?: string;
  /* lets the form focus this control by id when it is the missing field */
  id?: string;
  /* names the control for screen readers — a <button> cannot be labelled by
     htmlFor, so the label points at it with aria-labelledby instead */
  labelledBy?: string;
}) {
  const [open, setOpen] = React.useState(false);
  /* which province is unfolded, in the same menu */
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const wrap = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  /* close when the pointer goes down outside the wrapper. Anything inside is
     left alone, so a row's own click still lands. */
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const typed = norm(q).length > 0;

  /* flat ranked results, grouped by province, same as the app */
  const groups = React.useMemo(() => {
    if (!typed) return [];
    const n = norm(q);
    const alias = ALIAS[n];
    const rows = alias
      ? INDEX.filter((r) => r.city === alias)
      : INDEX.filter((r) => norm(r.city).includes(n) || norm(r.province).includes(n)).slice(0, 24);
    const out: { p: string; rows: typeof INDEX }[] = [];
    rows.forEach((r) => {
      const g = out.find((x) => x.p === r.province);
      if (g) g.rows.push(r); else out.push({ p: r.province, rows: [r] });
    });
    return out;
  }, [typed, q]);

  const provQuery = typed ? provinceByName(q) : null;

  const pick = (city: string, province?: string) => {
    onChange(city, province);
    setOpen(false);
    setExpanded(null);
    setQ("");
  };

  const toggle = (p: Province) =>
    setExpanded((cur) => (cur === p.p ? null : p.p));

  return (
    <div ref={wrap} className="relative">
      {/* the field: a button that opens the menu */}
      <button
        type="button"
        id={id}
        aria-labelledby={labelledBy}
        onClick={() => { setOpen((v) => !v); setTimeout(() => inputRef.current?.focus(), 40); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="gh-field gh-dest"
      >
        <MapPin className="h-[17px] w-[17px] shrink-0 text-amber-500" />
        <span className={cn("gh-dest-txt", !value && "is-empty")}>
          {value || placeholder}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            role="listbox"
            className="absolute left-0 right-0 z-40 mt-1.5 max-h-[62vh] overflow-y-auto overscroll-contain rounded-xl border bg-white p-1.5 shadow-lift"
          >
            {/* search everything at once */}
            <div className="mb-1 flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a town or province"
                className="h-6 w-full min-w-0 border-0 bg-transparent text-[13px] font-semibold outline-none placeholder:font-medium placeholder:text-neutral-400"
              />
            </div>

            {typed ? (
              /* ── searching: towns grouped under province headers ─────── */
              <>
                {provQuery && (
                  <button
                    type="button"
                    onClick={() => pick(provQuery.p, provQuery.p)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-neutral-50"
                  >
                    <span className="text-[12.5px] font-extrabold">Anywhere in {provQuery.p}</span>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-neutral-400">
                      province
                    </span>
                  </button>
                )}
                {groups.length ? (
                  groups.map((g) => (
                    <div key={g.p}>
                      <p className="px-2.5 pb-0.5 pt-2 font-mono text-[9.5px] font-bold uppercase tracking-[.14em] text-neutral-400">
                        {g.p}
                      </p>
                      {g.rows.map((r) => (
                        <button
                          key={r.city + r.province}
                          type="button"
                          onClick={() => pick(r.city, r.province)}
                          className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-neutral-50"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
                            <span className="truncate text-[12.5px] font-semibold">{r.city}</span>
                          </span>
                          <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-neutral-400">
                            {r.code}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))
                ) : (
                  !provQuery && (
                    <p className="px-2.5 py-4 text-[12px] text-neutral-500">
                      No town matches. Try a province, or the nearest big town.
                    </p>
                  )
                )}
              </>
            ) : (
              /* ── the provinces, with towns unfolding right here ──────── */
              SA.map((p) => {
                const on = expanded === p.p;
                return (
                  <div key={p.p}>
                    <button
                      type="button"
                      onClick={() => toggle(p)}
                      aria-expanded={on}
                      className={cn(
                        "mb-0.5 flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[12.5px] font-extrabold transition-colors",
                        on ? "border-neutral-200 bg-neutral-50" : "border-transparent hover:bg-neutral-100"
                      )}
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                      <span className="flex-1 truncate">{p.p}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform duration-200", on && "rotate-180")} />
                    </button>

                    {/* the towns, folding open under their province */}
                    <AnimatePresence initial={false}>
                      {on && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="mb-2 ml-2.5 grid grid-cols-2 gap-0.5 border-l border-neutral-200 pl-2.5">
                            {p.towns.map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => pick(t, p.p)}
                                className="overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-1.5 py-1.5 text-left text-[11.5px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-ink"
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
