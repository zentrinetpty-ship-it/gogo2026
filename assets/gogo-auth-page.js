/* =========================================================================
   GOGO — SIGN IN / SIGN UP  (phone code)

   Replaces a 31KB email/password client that talked to routes which did not
   exist on the server — it could never have worked. One identity now: the phone
   number, which the driver also needs to reach the rider.

   THREE STEPS, ONE PAGE
       1. number      -> request a code
       2. code        -> verify, which creates the account on first use
       3. name + town -> only for a brand-new account

   The step is derived from the SERVER's answer, not from a local flag. A new
   number always lands on step 3 because verify-otp returns needsProfile: true,
   and a returning rider never sees it.

   ── THE PART THAT MATTERS MORE THAN THE DESIGN ───────────────────────────
   Every failure names its cause and what to do. "Something went wrong" is not
   an error message. The server writes these strings for humans and the page
   shows them verbatim, so there is one place to fix a wording, not two.
   ========================================================================= */

const GOGOAuthPage = (() => {
  const API = "/api";

  let step = 1;                 // 1 number | 2 code | 3 profile
  let phone = "";               // canonical, from the server
  let phonePretty = "";
  let isNewUser = false;
  let cfg = null;
  let busy = false;
  let resendAt = 0;             // ms timestamp when resend unlocks
  let ticker = null;

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function get(path) {
    const r = await fetch(API + path, { headers: { Accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ...j };
  }

  async function post(path, payload, token) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const r = await fetch(API + path, {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ...j };
  }

  /* ── session ──────────────────────────────────────────────────────────
     The cookie alone would keep a reload signed in, but the static pages are
     separate documents that cannot share a JS variable, so the token is also
     kept locally. It is only a convenience: /auth/me is always the truth. */
  const tokenKey = "gogo_token";
  const getToken = () => { try { return localStorage.getItem(tokenKey) || ""; } catch (e) { return ""; } };
  const setToken = (t) => { try { if (t) localStorage.setItem(tokenKey, t); else localStorage.removeItem(tokenKey); } catch (e) {} };


  /* ── shared bottom nav ────────────────────────────────────────────────
     Identical to the bar on the other 19 pages: four items, flat white bar,
     active in ink with a lime dot. Injected here rather than by gogo.js
     because the auth page deliberately has no chat bubble or header repaint.

     None of the four is the auth page itself, so nothing is "active" — which is
     honest: signing in is not a destination in the tab bar. */
  function navBar() {
    return `
      <nav class="g-tabbar ga-nav" aria-label="Main">
        <a class="g-tab" href="/gogo/">
          <span class="g-tab-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 10.4 12 3l9 7.4"/><path d="M5.5 9.2V20h13V9.2"/>
            </svg>
          </span>
          <span class="g-tab-lb">Home</span>
          <i class="g-tab-dot" aria-hidden="true"></i>
        </a>
        <a class="g-tab" href="/gogo/dashboard.html">
          <span class="g-tab-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/>
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/>
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/>
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>
            </svg>
          </span>
          <span class="g-tab-lb">Dashboard</span>
          <i class="g-tab-dot" aria-hidden="true"></i>
        </a>
        <a class="g-tab" href="/gogo/messages.html">
          <span class="g-tab-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20.5 11.6a7.9 7.9 0 0 1-8.5 7.9 8.6 8.6 0 0 1-3.6-.9L3.5 20l1.4-4.7a7.8 7.8 0 0 1-1-3.7 7.9 7.9 0 0 1 8-7.9 7.9 7.9 0 0 1 8.6 7.9Z"/>
            </svg>
          </span>
          <span class="g-tab-lb">Messages</span>
          <i class="g-tab-dot" aria-hidden="true"></i>
        </a>
        <a class="g-tab" href="/gogo/why.html">
          <span class="g-tab-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="2.4"/>
            </svg>
          </span>
          <span class="g-tab-lb">More</span>
          <i class="g-tab-dot" aria-hidden="true"></i>
        </a>
      </nav>`;
  }

  /* ── the shell ────────────────────────────────────────────────────────── */
  function render() {
    const host = document.getElementById("authRoot");
    if (!host) return;

    host.innerHTML = `
      <div class="ga">
        <div class="ga-brand">
          <span class="ga-mark" aria-hidden="true"><i>G</i></span>
          <span class="ga-word">GOGO</span>
        </div>

        <div class="ga-card">
          ${step === 1 ? stepNumber() : ""}
          ${step === 2 ? stepCode() : ""}
          ${step === 3 ? stepProfile() : ""}
        </div>

        <p class="ga-foot">
          ${step === 1
            ? "One account for rides, parcels and saved routes."
            : "By continuing you agree to travel with GOGO's safety rules."}
        </p>
      </div>
      ${navBar()}`;

    wire();
  }

  /* ── step 1: the number ───────────────────────────────────────────────── */
  function stepNumber() {
    return `
      <h1 class="ga-h1">What's your number?</h1>
      <p class="ga-lede">We'll text you a six-digit code. New here? Same form, we'll set up your account.</p>

      <label class="ga-field">
        <span>Mobile number</span>
        <div class="ga-phone">
          <i class="ga-cc">+27</i>
          <input id="gaPhone" class="ga-input" type="tel" inputmode="numeric"
                 autocomplete="tel-national" placeholder="82 555 1234"
                 aria-label="Mobile number" maxlength="14" />
        </div>
      </label>

      <div id="gaErr" class="ga-err" role="alert" hidden></div>

      <button class="ga-btn ga-btn-ink" id="gaSend" type="submit">
        <span>Send code</span>
      </button>

      <p class="ga-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>
        </svg>
        We only use your number for your ride and your driver.
      </p>`;
  }

  /* ── step 2: the code ─────────────────────────────────────────────────── */
  function stepCode() {
    return `
      <button class="ga-back" id="gaBack" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
        ${esc(phonePretty)}
      </button>

      <h1 class="ga-h1">Enter your code</h1>
      <p class="ga-lede">We sent a six-digit code to <b>${esc(phonePretty)}</b>.</p>

      ${cfg && cfg.devMode ? `
        <div class="ga-dev">
          <b>SMS isn't connected yet</b>
          <span>Your code appears below so you can finish signing in.</span>
          <code id="gaDevCode">— — — — — —</code>
        </div>` : ""}

      <label class="ga-field">
        <span>Six-digit code</span>
        <input id="gaCode" class="ga-input ga-code" type="text" inputmode="numeric"
               autocomplete="one-time-code" placeholder="000000" maxlength="6"
               aria-label="Six-digit code" />
      </label>

      <div id="gaErr" class="ga-err" role="alert" hidden></div>

      <button class="ga-btn ga-btn-lime" id="gaVerify" type="submit">Verify and continue</button>

      <button class="ga-resend" id="gaResend" type="button" disabled>
        <span id="gaResendTx">Resend code</span>
      </button>`;
  }

  /* ── step 3: name and town ────────────────────────────────────────────── */
  function stepProfile() {
    return `
      <h1 class="ga-h1">Almost there</h1>
      <p class="ga-lede">Your driver needs a name to look for, and your town tells us which vans you can catch.</p>

      <label class="ga-field">
        <span>Your name</span>
        <input id="gaName" class="ga-input" type="text" autocomplete="name"
               placeholder="Thabo Mbeki" aria-label="Your name" maxlength="60" />
      </label>

      <label class="ga-field">
        <span>Where do you usually travel from?</span>
        <select id="gaHome" class="ga-input ga-select" aria-label="Home town">
          <option value="">Choose your town</option>
          <option>East London</option>
          <option>Komani</option>
          <option>Butterworth</option>
          <option>Idutywa</option>
          <option>Mthatha</option>
          <option>Cathcart</option>
          <option>Queenstown</option>
          <option>Gqeberha</option>
          <option>Bhisho</option>
          <option>King William's Town</option>
        </select>
      </label>

      <div id="gaErr" class="ga-err" role="alert" hidden></div>

      <button class="ga-btn ga-btn-lime" id="gaFinish" type="submit">Start using GOGO</button>`;
  }

  /* ── wiring ───────────────────────────────────────────────────────────── */
  function wire() {
    const err = () => document.getElementById("gaErr");

    function showErr(msg) {
      const e = err();
      if (!e) return;
      e.textContent = msg;
      e.hidden = false;
    }
    function clearErr() {
      const e = err();
      if (e) e.hidden = true;
    }

    /* step 1 */
    const send = document.getElementById("gaSend");
    if (send) {
      const inp = document.getElementById("gaPhone");
      inp.addEventListener("input", () => {
        clearErr();
        /* gentle grouping so a rider can see it is a SA mobile */
        const d = inp.value.replace(/\D/g, "").replace(/^0/, "").slice(0, 9);
        let out = d;
        if (d.length > 2) out = d.slice(0, 2) + " " + d.slice(2);
        if (d.length > 5) out = d.slice(0, 2) + " " + d.slice(2, 5) + " " + d.slice(5);
        inp.value = out;
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); askCode(); }
      });
      send.addEventListener("click", askCode);
      setTimeout(() => inp.focus(), 60);
    }

    /* step 2 */
    const verify = document.getElementById("gaVerify");
    if (verify) {
      const inp = document.getElementById("gaCode");
      inp.addEventListener("input", () => {
        clearErr();
        inp.value = inp.value.replace(/\D/g, "").slice(0, 6);
        if (inp.value.length === 6) checkCode();
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); checkCode(); }
      });
      verify.addEventListener("click", checkCode);
      document.getElementById("gaBack").addEventListener("click", () => {
        step = 1; render();
      });
      document.getElementById("gaResend").addEventListener("click", askCode);
      startResendTicker();
      setTimeout(() => inp.focus(), 60);
    }

    /* step 3 */
    const finish = document.getElementById("gaFinish");
    if (finish) {
      finish.addEventListener("click", saveProfile);
    }
  }

  /* ── actions ──────────────────────────────────────────────────────────── */

  async function askCode() {
    if (busy) return;
    const e = document.getElementById("gaErr");
    const inp = document.getElementById("gaPhone");
    const raw = inp ? inp.value.trim() : phone;

    if (!raw.replace(/\D/g, "")) {
      if (e) { e.textContent = "Enter your mobile number first."; e.hidden = false; }
      return;
    }

    busy = true;
    if (e) e.hidden = true;

    try {
      const r = await post("/auth/request-otp", { phone: raw });
      if (!r.ok) {
        if (e) { e.textContent = r.message || "We could not send a code. Try again."; e.hidden = false; }
        /* a rate limit tells us when to try again; honour it rather than
           letting the user hammer the button */
        if (r.code === "cooldown" && r.retryAfter) {
          resendAt = Date.now() + r.retryAfter * 1000;
          if (step === 2) startResendTicker();
        }
        return;
      }

      phone = r.phone;
      phonePretty = r.phonePretty;
      isNewUser = !!r.isNewUser;
      step = 2;
      resendAt = Date.now() + (cfg ? cfg.resendSeconds : 30) * 1000;
      render();

      /* dev mode: put the code on screen so the flow is testable, and say so */
      if (r.dev && r.devCode) {
        const slot = document.getElementById("gaDevCode");
        if (slot) slot.textContent = r.devCode;
      } else if (r.devCode) {
        /* no dev banner but a code came back — still surface it */
        const slot = document.getElementById("gaDevCode");
        if (slot) slot.textContent = r.devCode;
      }
    } catch (err2) {
      if (e) { e.textContent = "Could not reach GOGO. Check your connection and try again."; e.hidden = false; }
    } finally {
      busy = false;
    }
  }

  async function checkCode() {
    if (busy) return;
    const inp = document.getElementById("gaCode");
    const e = document.getElementById("gaErr");
    const code = inp ? inp.value.replace(/\D/g, "") : "";

    if (code.length !== 6) {
      if (e) { e.textContent = "The code is six digits."; e.hidden = false; }
      return;
    }

    busy = true;
    if (e) e.hidden = true;
    const btn = document.getElementById("gaVerify");
    if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }

    try {
      const r = await post("/auth/verify-otp", { phone, code });
      if (!r.ok) {
        if (e) { e.textContent = r.message || "That code did not work."; e.hidden = false; }
        if (btn) { btn.disabled = false; btn.textContent = "Verify and continue"; }
        if (inp) inp.select();
        return;
      }

      setToken(r.token);

      if (r.needsProfile) {
        step = 3;
        render();
        setTimeout(() => {
          const n = document.getElementById("gaName");
          if (n) n.focus();
        }, 60);
      } else {
        goHome();
      }
    } catch (err2) {
      if (e) { e.textContent = "Could not reach GOGO. Check your connection and try again."; e.hidden = false; }
      if (btn) { btn.disabled = false; btn.textContent = "Verify and continue"; }
    } finally {
      busy = false;
    }
  }

  async function saveProfile() {
    if (busy) return;
    const e = document.getElementById("gaErr");
    const name = (document.getElementById("gaName") || {}).value || "";
    const home = (document.getElementById("gaHome") || {}).value || "";

    if (!name.trim()) {
      if (e) { e.textContent = "Enter your name so the driver knows who to look for."; e.hidden = false; }
      return;
    }
    if (!home) {
      if (e) { e.textContent = "Choose the town you travel from most."; e.hidden = false; }
      return;
    }

    busy = true;
    if (e) e.hidden = true;
    const btn = document.getElementById("gaFinish");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    try {
      const r = await post("/auth/profile", { name, home }, getToken());
      if (!r.ok) {
        if (e) { e.textContent = r.message || "Could not save your details."; e.hidden = false; }
        if (btn) { btn.disabled = false; btn.textContent = "Start using GOGO"; }
        return;
      }
      /* remember the town so the ride form pre-fills from now on */
      try { localStorage.setItem("gogo_home_city", r.user.home); } catch (err3) {}
      try { localStorage.setItem("gogo_name", r.user.name); } catch (err4) {}
      try { localStorage.setItem("gogo_phone", r.user.phonePretty); } catch (err5) {}
      goHome();
    } catch (err2) {
      if (e) { e.textContent = "Could not reach GOGO. Check your connection and try again."; e.hidden = false; }
      if (btn) { btn.disabled = false; btn.textContent = "Start using GOGO"; }
    } finally {
      busy = false;
    }
  }

  function goHome() {
    /* a full navigation, not a client route: every other page is a separate
       document and must re-read the session from scratch */
    window.location.href = "/gogo/";
  }

  /* ── resend countdown ─────────────────────────────────────────────────── */
  function startResendTicker() {
    const btn = document.getElementById("gaResend");
    const tx = document.getElementById("gaResendTx");
    if (!btn || !tx) return;
    if (ticker) clearInterval(ticker);

    function tick() {
      const left = Math.ceil((resendAt - Date.now()) / 1000);
      if (left > 0) {
        btn.disabled = true;
        tx.textContent = "Send a new code in " + left + "s";
      } else {
        btn.disabled = false;
        tx.textContent = "Send a new code";
        clearInterval(ticker);
      }
    }
    tick();
    ticker = setInterval(tick, 1000);
  }

  /* ── boot ─────────────────────────────────────────────────────────────── */
  async function boot() {
    /* PAINT FIRST. The shell needs nothing from the server, so it goes up in
       the same frame the script runs. Previously the first paint waited on two
       round trips and the page sat blank until they came back. */
    render();

    /* Then ask. This is an enhancement: if it fails, the page still works —
       code entry only needs /auth/verify-otp, not the config. */
    get("/auth/config")
      .then((c) => {
        if (c && c.ok !== false) {
          cfg = c;
          /* re-render only if we are on a step that shows config (step 2),
             so the dev notice can appear without clobbering typed input */
          if (step === 2) render();
        }
      })
      .catch(() => {});

    /* already signed in and fully set up? then this page has nothing to do */
    get("/auth/me")
      .then((me) => {
        if (me && me.ok && me.user && me.user.onboarded) {
          window.location.replace("/gogo/");
        }
      })
      .catch(() => {});
  }

  return { boot, render };
})();

window.GOGOAuthPage = GOGOAuthPage;
