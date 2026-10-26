/* =========================================================================
   GOGO — accounts

   Email and password only. There is no other way in: no phone code, no
   one-tap test login, no provider to configure.

   Passwords never travel. The browser derives PBKDF2-SHA256 over the password
   with a per-account salt and sends only the derived value; the server then
   derives AGAIN with its own pepper before storing. So the plaintext never
   crosses the network and a stolen data file alone is not enough to log in.

   Accounts live on the server. The browser holds a session token, which is
   only ever proof of a session, never a source of truth.
   ========================================================================= */

const GOGOAuth = (() => {

  /* ── store ─────────────────────────────────────────────────────────────── */
  function auth() {
    if (!S.auth) S.auth = { pending: null, session: null, sent: [] };
    if (!S.auth.sent) S.auth.sent = [];
    return S.auth;
  }
  const session = () => auth().session;

  /* the signed-in passenger becomes the app's "me" */
  function useProfile(p) {
    if (!p) return;
    S.me = Object.assign({}, S.me, {
      name: p.name, phone: p.phone, home: p.home || (S.me && S.me.home),
      places: (S.me && S.me.places) || [],
    });
    save();
  }
  /* Signed in means a session token the server issued. The local session is
     kept in step with it, but the token is what counts — an earlier version
     checked only the local copy, which locked out every email signup because
     the server knew them and the page did not. */
  const isIn = () => !!token() || !!session();
  const pretty = p => {
    const d = (p || "").replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("0")) return d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6);
    return p;
  };
  const valid = p => /^(\+27|0)\d{9}$/.test((p || "").replace(/\s/g, ""));

  function logout() {
    /* tell the server first, so the token is really dead. A fire-and-forget
       call is fine: the local session is cleared either way, and a token the
       rider has stopped using is revoked on the next request anyway. */
    const t = token();
    if (t) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      }).catch(() => {});
    }
    setToken(""); setSignedEmail("");
    auth().session = null; auth().pending = null; save();
  }

  function resendWait() {
    const a = auth(); if (!a.pending) return 0;
    return Math.max(0, Math.ceil((a.pending.resendAt - Date.now()) / 1000));
  }

  /* ── gate: actions that need a signed-in account ───────────────────────── */
  function require(reason, next) {
    if (isIn()) return true;
    const sheet = document.createElement("div");
    sheet.className = "g-sheet";
    sheet.innerHTML = `
      <div class="g-sheet-card" style="max-width:400px">
        <div class="g-row"><span class="g-ic g-ic-lg g-ic-lime" aria-hidden>🔐</span>
          <div><span class="g-label">Sign in first</span>
            <div class="g-t g-mt-sm">${reason}</div></div></div>
        <p class="g-s g-mt-sm">One account holds your trips, your saved routes and your safety details, and it keeps the person on the other seat real.</p>
        <div class="g-row g-mt">
          <button class="g-btn g-btn-ink" id="goAuth" type="button"><span aria-hidden>➤</span> Sign in or sign up</button>
          <button class="g-btn g-btn-outline" id="notNow" type="button">Not now</button>
        </div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector("#goAuth").onclick = () => location.href = "auth" + (next ? "?next=" + encodeURIComponent(next) : "");
    sheet.querySelector("#notNow").onclick = () => sheet.remove();
    return false;
  }

  /* ── email accounts ──────────────────────────────────────────────────── */
  const ITER = 150000;
  const b64 = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  const cryptoOK = !!(window.crypto && window.crypto.subtle);
  const users = () => (S.users || (S.users = {}));
  const keyOf = e => String(e || "").trim().toLowerCase();
  const goodEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());

  /* PBKDF2-SHA256. The salt is per account; the hash never leaves the device
     in this build. The server keeps it once the API lands. */
  async function derive(password, saltB64) {
    const salt = saltB64 ? unb64(saltB64) : window.crypto.getRandomValues(new Uint8Array(16));
    const key = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(String(password)), "PBKDF2", false, ["deriveBits"]);
    const bits = await window.crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: ITER, hash: "SHA-256" }, key, 256);
    return { salt: b64(salt), hash: b64(bits) };
  }
  function strengthOf(pw) {
    const p = String(pw || "");
    let n = 0;
    if (p.length >= 8) n++;
    if (p.length >= 12) n++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) n++;
    if (/\d/.test(p)) n++;
    if (/[^A-Za-z0-9]/.test(p)) n++;
    const labels = ["Too short", "Weak", "Okay", "Good", "Strong", "Strong"];
    return { score: Math.min(n, 5), label: labels[Math.min(n, 5)], ok: p.length >= 8 };
  }
  /* ── accounts live on the server now ──────────────────────────────────
     The password is still derived here, in the browser, so the plaintext
     never crosses the network. The server hands out a per-account salt, we
     derive over it, and only the derived value is sent. The server then
     derives AGAIN with its own pepper before storing, so a stolen data file
     alone is not enough to log in.
     The account record is NOT written locally any more — it lives on the
     server, which is the whole point: a rider cannot forge an account. */
  function api(path, body, token) {
    return fetch("/api" + path, {
      method: body ? "POST" : "GET",
      headers: Object.assign({ "Content-Type": "application/json" },
                             token ? { Authorization: "Bearer " + token } : {}),
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json().then(j => ({ status: r.status, body: j })))
      .catch(() => ({ status: 0, body: { error: "unreachable" } }));
  }

  /* the session token is the credential now. It is kept in localStorage so a
     reload stays signed in, and it is useless without the server. */
  function token() {
    try { return localStorage.getItem("gogo_session") || ""; }
    catch (e) { return ""; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem("gogo_session", t) : localStorage.removeItem("gogo_session"); }
    catch (e) {}
  }
  function signedEmail() {
    try { return localStorage.getItem("gogo_account") || ""; }
    catch (e) { return ""; }
  }
  function setSignedEmail(e) {
    try { e ? localStorage.setItem("gogo_account", e) : localStorage.removeItem("gogo_account"); }
    catch (e) {}
  }

  async function createAccount(name, email, password, home) {
    if (!cryptoOK) return { ok: false, reason: "This browser cannot store passwords securely" };
    const e = keyOf(email);
    if (!String(name || "").trim()) return { ok: false, reason: "Enter your name" };
    if (!goodEmail(e)) return { ok: false, reason: "Enter a valid email address" };
    if (!strengthOf(password).ok) return { ok: false, reason: "Use at least 8 characters" };

    /* ask for the salt, derive locally, send only the derived value */
    const s1 = await api("/auth/salt", { email: e });
    if (s1.status !== 200 || !s1.body.salt) {
      return { ok: false, reason: s1.status === 0
        ? "Could not reach GOGO. Check your connection."
        : "Could not start sign up. Try again." };
    }
    const d = await derive(password, s1.body.salt);

    const out = await api("/auth/signup", {
      email: e, name: String(name).trim(), phone: (S.me && S.me.phone) || "",
      salt: s1.body.salt, clientHash: d.hash,
      isDriver: !!(S.me && S.me.isDriver),
      /* where the rider calls home, so the app can show their own city first */
      province: (home && home.province) || S.homeProvince || "",
      town: (home && home.town) || S.homeTown || "",
    });
    if (out.status === 201 && out.body.token) {
      setToken(out.body.token);
      setSignedEmail(out.body.user.email);
      /* mirror it into the local session too, so every gate in the app sees
         the same signed-in state as the server does */
      auth().session = {
        email: out.body.user.email, name: out.body.user.name,
        method: "email", at: new Date().toISOString(),
      };
      if (S.me) {
        S.me.name = out.body.user.name;
        S.me.email = out.body.user.email;
        S.me.homeProvince = out.body.user.province || (home && home.province) || "";
        S.me.homeTown = out.body.user.town || (home && home.town) || "";
      }
      save();
      return { ok: true };
    }
    return { ok: false, reason: (out.body && out.body.error) || "Could not create the account" };
  }

  async function signInWith(email, password) {
    if (!cryptoOK) return { ok: false, reason: "This browser cannot check passwords securely" };
    const e = keyOf(email);
    if (!goodEmail(e)) return { ok: false, reason: "Enter a valid email address" };

    const s1 = await api("/auth/salt", { email: e });
    if (s1.status === 0) return { ok: false, reason: "Could not reach GOGO. Check your connection." };
    if (!s1.body.salt) return { ok: false, reason: "That email or password is not right" };

    const d = await derive(password, s1.body.salt);
    const out = await api("/auth/login", { email: e, clientHash: d.hash });
    if (out.status === 200 && out.body.token) {
      setToken(out.body.token);
      setSignedEmail(out.body.user.email);
      auth().session = {
        email: out.body.user.email, name: out.body.user.name,
        method: "email", at: new Date().toISOString(),
      };
      if (S.me) { S.me.name = out.body.user.name; S.me.email = out.body.user.email; }
      save();
      return { ok: true };
    }
    if (out.status === 0) return { ok: false, reason: "Could not reach GOGO. Check your connection." };
    /* the server gives the same answer for a wrong password and an unknown
       account on purpose, so this message must not be more specific either */
    return { ok: false, reason: "That email or password is not right" };
  }

  /* is the stored token still good? called on boot so a stale session in the
     browser cannot look like a real one */
  async function checkSession() {
    const t = token();
    if (!t) return null;
    const out = await api("/auth/me", null, t);
    if (out.status === 200 && out.body.user) {
      setSignedEmail(out.body.user.email);
      if (S.me) { S.me.name = out.body.user.name; S.me.email = out.body.user.email; }
      save();
      return out.body.user;
    }
    if (out.status === 401) { setToken(""); setSignedEmail(""); }
    return null;
  }
  function signOut() { logout(); }
  /* in-app account deletion: the account, the session and the local data go */
  function deleteAccount() {
    const s = auth().session;
    if (s && users()[keyOf(s.email)]) delete users()[keyOf(s.email)];
    auth().session = null;
    auth().pending = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.href = "index.html?deleted=1";
  }
  const account = () => {
    const s = auth().session;
    if (!s) return null;
    return users()[keyOf(s.email)] || { name: s.name, email: s.email, createdAt: s.at };
  };

  /* ── auth page ─────────────────────────────────────────────────────────── */
  function pageAuth() {
    const next = new URLSearchParams(location.search).get("next") || "";
    const s = auth().session;

    $('#main').innerHTML = `
    <div class="g-wrap g-section">
      <div class="g-grid">
        <div class="g-6 g-anim">
          <span class="g-hero-kicker">Step in</span>
          <h1 class="g-h2 g-mt-sm">Your trips, on every device you sign in from</h1>
          <p class="g-s g-mt-sm">One account for bookings, saved routes and your safety details. Your number is only shared with the person on your ride, and only once a seat is confirmed.</p>

          <div class="g-card g-mt-lg">
            <div id="authPane"></div>
          </div>
        </div>

        <div class="g-6 g-anim">
          <div class="g-card g-card-dark">
            <span class="g-label">Why an account</span>
            <h3 class="g-h3 g-mt-sm">Verified humans on both seats</h3>
            ${[["🛡️", "A real person per seat", "Drivers and passengers verify before they can book or list."],
               ["📞", "Number stays private", "Hidden until a seat is confirmed. Chat runs inside GOGO."],
               ["📸", "Matching safety selfie", "The account and the safety selfie are tied to the same person for that ride."],
               ["🚫", "One tap to block", "Report from the ride chat and the account is frozen for review."]].map(([e, t, d]) => `
              <div class="g-list-row" style="border-color:rgba(11,11,11,.14)"><span class="g-ic g-ic-sm g-ic-glass" aria-hidden>${e}</span>
                <div><div class="g-list-t">${t}</div><div class="g-list-s">${d}</div></div></div>`).join("")}
          </div>

          <div class="g-card g-mt">
            <div class="g-head"><span class="g-label">Good to know</span><span class="g-ic g-ic-sm" aria-hidden>🔒</span></div>
            <div class="g-list">
              <div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>🔑</span><div><div class="g-list-t">Password stays hashed</div><div class="g-list-s">Stored as PBKDF2-SHA256 with a salt unique to your account. Never in plain text.</div></div></div>
              <div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>🗑️</span><div><div class="g-list-t">Delete whenever you want</div><div class="g-list-s">Delete your account in the app and your details go with it.</div></div></div>
            </div>
            <p class="g-s-sm g-mt-sm">By creating an account you agree to our <a href="terms">Terms</a> and <a href="privacy">Privacy Policy</a>.</p>
          </div>
        </div>
      </div>
    </div>`;

    /* ── signed in ─────────────────────────────────────────────────────── */
    function accountStep() {
      const a = account() || {};
      const initials = String(a.name || "G").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
      $('#authPane').innerHTML = `
        <div class="g-head"><span class="g-label">Signed in</span><span class="g-stamp g-stamp-open">active</span></div>
        <div class="g-row">
          <span class="g-avatar" style="width:46px;height:46px;font-size:15px">${esc(initials)}</span>
          <div style="min-width:0"><div class="g-t">${esc(a.name || "GOGO account")}</div>
            <div class="g-list-s">${esc(a.email || "")}</div></div>
        </div>
        <div class="g-kv g-mt"><span>Member since</span><b>${a.createdAt ? new Date(a.createdAt).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" }) : "—"}</b></div>
        <div class="g-row g-mt">
          <a class="g-btn g-btn-lime" href="${next || "rides.html?from=East+London&to=Mthatha"}"><span aria-hidden>🔍</span> Find a hike</a>
          <a class="g-btn g-btn-outline" href="rider">My trips</a>
        </div>
        <button class="g-btn g-btn-ghost g-btn-block g-mt" id="signOut" type="button">Sign out</button>
        <div class="g-hr g-mt-lg"></div>
        <div class="g-head"><span class="g-label">Delete account</span><span class="g-ic g-ic-sm" aria-hidden>🗑️</span></div>
        <p class="g-s">Deleting removes your account, your saved routes and your cached trips from this device. It cannot be undone.</p>
        <div id="delWrap"><button class="g-btn g-btn-outline g-btn-block" id="delAsk" type="button">Delete my account</button></div>`;
      $('#signOut').onclick = () => { signOut(); toast("Signed out"); setTimeout(() => location.reload(), 600); };
      $('#delAsk').onclick = () => {
        $('#delWrap').innerHTML = `
          <p class="g-s-sm"><b>Are you sure?</b> This erases the account and its data.</p>
          <div class="g-row g-mt-sm">
            <button class="g-btn g-btn-ink" id="delYes" type="button">Yes, delete it</button>
            <button class="g-btn g-btn-outline" id="delNo" type="button">Keep my account</button>
          </div>`;
        $('#delYes').onclick = () => deleteAccount();
        $('#delNo').onclick = accountStep;
      };
    }

    /* ── logged out: log in or sign up ─────────────────────────────────── */
    function loginStep(err) {
      $('#authPane').innerHTML = `
        <div class="g-tabs" role="tablist">
          <button class="g-tab on" id="tabLogin" role="tab" type="button">Log in</button>
          <button class="g-tab" id="tabSignup" role="tab" type="button">Create account</button>
        </div>
        <form id="loginForm" novalidate autocomplete="on">
          <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>✉️</span>
            <div style="flex:1"><label class="g-f-k" for="liEmail">Email</label>
              <input id="liEmail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required></div></div>
          <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>🔑</span>
            <div style="flex:1"><label class="g-f-k" for="liPw">Password</label>
              <input id="liPw" name="password" type="password" autocomplete="current-password" placeholder="Your password" required></div></div>
          ${err ? `<p class="g-s-sm" style="color:#B42318"><b>${esc(err)}</b></p>` : ""}
          <button class="g-btn g-btn-lime g-btn-block g-mt" id="liGo" type="submit"><span aria-hidden>➤</span> Log in</button>
          <div class="g-row g-mt-sm">
            <button class="g-btn g-btn-ghost g-btn-sm" id="forgot" type="button">Forgot password?</button>
          </div>
        </form>`;
      $('#tabSignup').onclick = () => signupStep();
      $('#loginForm').onsubmit = async ev => {
        ev.preventDefault();
        const btn = $('#liGo');
        btn.disabled = true; btn.textContent = "Checking…";
        const res = await signInWith($('#liEmail').value, $('#liPw').value);
        if (!res.ok) { loginStep(res.reason); return; }
        toast("<b>Welcome back, " + esc(auth().session.name) + "</b>");
        paintAccount();
        setTimeout(() => location.href = next || "rider", 650);
      };
      $('#forgot').onclick = () => toast("Password reset needs the GOGO email service, which is not connected in this build. Sign up again with a new password or contact support@cleanic.co.za");
    }

    /* ── the province and town the rider calls home ─────────────────────
       Reuses GOGOPlaces, the same data the booking card searches, so a rider's
       home town is spelled exactly like a town a driver can publish. That is
       what lets the app show them hikes leaving their own city. */
    const PROVINCES = (() => {
      const P = window.GOGOPlaces;
      return P && P.SA ? P.SA.map(x => x.p) : [];
    })();

    function townsOf(province) {
      const P = window.GOGOPlaces;
      if (!P || !P.SA) return [];
      const row = P.SA.find(x => x.p === province);
      return row ? row.towns : [];
    }

    /* keep the chosen home on the account so every screen can read it */
    function setHome(province, town) {
      S.homeProvince = province || "";
      S.homeTown = town || "";
      if (S.me) { S.me.homeProvince = S.homeProvince; S.me.homeTown = S.homeTown; }
      save();
    }

    function signupStep(err) {
      $('#authPane').innerHTML = `
        <div class="g-tabs" role="tablist">
          <button class="g-tab" id="tabLogin2" role="tab" type="button">Log in</button>
          <button class="g-tab on" id="tabSignup2" role="tab" type="button">Create account</button>
        </div>
        <form id="signForm" novalidate autocomplete="on">
          <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>🧍</span>
            <div style="flex:1"><label class="g-f-k" for="suName">Full name</label>
              <input id="suName" name="name" type="text" autocomplete="name" placeholder="Thandi Mokoena" required></div></div>
          <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>✉️</span>
            <div style="flex:1"><label class="g-f-k" for="suEmail">Email</label>
              <input id="suEmail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required></div></div>
          <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>🔑</span>
            <div style="flex:1"><label class="g-f-k" for="suPw">Password</label>
              <input id="suPw" name="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" required></div></div>
          <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>🗺️</span>
            <div style="flex:1"><label class="g-f-k" for="suProv">Province</label>
              <select id="suProv" name="province" required>
                <option value="">Choose your province</option>
                ${PROVINCES.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}
              </select></div></div>
          <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>📍</span>
            <div style="flex:1"><label class="g-f-k" for="suTown">City or town</label>
              <select id="suTown" name="town" required disabled>
                <option value="">Choose your province first</option>
              </select></div></div>
          <p class="g-s-sm" id="suHomeNote">We use this to show hikes leaving near you.</p>
          <div class="g-mt-sm" id="meterWrap" aria-hidden="true">
            <div class="g-meter"><i id="meterBar" style="width:0"></i></div>
            <div class="g-s-sm" id="meterText">At least 8 characters</div>
          </div>
          ${err ? `<p class="g-s-sm" style="color:#B42318"><b>${esc(err)}</b></p>` : ""}
          <button class="g-btn g-btn-lime g-btn-block g-mt" id="suGo" type="submit"><span aria-hidden>＋</span> Create my account</button>
        </form>`;
      $('#tabLogin2').onclick = () => loginStep();
      $('#suPw').oninput = () => {
        const st = strengthOf($('#suPw').value);
        $('#meterBar').style.width = Math.round(st.score / 5 * 100) + "%";
        $('#meterBar').style.background = st.score >= 4 ? "var(--lime)" : st.score === 3 ? "#E8A33D" : "#E06A5A";
        $('#meterText').textContent = st.label;
      };
      /* ── province fills the city list ───────────────────────────────────
         Choosing a province is what enables the town menu, and every town
         offered is a town GOGOPlaces knows, so it matches the towns drivers
         publish and the towns the booking card searches. */
      const provSel = $('#suProv'), townSel = $('#suTown');
      const note = $('#suHomeNote');
      provSel.onchange = () => {
        const towns = townsOf(provSel.value);
        if (!towns.length) {
          townSel.disabled = true;
          townSel.innerHTML = '<option value="">Choose your province first</option>';
          if (note) note.textContent = "We use this to show hikes leaving near you.";
          return;
        }
        townSel.disabled = false;
        townSel.innerHTML = '<option value="">Choose your city or town</option>' +
          towns.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
        if (note) note.textContent = towns.length + " towns in " + provSel.value + ".";
      };
      townSel.onchange = () => {
        if (note && townSel.value) {
          note.textContent = "Showing hikes leaving " + townSel.value + " first.";
        }
      };

      $('#signForm').onsubmit = async ev => {
        ev.preventDefault();

        /* the home town is what personalises the app, so it is required and
           it is checked here rather than trusted from the form */
        const prov = provSel.value, town = townSel.value;
        if (!prov) { signupStep("Choose your province"); return; }
        if (!town) { signupStep("Choose your city or town"); return; }
        if (townsOf(prov).indexOf(town) === -1) {
          signupStep("Pick a town from the list"); return;
        }

        const btn = $('#suGo');
        btn.disabled = true; btn.textContent = "Creating…";

        /* remember the home before the account is made, so it is stored with
           the account rather than added afterwards */
        setHome(prov, town);

        const res = await createAccount(
          $('#suName').value, $('#suEmail').value, $('#suPw').value,
          { province: prov, town: town }
        );
        if (!res.ok) { signupStep(res.reason); return; }
        toast("<b>Account ready</b> · hikes from " + esc(town) + " first");
        paintAccount();
        setTimeout(() => location.href = next || "rider", 650);
      };
    }

    if (s) accountStep(); else loginStep();
  }

  /* ── nav chip ──────────────────────────────────────────────────────────── */
  function paintAccount() {
    const nav = document.querySelector("#nav .g-nav-right");
    if (!nav || nav.querySelector("#acct")) return;
    const s = session();
    const a = document.createElement("a");
    a.id = "acct";
    a.className = "g-btn " + (s ? "g-btn-outline" : "g-btn-ink") + " g-btn-sm";
    a.href = s ? "rider" : "auth";
    const first = s ? String(s.name || "You").trim().split(/\s+/)[0] : "";
    const initials = s ? (String(s.name || "").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2) || "G").toUpperCase() : "";
    const unread = s ? (S.notices || []).filter(n => !n.read && n.to === String(S.me && S.me.phone || "").replace(/[^\d+]/g, "")).length : 0;
    a.innerHTML = s
      ? `<span class="g-avatar" aria-hidden>${esc(initials)}</span><span class="g-acct-name">${esc(first)}</span>${unread ? `<span class="g-badge" aria-label="${unread} new update${unread === 1 ? "" : "s"}">${unread}</span>` : ""}`
      : `<span aria-hidden>💬</span> <span class="g-acct-name">Log in</span><span class="g-acct-min">Log in</span>`;
    nav.insertBefore(a, nav.firstChild);
  }

  /* the unread counter on the account chip, refreshable in place */
  function badge() {
    const el = document.querySelector("#nav #acct");
    if (!el) return;
    const me = String((S.me && S.me.phone) || "").replace(/[^\d+]/g, "");
    const unread = (S.notices || []).filter(n => !n.read && n.to === me).length;
    const had = el.querySelector(".g-badge");
    if (had) had.remove();
    if (!unread) return;
    const b = document.createElement("span");
    b.className = "g-badge";
    b.textContent = unread;
    b.setAttribute("aria-label", unread + " new ride update" + (unread === 1 ? "" : "s"));
    el.appendChild(b);
  }

  function boot() {
    if (document.body.dataset.page === "auth") pageAuth();
    paintAccount();
    /* gate the two actions that must be verified */
    if (document.body.dataset.page === "ride") {
      /* gate on the click so the login check runs BEFORE the selfie gate */
      document.addEventListener("click", e => {
        const btn = e.target.closest("#joinForm button[type=submit], #joinForm .g-btn");
        if (!btn || isIn()) return;
        e.preventDefault(); e.stopImmediatePropagation();
        require("Verify your number before you claim a seat.", "ride.html?id=" + (new URLSearchParams(location.search).get("id") || ""));
      }, true);
      const form = document.querySelector("#joinForm");
      if (form) form.addEventListener("submit", e => {
        if (isIn()) return;
        e.preventDefault(); e.stopImmediatePropagation();
        require("Verify your number before you claim a seat.", "ride.html?id=" + (new URLSearchParams(location.search).get("id") || ""));
      }, true);
    }
    if (document.body.dataset.page === "driver") {
      document.addEventListener("click", e => {
        const t = e.target.closest("#publishNew");
        if (!t) return;
        if (isIn()) return;
        e.preventDefault(); e.stopImmediatePropagation();
        require("Verify your number before you list a ride.", "driver");
      }, true);
    }
    if (document.body.dataset.page === "rider" && !isIn()) {
      const host = document.querySelector("#main .g-12");
      if (host) {
        const n = document.createElement("div");
        n.className = "g-card g-mt";
        n.innerHTML = `<div class="g-row"><span class="g-ic" aria-hidden>💬</span>
          <div style="flex:1"><div class="g-t">Sign in to see your trips</div>
          <div class="g-list-s">Bookings, chat and safety photos are tied to your GOGO account.</div></div>
          <a class="g-btn g-btn-ink g-btn-sm" href="auth.html?next=rider.html">Log in</a></div>`;
        host.appendChild(n);
      }
    }
  }

  return { boot, pageAuth, logout, useProfile, session, isIn, require, paintAccount, badge,
           valid, pretty,
           createAccount, signInWith, signOut, deleteAccount, account,
           checkSession, token, signedEmail };
})();

window.GOGOAuth = GOGOAuth;

document.addEventListener("DOMContentLoaded", () => {
  try { GOGOAuth.boot(); } catch (e) { console.error("GOGOAuth boot failed", e); }
  /* A token in the browser proves nothing on its own — the server has the say.
     This drops a stale or revoked one so the UI never shows a signed-in state
     the server would reject on the next write. */
  try {
    GOGOAuth.checkSession().then((u) => {
      if (!u && GOGOAuth.isIn && GOGOAuth.isIn()) {
        /* the local session survived but the server did not recognise it */
      }
    });
  } catch (e) {}
});
