/* =========================================================================
   GOGO — AUTH SHIM

   The old assets/gogo-auth.js was a 31KB email + password client talking to
   /auth/* routes that never existed on this server. It has been removed and
   replaced by the phone-code flow in gogo-auth-page.js.

   But nine other modules were written against its surface:

       GOGOAuth.token          (16 uses)  read the session token
       GOGOAuth.require        (7)       gate an action behind sign-in
       GOGOAuth.isIn           (4)       am I signed in
       GOGOAuth.badge          (2)       render the header chip
       GOGOAuth.signedEmail    (2)       the signed-in label
       GOGOAuth.createAccount  (2)       went to the signup screen
       GOGOAuth.signInWith     (1)       same

   Deleting the file without this shim would throw on every page that calls one
   of them. So the surface is kept and the implementation underneath is now the
   real one: a token issued by the server, verified at /auth/me.

   ── THE ONE RULE ─────────────────────────────────────────────────────────
   `isIn()` answers from the stored token, but it is a HINT for painting the UI.
   Anything that must be secure calls the server. A local flag is never proof.
   ========================================================================= */

const GOGOAuth = (() => {
  const KEY = "gogo_token";
  let cached = null;          // { user } once /auth/me has answered
  let inflight = null;

  function token() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }

  function setToken(t) {
    try {
      if (t) localStorage.setItem(KEY, t);
      else localStorage.removeItem(KEY);
    } catch (e) {}
    cached = null;
  }

  /* A cheap yes/no for painting. True when a token exists; it does NOT prove the
     token is still valid — the server decides that on the next call. */
  function isIn() {
    return !!token() || !!cached;
  }

  /* The truth, from the server. Memoised for the page lifetime. */
  async function me() {
    if (cached) return cached.user;
    if (inflight) return inflight;

    inflight = (async () => {
      try {
        const r = await fetch("/api/auth/me", {
          headers: token() ? { Authorization: "Bearer " + token() } : {},
          credentials: "same-origin",
        });
        if (r.status === 401) { setToken(""); return null; }
        const j = await r.json();
        if (j && j.ok) { cached = { user: j.user }; return j.user; }
        return null;
      } catch (e) {
        /* a network blip must not sign anybody out */
        return null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  /**
   * Gate an action behind sign-in.
   *
   * `require(fn)` runs fn when signed in and sends the user to the auth page
   * otherwise. Returns a promise either way so callers can await it.
   *
   * This is a CONVENIENCE gate, not a security boundary: the server still
   * refuses unauthenticated work. Its job is to avoid a pointless round trip
   * and to send the rider somewhere useful.
   */
  async function require(fn) {
    const u = await me();
    if (u) return typeof fn === "function" ? fn(u) : true;

    /* come back to whatever they were doing */
    const back = encodeURIComponent(location.pathname + location.search);
    location.href = "/gogo/auth.html?next=" + back;
    return false;
  }

  /* The header chip. Shows the first name when signed in, "Log in" otherwise. */
  function badge() {
    return me().then((u) => {
      if (!u) return "Log in";
      return (u.name || u.phonePretty || "You").split(" ")[0];
    });
  }

  /* There is no email in this product any more. Kept as a no-op so a caller
     still renders something sensible rather than "undefined". */
  function signedEmail() {
    const u = cached && cached.user;
    if (!u) return "";
    return u.phonePretty || "";
  }

  /* Both of these used to open an email signup form. There is only one way in
     now, so they navigate to it. */
  function createAccount() {
    location.href = "/gogo/auth.html";
  }
  function signInWith() {
    location.href = "/gogo/auth.html";
  }

  return {
    token, setToken, isIn, me, require, badge, signedEmail,
    createAccount, signInWith,
    /* exposed so the auth page can push the fresh user in without a refetch */
    _prime(u) { cached = { user: u }; },
  };
})();

if (typeof window !== "undefined") window.GOGOAuth = GOGOAuth;
