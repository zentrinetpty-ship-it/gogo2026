/* =========================================================================
   GOGO — address autocomplete for the landing's booking card.

   The landing is React, so this wraps the plain-DOM modules the rest of the app
   already uses (gogo-address.js + gogo-address-ui.js) rather than duplicating
   the lookup. One geocoder, one manual fallback, two front ends.

   The modules are loaded from /gogo/assets/ at runtime. If they are missing —
   offline, blocked, or a CDN hiccup — the component degrades to a plain text
   field and says so, instead of silently doing nothing.
   ========================================================================= */
import * as React from "react";

const BASE = "/gogo/assets";

let loading: Promise<void> | null = null;

/* A build stamp on the module URLs. Cloudflare caches these files hard and
   ignores a stale query string, so the stamp must change whenever the modules
   do — otherwise the browser keeps running an old copy of the autocomplete.
   Bump this in step with the ?v= on the app's pages. */
const ASSET_V = "268";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src^="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = `${src}?v=${ASSET_V}`;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

/* load the shared geocoder once, no matter how many fields mount */
export function ensureAddressModules(): Promise<void> {
  if (loading) return loading;
  /* gogo-renames must load first: the lookup asks it for a place's other
     names before it queries, and for the name people actually use when it
     labels a result. */
  loading = loadScript(`${BASE}/gogo-renames.js`)
    .then(() => loadScript(`${BASE}/gogo-address.js`))
    .then(() => loadScript(`${BASE}/gogo-address-ui.js`))
    .then(() => undefined)
    .catch(() => {
      loading = null;
      throw new Error("address modules unavailable");
    });
  return loading;
}

export interface AddressInputProps {
  value: string;
  onChange: (next: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  className?: string;
  icon?: React.ReactNode;
  required?: boolean;
  /** the town already chosen, used to rank local streets first */
  near?: string;
}

/**
 * A text input with South African address suggestions and a manual
 * street/suburb/town fallback. Keeps the same look as the other card fields.
 */
export function AddressInput({
  value, onChange, onFocus, placeholder, className = "", icon, required, near,
}: AddressInputProps) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  /* Load the shared modules and mount them on this input.
     React must not re-render the wrapper the module builds, so the input is
     uncontrolled while the module owns it: value flows in once, and every
     later change flows out through the listeners below. */
  React.useEffect(() => {
    let alive = true;
    let mounted: HTMLInputElement | null = null;

    const boot = () => {
      const el = ref.current;
      if (!alive || !el) return false;
      const ui = (window as any).GOGOAddressField;
      if (!ui?.mount) return false;
      /* the module needs the element to have a parent to wrap */
      if (!el.parentNode) return false;
      el.classList.add("gh-addr-in");
      if (el.dataset.addrMounted) return true;
      try {
        ui.mount(el);
      } catch {
        return false;
      }
      mounted = el;
      setReady(true);
      return true;
    };

    ensureAddressModules()
      .then(() => {
        if (boot()) return;
        /* the module may boot before React has painted the input */
        let tries = 0;
        const t = window.setInterval(() => {
          if (boot() || ++tries > 20) window.clearInterval(t);
        }, 100);
      })
      .catch(() => { if (alive) setFailed(true); });

    return () => {
      alive = false;
      if (mounted) mounted.dataset.addrMounted = "";
    };
  }, []);

  /* the modules write straight to the DOM, so mirror their changes back into
     React state — otherwise a picked suggestion would not reach the draft */
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    const sync = () => {
      if (el.value !== value) onChangeRef.current(el.value);
    };
    el.addEventListener("input", sync);
    el.addEventListener("change", sync);
    /* picking a suggestion or applying the manual form fires change without a
       keystroke, and React is not driving it, so poll once shortly after */
    const t = window.setInterval(sync, 250);
    return () => {
      el.removeEventListener("input", sync);
      el.removeEventListener("change", sync);
      window.clearInterval(t);
    };
  }, [ready, value]);

  /* give the search the town the user already picked */
  React.useEffect(() => {
    const el = ref.current;
    if (el && near) el.dataset.near = near;
  }, [near]);

  return (
    <label className={`gh-field gh-addr ${className}`}>
      {icon}
      {/* Uncontrolled once the module takes over: React writing `value` would
          re-render over the suggestion list the module built. The initial value
          is set once, and changes flow out through the listeners above. */}
      <input
        ref={ref}
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        aria-describedby={failed ? "addr-note" : undefined}
      />
      {failed && (
        <span id="addr-note" className="sr-only">
          Address suggestions are unavailable. Type your street, suburb and town.
        </span>
      )}
    </label>
  );
}
