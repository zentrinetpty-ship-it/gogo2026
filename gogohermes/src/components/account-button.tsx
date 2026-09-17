import * as React from "react";
import { LogIn, User } from "lucide-react";

/* =========================================================================
   ACCOUNT BUTTON

   Signed out: the Login button, exactly as before.
   Signed in:  an avatar with the rider's initials, linking to My trips.

   The landing is a React build and does not load the static app's scripts, so
   gogo-auth.js is injected the same way the address field injects its
   modules. Once it is up, the session token is what decides which of the two
   states shows — a token in localStorage proves nothing on its own, so the
   server is asked whether it is still good.
   ========================================================================= */

const BASE = "/gogo/assets";
const V = "270";

let authLoading: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("failed: " + src));
    document.head.appendChild(el);
  });
}

/* gogo-auth depends on the store helpers, so the order matters */
function ensureAuth(): Promise<void> {
  if (authLoading) return authLoading;
  authLoading = loadScript(`${BASE}/gogo.js?v=${V}`)
    .then(() => loadScript(`${BASE}/gogo-auth.js?v=${V}`))
    .then(() => undefined)
    .catch(() => {
      authLoading = null;
      throw new Error("auth module unavailable");
    });
  return authLoading;
}

type Who = { name: string; email: string } | null;

function initialsOf(name: string, email: string): string {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }
  return String(email || "?").trim().slice(0, 2).toUpperCase();
}

export function AccountButton({ className = "" }: { className?: string }) {
  const [who, setWho] = React.useState<Who>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    const settle = (next: Who) => {
      if (!alive) return;
      setWho(next);
      setReady(true);
    };

    /* Ask the server whether the stored token is still good. A stale token in
       the browser must not make the page look signed in when it is not. */
    ensureAuth()
      .then(() => {
        const auth = (window as any).GOGOAuth;
        if (!auth || !auth.checkSession) return settle(null);
        return auth
          .checkSession()
          .then((u: any) => {
            if (u && u.email) return settle({ name: u.name || "", email: u.email });
            if (auth.signedEmail && auth.signedEmail()) {
              return settle({ name: "", email: auth.signedEmail() });
            }
            settle(null);
          })
          .catch(() => settle(null));
      })
      .catch(() => settle(null));

    return () => {
      alive = false;
    };
  }, []);

  /* before we know, show the Login button rather than flashing an avatar */
  if (!ready || !who) {
    return (
      <a
        href="/gogo/auth?next=%2Fgogo%2F"
        className={`gh-btn hidden h-10 px-4 text-[13px] md:inline-flex ${className}`}
      >
        Login
      </a>
    );
  }

  const initials = initialsOf(who.name, who.email);
  const first = (who.name || who.email).split(/[\s@]/)[0];
  const label = who.name ? `${who.name}, open your trips` : "Open your trips";

  /* Signed in: an avatar disc with the initials, and the first name beside it
     on wider screens. It links to My trips, which is where a signed-in rider
     actually wants to go. */
  return (
    <a
      href="/gogo/rider"
      aria-label={label}
      title={who.name || who.email}
      className={`gh-account group inline-flex h-10 items-center gap-2 rounded-full pl-1 pr-3 ${className}`}
    >
      <span className="gh-account-av" aria-hidden>
        {initials}
      </span>
      <span className="gh-account-name hidden lg:inline">{first}</span>
    </a>
  );
}

/* The mobile button keeps the same behaviour so the two never disagree. */
export function MobileAccountButton() {
  const [who, setWho] = React.useState<Who>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const settle = (n: Who) => { if (alive) { setWho(n); setReady(true); } };
    ensureAuth()
      .then(() => {
        const auth = (window as any).GOGOAuth;
        if (!auth || !auth.checkSession) return settle(null);
        return auth.checkSession()
          .then((u: any) => {
            if (u && u.email) return settle({ name: u.name || "", email: u.email });
            if (auth.signedEmail && auth.signedEmail()) return settle({ name: "", email: auth.signedEmail() });
            settle(null);
          })
          .catch(() => settle(null));
      })
      .catch(() => settle(null));
    return () => { alive = false; };
  }, []);

  if (!ready || !who) {
    return (
      <a href="/gogo/auth?next=%2Fgogo%2F" className="gh-btn-cta">
        <LogIn className="h-3.5 w-3.5" /> Login
      </a>
    );
  }

  return (
    <a href="/gogo/rider" className="gh-account" aria-label="Open your trips">
      <span className="gh-account-av" aria-hidden>
        {initialsOf(who.name, who.email)}
      </span>
    </a>
  );
}

/* kept for the import site that used to render a bare icon */
export const AccountIcon = User;
