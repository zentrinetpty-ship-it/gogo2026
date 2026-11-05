/**
 * GOGO — ACCOUNT: profile, settings, driver onboarding, sign out.
 *
 * Replaces the Messages tab. Messages was a nav slot pointing at an empty shell
 * — 73 lines of nothing. A tab that goes nowhere is worse than a missing tab,
 * because it teaches the rider the app is broken. Account is the thing people
 * actually reach for in that position: who am I, what is my number, how do I
 * change my town, how do I sign out, where are my driver details.
 *
 * WHAT LIVES HERE
 *   identity      name, number, home town — the three facts GOGO keys everything off
 *   driver        status if they drive, a way in if they do not
 *   preferences   notifications, install the app
 *   safety        how to leave, how to reach a human
 *
 * WHAT DELIBERATELY DOES NOT LIVE HERE
 *   the chat threads. Driver conversations belong with the ride they are about,
 *   reachable from the card and from the trip. A second inbox is how a message
 *   gets missed.
 */
(function () {
  "use strict";

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function token() {
    try { return localStorage.getItem("gogo_token") || ""; } catch (e) { return ""; }
  }

  async function api(path, opts) {
    const t = token();
    const res = await fetch("/api" + path, Object.assign({
      headers: Object.assign(
        { "Content-Type": "application/json" },
        t ? { Authorization: "Bearer " + t } : {}
      ),
    }, opts || {}));
    let j = {};
    try { j = await res.json(); } catch (e) { j = {}; }
    return { ok: res.ok && j.ok !== false, status: res.status, data: j };
  }

  const I = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.4" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6"/><path d="M10.8 18.4h2.4"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10.4" r="2.4"/></svg>',
    van: '<svg viewBox="0 0 44 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 19.4V9.6c0-1 .5-1.9 1.4-2.4L9.6 4.6c.5-.3 1.1-.4 1.7-.4h20.9c.6 0 1.2.2 1.6.6l4.4 3.7c.5.4.8 1 .8 1.6v9.3"/><path d="M9.4 4.2h22.6"/><path d="M3.2 19.4h38.6"/><circle cx="11.4" cy="20.2" r="2.7"/><circle cx="33.4" cy="20.2" r="2.7"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8.6a6 6 0 1 0-12 0c0 5-2 6.4-2 6.4h16s-2-1.4-2-6.4Z"/><path d="M13.7 18.4a2 2 0 0 1-3.4 0"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10"/><path d="M8 10.4 12 14.4l4-4"/><path d="M5 18.4h14"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2 19.5 6v6c0 4.4-3.2 7.4-7.5 8.8C7.7 19.4 4.5 16.4 4.5 12V6Z"/><path d="M9 12.2l2.2 2.2 4-4.2"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.6a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.5"/><path d="M12 17.2h.01"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4.5h3.2a1.8 1.8 0 0 1 1.8 1.8v11.4a1.8 1.8 0 0 1-1.8 1.8h-3.2"/><path d="M9.6 8.4 6 12l3.6 3.6"/><path d="M6 12h8.4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="M13 6.5 18.5 12 13 17.5"/></svg>',
  };

  /* ── pieces ───────────────────────────────────────────────────────────── */

  function row(icon, label, sub, href, attrs) {
    const inner = `
      <span class="gac-ic" aria-hidden="true">${icon}</span>
      <span class="gac-row-t">
        <span class="gac-row-l">${esc(label)}</span>
        ${sub ? `<span class="gac-row-s">${esc(sub)}</span>` : ""}
      </span>
      <span class="gac-row-a" aria-hidden="true">${I.arrow}</span>`;
    return href
      ? `<a class="gac-row" href="${href}">${inner}</a>`
      : `<button class="gac-row" type="button" ${attrs || ""}>${inner}</button>`;
  }

  function render(user, driver, opts) {
    const signedIn = !!user;
    const name = (user && user.name) || "";
    const initials = name
      ? name.split(/\s+/).filter(Boolean).map(p => p.charAt(0)).slice(0, 2).join("").toUpperCase()
      : (user && user.phonePretty ? "#" : "?");

    return `
    <div class="gac">

      <!-- identity ─────────────────────────────────────────────────────── -->
      ${signedIn ? `
      <section class="gac-id" data-anim="1">
        <div class="gac-av" aria-hidden="true">${esc(initials)}</div>
        <div class="gac-id-t">
          <h1 class="gac-name">${esc(name || "Your account")}</h1>
          <p class="gac-phone">${esc((user && user.phonePretty) || "")}</p>
        </div>
      </section>

      <section class="gac-card" data-anim="2">
        <span class="gac-label">Details</span>
        <div class="gac-list">
          ${row(I.user, "Name", name || "Add your name", null, 'data-edit="name"')}
          ${row(I.phone, "Mobile number", (user && user.phonePretty) || "", null, 'data-edit="phone"')}
          ${row(I.pin, "Home town", (user && user.home) || "Not set", null, 'data-edit="home"')}
        </div>
      </section>` : `
      <section class="gac-hero" data-anim="1">
        <h1 class="gac-h1">Sign in to GOGO</h1>
        <p class="gac-sub">Your number is your account. One code, no password, and your
           trips and parcels follow you to any phone.</p>
        <a class="gac-btn gac-btn-lime" href="auth.html?next=account">Sign in or create an account</a>
      </section>`}

      <!-- driver ───────────────────────────────────────────────────────── -->
      ${signedIn ? `
      <section class="gac-card" data-anim="3">
        <span class="gac-label">Driving</span>
        <div class="gac-list">
          ${driver
            ? row(I.van, "Driver profile", driver.vehicle ? driver.vehicle + " · " + driver.plate : "Finish your details", "dashboard.html?mode=driver")
            : row(I.van, "Become a driver", "List rides and get paid", "dashboard.html?mode=driver")}
        </div>
      </section>

      <!-- preferences ─────────────────────────────────────────────────── -->
      <section class="gac-card" data-anim="4">
        <span class="gac-label">Preferences</span>
        <div class="gac-list">
          <div class="gac-row gac-row-static">
            <span class="gac-ic" aria-hidden="true">${I.bell}</span>
            <span class="gac-row-t">
              <span class="gac-row-l">Trip alerts</span>
              <span class="gac-row-s">Told when your driver is close</span>
            </span>
            <label class="gac-sw">
              <input type="checkbox" id="gacAlerts" ${opts.alerts ? "checked" : ""}>
              <i aria-hidden="true"></i>
              <span class="gac-sr">Trip alerts</span>
            </label>
          </div>
          ${row(I.download, "Install GOGO", "Add it to your home screen", null, 'data-install="1"')}
        </div>
      </section>

      <!-- support ─────────────────────────────────────────────────────── -->
      <section class="gac-card" data-anim="5">
        <span class="gac-label">Help</span>
        <div class="gac-list">
          ${row(I.shield, "Safety centre", "How we keep trips safe", "safety.html")}
          ${row(I.help, "How GOGO works", "Fares, stops and rules", "why.html")}
        </div>
      </section>

      <section class="gac-card gac-card-quiet" data-anim="6">
        <div class="gac-list">
          ${row(I.out, "Sign out", "", null, 'data-signout="1"')}
        </div>
      </section>

      <p class="gac-legal">
        <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>
        <span class="gac-ver">GOGO 1.0</span>
      </p>` : ""}
    </div>`;
  }

  /* ── edit sheet: one field at a time ──────────────────────────────────────
     A single-field sheet is less code and less error surface than a form with
     three inputs, and it means the rider sees exactly what they are changing. */
  function openEdit(field, user, onDone) {
    let sheet = document.querySelector(".gsheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "gsheet";
      sheet.innerHTML = '<div class="gsheet-scrim" data-close></div><div class="gsheet-body"><div class="gsheet-grab"></div><div id="gsheetIn"></div></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener("click", e => { if (e.target.closest("[data-close]")) hide(); });
    }
    const host = sheet.querySelector("#gsheetIn") || sheet.querySelector(".gsheet-body");

    const cfg = {
      name: { label: "Your name", type: "text", value: (user && user.name) || "", placeholder: "Lwazi Ndlovu", hint: "Drivers see this name on your booking." },
      home: { label: "Home town", type: "text", value: (user && user.home) || "", placeholder: "East London", hint: "Used to show rides near you first." },
      phone: { label: "Mobile number", type: "tel", value: (user && user.phonePretty) || "", placeholder: "082 555 1234", hint: "Changing your number means verifying the new one.", readonly: true },
    }[field];

    host.innerHTML = `
      <div class="gwd">
        <h2 class="gwd-h">${esc(cfg.label)}</h2>
        <form id="gacForm">
          <label class="gwd-f">
            <span class="gwd-l">${esc(cfg.label)}</span>
            <input class="gwd-i" id="gacVal" type="${cfg.type}" value="${esc(cfg.value)}"
                   placeholder="${esc(cfg.placeholder)}" ${cfg.readonly ? "readonly" : ""} autocomplete="off">
            <em class="gwd-e" id="gacErr"></em>
          </label>
          <p class="gwd-note">${esc(cfg.hint)}</p>
          ${cfg.readonly ? "" : '<button class="gwd-btn" type="submit">Save</button>'}
        </form>
      </div>`;

    const input = host.querySelector("#gacVal");
    const err = host.querySelector("#gacErr");

    if (!cfg.readonly) {
      host.querySelector("#gacForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const val = input.value.trim();
        if (!val) { err.textContent = "This cannot be empty."; return; }

        const btn = host.querySelector(".gwd-btn");
        btn.disabled = true;
        btn.textContent = "Saving…";

        /* ── the profile is one object, not three independent fields ────────
           /auth/profile validates name AND home together and rejects the whole
           call if either is missing: setProfile() returns bad_home for a
           name-only save. Editing one field therefore has to send the other
           unchanged, or every single-field edit fails with "Could not save
           that" while the API is working perfectly.

           The current values come from `user`, refreshed on each boot, so an
           edit never writes a stale copy of the field it is not touching. */
        const nextName = field === "name" ? val : (user.name || "");
        const nextHome = field === "home" ? val : (user.home || "");

        if (field === "home" && nextName.length < 2) {
          /* can't set a town before there is a name to attach it to */
          err.textContent = "Add your name first.";
          return;
        }

        const res = await api("/auth/profile", {
          method: "POST",
          body: JSON.stringify({ name: nextName, home: nextHome }),
        });

        if (!res.ok) {
          err.textContent = res.data.error || "Could not save that.";
          btn.disabled = false;
          btn.textContent = "Save";
          return;
        }

        /* ── tell the auth cache what the server just told us ──────────────
           GOGOAuth.me() memoises its first answer for the life of the page, so
           without this the re-render below paints the OLD name and the rider
           concludes the save failed — while the database has the new one. The
           server's response is authoritative, so prime the cache from it. */
        if (res.data.user && window.GOGOAuth && GOGOAuth._prime) {
          GOGOAuth._prime(res.data.user);
        }

        hide();
        if (onDone) onDone();
      });
    }

    sheet.classList.add("on");
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => sheet.classList.add("shown"));
    if (!cfg.readonly) setTimeout(() => input.focus(), 260);

    function hide() {
      sheet.classList.remove("shown");
      document.documentElement.style.overflow = "";
      setTimeout(() => sheet.classList.remove("on"), 220);
    }
  }

  /* ── boot ─────────────────────────────────────────────────────────────── */
  async function boot() {
    const host = document.getElementById("main");
    if (!host) return;

    host.innerHTML = '<div class="gac"><div class="gac-loading">Loading…</div></div>';

    let user = null;
    try {
      if (typeof GOGOAuth !== "undefined" && GOGOAuth.me) user = await GOGOAuth.me();
    } catch (e) { /* signed out */ }

    let driver = null;
    if (user) {
      const r = await api("/driver/me");
      if (r.ok && r.data.driver) driver = r.data.driver;
    }

    let alerts = true;
    try { alerts = localStorage.getItem("gogo_alerts") !== "off"; } catch (e) {}

    host.innerHTML = render(user, driver, { alerts });

    /* animate in, one pass */
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const parts = [...host.querySelectorAll("[data-anim]")];
    if (reduce) parts.forEach(p => p.classList.add("in"));
    else parts.forEach((p, i) => setTimeout(() => p.classList.add("in"), 50 + i * 60));

    /* edits */
    host.querySelectorAll("[data-edit]").forEach(b => {
      b.addEventListener("click", () => openEdit(b.getAttribute("data-edit"), user, boot));
    });

    /* alerts toggle */
    const sw = host.querySelector("#gacAlerts");
    if (sw) {
      sw.addEventListener("change", () => {
        try { localStorage.setItem("gogo_alerts", sw.checked ? "on" : "off"); } catch (e) {}
      });
    }

    /* install */
    const inst = host.querySelector("[data-install]");
    if (inst) {
      inst.addEventListener("click", () => {
        /* the PWA prompt is owned by gogo-pwa.js; this just nudges it */
        if (window.gogoPwaPrompt) window.gogoPwaPrompt();
        else if (window.GOGOPWA && GOGOPWA.show) GOGOPWA.show();
      });
    }

    /* sign out */
    const out = host.querySelector("[data-signout]");
    if (out) {
      out.addEventListener("click", async () => {
        out.disabled = true;
        try {
          await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        } catch (e) { /* the local clear still has to happen */ }
        try {
          localStorage.removeItem("gogo_token");
          localStorage.removeItem("gogo_name");
          localStorage.removeItem("gogo_phone");
          localStorage.removeItem("gogo_home_city");
          localStorage.removeItem("gogo_mode");
        } catch (e) {}
        location.href = "/gogo/";
      });
    }
  }

  window.GOGOAccount = { boot };
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body && document.body.getAttribute("data-page") === "account") boot();
  });
})();
