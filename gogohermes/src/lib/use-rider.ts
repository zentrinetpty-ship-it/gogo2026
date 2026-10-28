/**
 * The signed-in rider, as the landing header needs it.
 *
 * WHY THIS EXISTS
 * The header used to hardcode a lime "Sign in" button regardless of whether the
 * rider was signed in. After signup the session was valid, the profile was
 * saved, and the header still offered to sign you in — which reads as "it didn't
 * work" even though everything behind it did.
 *
 * ── WHY IT DOESN'T TRUST localStorage FOR THE TRUTH ───────────────────────
 * The token in localStorage is only a hint that a session MIGHT exist. It can be
 * expired, revoked, or forged by hand. So this hook asks the server once on
 * mount and renders from the answer. The local token is used to decide whether
 * asking is worth a request at all — never to populate the UI.
 *
 * A network failure leaves the header in the signed-out state rather than
 * flashing a wrong name: showing "Sign in" to a signed-in rider for one page
 * load is a smaller lie than showing a stranger somebody else's name.
 */

import * as React from "react";

export type Rider = {
  id: string;
  name: string;
  phonePretty: string;
  home: string;
  onboarded: boolean;
};

export type SessionState = {
  /** null while we have not asked yet, or when nobody is signed in */
  rider: Rider | null;
  /** true once the server has answered (right or wrong) */
  settled: boolean;
};

const TOKEN_KEY = "gogo_token";

function storedToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function useRider(): SessionState {
  const [state, setState] = React.useState<SessionState>({
    rider: null,
    // start unsettled only when there is something to check
    settled: !storedToken(),
  });

  React.useEffect(() => {
    const token = storedToken();

    if (!token) {
      setState({ rider: null, settled: true });
      return;
    }

    /* the cookie may also carry the session, so credentials are included even
       when the token is missing from localStorage */
    let cancelled = false;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);

    fetch("/api/auth/me", {
      headers: token ? { Authorization: "Bearer " + token } : {},
      credentials: "same-origin",
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (res.status === 401) {
          /* the token is dead: forget it so we stop asking */
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch {
            /* ignore */
          }
          return null;
        }
        const json = await res.json().catch(() => null);
        return json && json.ok ? json.user : null;
      })
      .then((user) => {
        if (cancelled) return;
        setState({ rider: user || null, settled: true });
      })
      .catch(() => {
        if (cancelled) return;
        /* offline or slow: do not sign anybody out, just stop waiting */
        setState((prev) => ({ rider: prev.rider, settled: true }));
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  return state;
}

/** First name, or the number, or a neutral fallback. */
export function riderLabel(r: Rider | null): string {
  if (!r) return "";
  const n = (r.name || "").trim();
  if (n) return n.split(/\s+/)[0];
  return r.phonePretty || "You";
}
