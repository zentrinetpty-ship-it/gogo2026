/**
 * GOGO — DRIVER PROFILE SHEET + PRE-BOOKING CHAT
 *
 * Two overlays the ride card opens without leaving the results list.
 *
 * WHY A SHEET AND NOT A PAGE
 * A rider scanning five rides wants to check one driver, then keep scanning.
 * Navigating to a profile page throws away their scroll position and their
 * search, so checking costs more than it answers. A sheet slides over the list
 * and closes back onto exactly where they were.
 *
 * WHY CHAT IS ALSO A SHEET
 * Same reason, plus one: the first message is usually a question this rider will
 * not ask if it means leaving the list. "Does the van have space for a suitcase"
 * is a booking decision, not a conversation worth losing your place for.
 */
(function () {
  "use strict";

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function token() {
    try { return localStorage.getItem("gogo_token") || ""; } catch (e) { return ""; }
  }

  /* ── one sheet, reused ────────────────────────────────────────────────────
     Creating a new overlay per tap leaks DOM and lets two sheets stack if a
     rider double-taps. One element, replaced content. */
  let sheet = null;

  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement("div");
    sheet.className = "gsheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.innerHTML =
      '<div class="gsheet-scrim" data-close></div>' +
      '<div class="gsheet-body">' +
        '<div class="gsheet-grab" aria-hidden="true"></div>' +
        '<button class="gsheet-x" type="button" data-close aria-label="Close">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        "</button>" +
        '<div class="gsheet-in" id="gsheetIn"></div>' +
      "</div>";
    document.body.appendChild(sheet);

    sheet.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sheet && sheet.classList.contains("on")) close();
    });
    return sheet;
  }

  function open(html) {
    const s = ensureSheet();
    s.querySelector("#gsheetIn").innerHTML = html;
    s.classList.add("on");
    /* locking the page behind a sheet is what stops the list scrolling under a
       finger that is trying to read */
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => s.classList.add("shown"));
    return s;
  }

  function close() {
    if (!sheet) return;
    sheet.classList.remove("shown");
    document.documentElement.style.overflow = "";
    setTimeout(() => {
      sheet.classList.remove("on");
      sheet.querySelector("#gsheetIn").innerHTML = "";
    }, 220);
  }

  /* ── ride + driver lookup ───────────────────────────────────────────────
     The rides live in localStorage under gogo_state_v1.rides, not on a global
     the card markup could reach. Reading the store directly means the sheet
     shows the same ride the card showed, including any seat changes since.
     Wrapped because a corrupt or partially-written store must degrade to "no
     profile" rather than throwing inside a click handler. */
  function rideById(id) {
    try {
      const raw = localStorage.getItem("gogo_state_v1");
      if (!raw) return null;
      const st = JSON.parse(raw);
      if (!st || !Array.isArray(st.rides)) return null;
      return st.rides.find((r) => r.id === id) || null;
    } catch (e) {
      return null;
    }
  }

  /* ── driver profile ───────────────────────────────────────────────────── */
  function openDriver(rideId) {
    const r = rideById(rideId);
    if (!r) return;

    const initials = initialsOf(r.driver);
    const verified = r.rating >= 4.5;

    open(`
      <div class="gprof">
        <div class="gprof-top">
          <span class="gprof-av" aria-hidden="true">${esc(initials)}</span>
          <div class="gprof-id">
            <h2 class="gprof-n">${esc(r.driver)}</h2>
            <p class="gprof-r">
              <span class="gprof-star">★ ${Number(r.rating).toFixed(1)}</span>
              <span class="gprof-dot">·</span>
              <span>${r.trips} trips</span>
            </p>
          </div>
          ${verified ? '<span class="gprof-badge">Verified</span>' : ""}
        </div>

        <div class="gprof-grid">
          <div class="gprof-cell">
            <span class="gprof-l">Vehicle</span>
            <span class="gprof-v">${esc(r.vehicle || "")}</span>
          </div>
          <div class="gprof-cell">
            <span class="gprof-l">Plate</span>
            <span class="gprof-v">${esc(r.plate || "")}</span>
          </div>
          <div class="gprof-cell">
            <span class="gprof-l">Seats</span>
            <span class="gprof-v">${r.seatsTotal || 7}</span>
          </div>
        </div>

        <p class="gprof-note">
          Your number stays private. The driver sees it only once your seat is confirmed,
          and you can message them here before booking.
        </p>

        <button class="gprof-msg" type="button" data-chat="${r.id}">
          Message ${esc(String(r.driver).split(/\s+/)[0])}
        </button>
      </div>
    `);

    sheet.querySelector("[data-chat]").addEventListener("click", () => openChat(rideId));
  }

  /* ── chat ─────────────────────────────────────────────────────────────── */
  async function openChat(rideId) {
    const r = rideById(rideId);
    if (!r) return;

    const t = token();
    if (!t) {
      /* a signed-out rider cannot hold a conversation, and a chat box that eats
         messages is worse than a straight answer */
      open(`
        <div class="gchat">
          <h2 class="gchat-h">Sign in to message ${esc(String(r.driver).split(/\s+/)[0])}</h2>
          <p class="gchat-p">Messages are tied to your account, so we need your number first.
             It takes one code and there is no password.</p>
          <a class="gchat-cta" href="auth.html?next=dashboard">Sign in</a>
        </div>
      `);
      return;
    }

    open(`
      <div class="gchat">
        <div class="gchat-head">
          <span class="gchat-av" aria-hidden="true">${esc(initialsOf(r.driver))}</span>
          <div>
            <h2 class="gchat-h">${esc(r.driver)}</h2>
            <p class="gchat-sub">${esc(r.from)} → ${esc(r.to)} · ${esc(r.vehicle || "")}</p>
          </div>
        </div>
        <div class="gchat-log" id="gchatLog" aria-live="polite">
          <p class="gchat-empty">Ask about luggage, the pickup point, or whether the van waits.</p>
        </div>
        <form class="gchat-form" id="gchatForm">
          <input class="gchat-in" id="gchatIn" type="text" autocomplete="off"
                 placeholder="Ask a question" maxlength="1000" aria-label="Message">
          <button class="gchat-send" type="submit" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12h13"/><path d="M12 5.5 18.5 12 12 18.5"/></svg>
          </button>
        </form>
      </div>
    `);

    const log = sheet.querySelector("#gchatLog");
    const form = sheet.querySelector("#gchatForm");
    const input = sheet.querySelector("#gchatIn");

    function paint(messages) {
      if (!messages.length) {
        log.innerHTML = '<p class="gchat-empty">Ask about luggage, the pickup point, or whether the van waits.</p>';
        return;
      }
      log.innerHTML = messages
        .map(
          (m) => `
        <div class="gchat-m ${m.from === "rider" ? "mine" : "theirs"}">
          <div class="gchat-b">${esc(m.text)}</div>
          <time class="gchat-t">${new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </div>`
        )
        .join("");
      log.scrollTop = log.scrollHeight;
    }

    async function load() {
      try {
        const res = await fetch("/api/chat/" + encodeURIComponent(rideId), {
          headers: { Authorization: "Bearer " + t },
        });
        const j = await res.json();
        paint(j.ok ? j.messages || [] : []);
      } catch (e) {
        paint([]);
      }
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      /* optimistic: the message appears instantly, because waiting on a round
         trip makes typing feel broken. If the send fails the bubble is marked
         and left visible, rather than silently vanishing. */
      input.value = "";
      const pending = document.createElement("div");
      pending.className = "gchat-m mine pending";
      pending.innerHTML = '<div class="gchat-b">' + esc(text) + "</div>";
      log.appendChild(pending);
      log.scrollTop = log.scrollHeight;

      try {
        const res = await fetch("/api/chat/" + encodeURIComponent(rideId), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
          body: JSON.stringify({ text }),
        });
        const j = await res.json();
        pending.classList.remove("pending");
        if (!j.ok) {
          pending.classList.add("failed");
          pending.title = j.error || "Not sent";
        }
      } catch (err) {
        pending.classList.remove("pending");
        pending.classList.add("failed");
        pending.title = "No connection";
      }
    });

    load();
    setTimeout(() => input.focus(), 260);
  }

  /* ── wire every ride card, whenever the list re-renders ─────────────────
     pageRides() rewrites #list on every filter and sort, so delegated
     listeners are the only thing that survives. Binding per card would break
     after the first filter change. */
  document.addEventListener("click", (e) => {
    const chat = e.target.closest("[data-chat]");
    if (chat) {
      e.preventDefault();
      e.stopPropagation();
      openChat(chat.getAttribute("data-chat"));
      return;
    }
    const prof = e.target.closest("[data-driver]");
    if (prof) {
      e.preventDefault();
      e.stopPropagation();
      openDriver(prof.getAttribute("data-driver"));
    }
  });

  window.GOGOOverlays = { open, close, openDriver, openChat };
})();
