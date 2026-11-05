/* ══ PICKUP SHEET ═══════════════════════════════════════════════════════════
   ONE question: where do we get you?

   Not the whole booking. The rider is on the landing page looking at a map; the
   only thing they can meaningfully answer there is where they are standing. The
   destination is answered on the results page, where they can see what is
   actually leaving — filtering a list is a far better way to choose a town than
   guessing at one from a dropdown before anything has loaded.

   So this sheet collects one address, resolves it to a town, and hands back.

   TYPING IS A GUESS, PICKING IS A PLACE
   Only a picked suggestion gets its town resolved, because the next screen asks
   "rides leaving your town" and a typed string cannot answer that. A typed
   address is still allowed through — the results page can search from it — but
   the sheet says so rather than silently pretending it matched.
*/
import * as React from "react";
import { Sheet } from "./sheet";

export type PickupResult = {
  pickup: string;
  city: string;
  resolved: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialPickup?: string;
  initialCity?: string;
  onDone: (r: PickupResult) => void;
};

const CTA = "h-[50px] w-full rounded-full bg-[#1A1A1A] text-[14px] font-semibold text-white transition-transform active:scale-[.994] disabled:bg-neutral-300";

export function PickupSheet({ open, onClose, initialPickup = "", initialCity = "", onDone }: Props) {
  const [q, setQ] = React.useState(initialPickup);
  const [tips, setTips] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [picked, setPicked] = React.useState("");

  /* Reopening starts from what they already have. Changing an address is a
     different job from entering one for the first time. */
  React.useEffect(() => {
    if (open) { setQ(initialPickup); setPicked(initialCity ? initialPickup : ""); setErr(""); }
  }, [open, initialPickup, initialCity]);

  /* ── suggestions ──────────────────────────────────────────────────────────
     300ms debounce, 4-character gate: below that every keystroke fires a
     request and the list is noise. Rendered in the panel's scroll flow, not as
     an anchored dropdown — an anchored list gets clipped by the panel's overflow
     and then covered by the keyboard. */
  React.useEffect(() => {
    const t = q.trim();
    if (t.length < 4 || t === picked) { setTips([]); return; }
    let live = true;
    const id = setTimeout(() => {
      fetch(`/api/address/?q=${encodeURIComponent(t)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((rows) => {
          if (!live || !Array.isArray(rows)) return;
          setTips(
            rows.map((r: { display_name?: string }) => r?.display_name)
                .filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
                .slice(0, 5)
          );
        })
        .catch(() => { /* no suggestions is a normal state */ });
    }, 300);
    return () => { live = false; clearTimeout(id); };
  }, [q, picked]);

  /* Resolve the town then hand off. A failed lookup still proceeds: the results
     page can search from what they typed, and blocking a rider because the
     geocoder had a bad second is the worse failure. */
  const commit = async (address: string) => {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch(`/api/address/city/?q=${encodeURIComponent(address)}`);
      const data = r.ok ? await r.json() : null;
      const city = data?.city && data?.matched ? String(data.city) : "";
      onDone({ pickup: address, city, resolved: Boolean(city) });
    } catch {
      onDone({ pickup: address, city: "", resolved: false });
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const t = q.trim();
    if (t.length < 4) { setErr("Add the street we should collect you from."); return; }
    void commit(t);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Where do we get you?"
      sub="We collect at your street, not at a rank."
      footer={
        <div className="sticky bottom-0 -mx-5 mt-4 bg-gradient-to-b from-transparent to-white px-5 pb-1 pt-3 sm:-mx-6 sm:px-6">
          <button className={CTA} type="button" onClick={submit} disabled={busy}>
            {busy ? "Finding rides…" : "Find rides near me"}
          </button>
          {err ? <p className="mt-2 text-center text-[11.5px] text-orange-700">{err}</p> : null}
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[.07em] text-neutral-400">Pick me up at</span>
          <input
            className="h-11 w-full rounded-[11px] border border-neutral-200 bg-white px-3 text-[16px] text-[#1A1A1A] outline-none transition-colors focus:border-neutral-400"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPicked(""); setErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="Street number, street, suburb"
            autoComplete="street-address"
            enterKeyHint="search"
            autoFocus
          />
        </label>

        {tips.length ? (
          <ul className="overflow-hidden rounded-[12px] border border-neutral-200">
            {tips.map((t) => (
              <li key={t} className="border-t border-neutral-200 first:border-t-0">
                <button
                  type="button"
                  onClick={() => { setQ(t); setPicked(t); setTips([]); void commit(t); }}
                  disabled={busy}
                  className="flex w-full items-center gap-2.5 bg-white px-3 py-2.5 text-left transition-colors active:bg-neutral-50 disabled:opacity-50"
                >
                  <span className="flex h-3.5 w-3.5 flex-none text-neutral-400" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21Z" />
                      <circle cx="12" cy="10.4" r="2.4" />
                    </svg>
                  </span>
                  <span className="line-clamp-2 min-w-0 text-[12.5px] leading-[1.4] text-[#1A1A1A]">{t}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {!tips.length && q.trim().length >= 4 && !picked ? (
          <p className="m-0 text-[11.5px] leading-[1.5] text-neutral-500">
            Pick a suggestion for the most accurate pickup, or search with what you typed.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
