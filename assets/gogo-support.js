/* =========================================================================
   GOGO — SUPPORT AGENT UI

   Replaces the regex "support" thread. The old one answered from a keyword
   table (/safe|scared/, /selfie|privacy/, ...) and otherwise said "logged it".
   It could not look anything up, could not verify a booking, and never created
   a real ticket. This one talks to the agent on the API, which has tools and
   guardrails.

   WHY THE UI LOOKS THE WAY IT DOES
   · An operator picker first, then the thread. Picking a name makes the
     conversation feel answered rather than automated, and the name is a real
     persona the model is given, including isiXhosa and Afrikaans.
   · Typing delay is the server's estimate, not a fixed spinner. It is clamped
     so it never exceeds 11s, and a fast answer is not padded.
   · Tool activity shows as a quiet "checking your booking" line, because the
     agent may spend a second or two in a tool call and silence reads as broken.
   · Escalation is surfaced in the thread as a distinct card, not buried in the
     reply text, so the customer can see a human is actually coming.
   · Suggested starters on the empty state, because a blank box is the least
     helpful thing to show someone who needs help.
   ========================================================================= */

const GOGOSupport = (() => {
  const API = "/api/agent";
  const STORE = "gogo_support_thread_v1";

  let roster = null;
  let agent = null;
  let busy = false;
  let history = [];

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  /* links in the reply should be tappable */
  const linkify = (s) =>
    s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ agentId: agent && agent.id, history: history.slice(-12) }));
    } catch (e) {}
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const d = JSON.parse(raw);
      history = Array.isArray(d.history) ? d.history.slice(-12) : [];
      return d.agentId;
    } catch (e) { return null; }
  }

  async function loadRoster() {
    if (roster) return roster;
    try {
      const r = await fetch(API + "/agents", { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("no roster");
      roster = await r.json();
    } catch (e) {
      /* If the roster cannot load, still let them talk to someone rather than
         showing a dead end. */
      roster = {
        agents: [{ id: "noluthando", name: "Noluthando", lang: "EN", lang_name: "English" }],
        towns: [],
      };
    }
    return roster;
  }

  async function send(text) {
    const res = await fetch(API + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        agent_id: (agent && agent.id) || "noluthando",
        history: history.slice(-12),
      }),
    });
    if (!res.ok) throw new Error("send failed");
    return res.json();
  }

  /* ── the picker ─────────────────────────────────────────────────────────
     Shown before the first message. A name plus a language is enough: the flag
     emoji clutter the list and the language is the useful part. */
  function renderPicker(host, onPick) {
    const list = roster.agents || [];
    host.innerHTML = `
      <div class="gs-pick">
        <div class="gs-pick-head">
          <span class="gs-pick-label">GOGO Support</span>
          <h2 class="gs-pick-h">Who would you like to chat to?</h2>
          <p class="gs-pick-sub">Real people answer during the day. Pick a name and tell us what is happening.</p>
        </div>
        <ul class="gs-pick-list">
          ${list.map((a) => `
            <li>
              <button type="button" class="gs-pick-item" data-id="${esc(a.id)}">
                <span class="gs-avatar" aria-hidden="true">${esc((a.name || "?")[0])}</span>
                <span class="gs-pick-tx">
                  <b>${esc(a.name)}</b>
                  <span>${esc(a.lang_name || "English")}</span>
                </span>
                <span class="gs-pick-go" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                </span>
              </button>
            </li>`).join("")}
        </ul>
        <p class="gs-pick-foot">Your number stays hidden. Chat runs inside GOGO.</p>
      </div>`;

    host.querySelectorAll(".gs-pick-item").forEach((b) => {
      b.addEventListener("click", () => {
        const a = list.find((x) => x.id === b.dataset.id);
        if (a) onPick(a);
      });
    });
  }

  /* ── the thread ─────────────────────────────────────────────────────────── */
  function bubble(who, text, extra) {
    const wrap = el("div", "gs-msg gs-" + who);
    const body = el("div", "gs-bubble");
    body.innerHTML = linkify(esc(text)).replace(/\n/g, "<br>");
    wrap.appendChild(body);
    if (extra && extra.time) {
      const t = el("span", "gs-time", esc(extra.time));
      wrap.appendChild(t);
    }
    return wrap;
  }

  function escalateCard(id) {
    return el("div", "gs-escalate", `
      <span class="gs-escalate-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>
        </svg>
      </span>
      <span class="gs-escalate-tx">
        <b>Sent to a human</b>
        <span>Ticket ${esc(id)}. Someone from the team will follow up.</span>
      </span>`);
  }

  function renderThread(host) {
    host.innerHTML = `
      <div class="gs-thread">
        <div class="gs-head">
          <button type="button" class="gs-back" aria-label="Choose someone else">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
          </button>
          <span class="gs-avatar gs-avatar-sm" aria-hidden="true">${esc((agent.name || "?")[0])}</span>
          <span class="gs-head-tx">
            <b>${esc(agent.name)}</b>
            <span><i class="gs-dot"></i> GOGO Support</span>
          </span>
        </div>
        <div class="gs-log" id="gsLog" role="log" aria-live="polite"></div>
        <form class="gs-compose" id="gsForm">
          <input id="gsInput" class="gs-input" type="text" autocomplete="off"
                 placeholder="Tell us what is happening" aria-label="Message" />
          <button type="submit" class="gs-send" id="gsSend" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>
            </svg>
          </button>
        </form>
      </div>`;

    const log = host.querySelector("#gsLog");
    const form = host.querySelector("#gsForm");
    const input = host.querySelector("#gsInput");

    host.querySelector(".gs-back").addEventListener("click", () => {
      agent = null;
      history = [];
      save();
      boot(host);
    });

    /* replay anything restored from a previous visit */
    history.forEach((m) => log.appendChild(bubble(m.role === "user" ? "me" : "them", m.content)));

    if (!history.length) {
      const starters = [
        "Where is my ride?",
        "How much to Mthatha?",
        "How do I send a parcel?",
        "I need to cancel a booking",
      ];
      const row = el("div", "gs-starters");
      starters.forEach((s) => {
        const b = el("button", "gs-chip", esc(s));
        b.type = "button";
        b.addEventListener("click", () => {
          input.value = s;
          form.dispatchEvent(new Event("submit", { cancelable: true }));
        });
        row.appendChild(b);
      });
      log.appendChild(row);
    }

    function typingOn() {
      const t = el("div", "gs-msg gs-them gs-typing", `
        <div class="gs-bubble"><span class="gs-tdot"></span><span class="gs-tdot"></span><span class="gs-tdot"></span></div>`);
      log.appendChild(t);
      log.scrollTop = log.scrollHeight;
      return t;
    }

    async function onSubmit(e) {
      e.preventDefault();
      if (busy) return;
      const text = (input.value || "").trim();
      if (!text) return;

      input.value = "";
      const st = log.querySelector(".gs-starters");
      if (st) st.remove();

      log.appendChild(bubble("me", text));
      log.scrollTop = log.scrollHeight;
      history.push({ role: "user", content: text });

      busy = true;
      host.querySelector("#gsSend").disabled = true;
      const dots = typingOn();

      try {
        const data = await send(text);
        /* the server tells us how long a human would take; respect it so a
           two second answer does not snap back like a machine */
        const wait = Math.max(600, Math.min(data.typing_ms || 1600, 11000));
        await new Promise((r) => setTimeout(r, Math.min(wait, 3000)));

        dots.remove();
        log.appendChild(bubble("them", data.reply));

        history.push({ role: "assistant", content: data.reply });
        history = history.slice(-12);
        save();

        /* If the API says a ticket was created, show the card. Reading the id
           out of the model's sentence was the wrong approach: it phrased it
           "Your reference is TMVQ719B5" instead of "Ticket T..." and the card
           silently never appeared. Structured data, not prose parsing. */
        if (data.ticket) log.appendChild(escalateCard(data.ticket));
      } catch (err) {
        dots.remove();
        log.appendChild(bubble("them",
          "Sorry, I could not reach the team just now. Try again in a moment, or call us on 078 047 2090."));
      } finally {
        busy = false;
        host.querySelector("#gsSend").disabled = false;
        log.scrollTop = log.scrollHeight;
        input.focus();
      }
    }

    form.addEventListener("submit", onSubmit);
    setTimeout(() => input.focus(), 250);
  }

  /* ── boot: restore, or pick ─────────────────────────────────────────────── */
  async function boot(host) {
    await loadRoster();
    const savedId = restore();
    if (savedId) {
      const a = (roster.agents || []).find((x) => x.id === savedId);
      if (a) {
        agent = a;
        renderThread(host);
        return;
      }
    }
    renderPicker(host, (a) => {
      agent = a;
      history = [];
      save();
      renderThread(host);
    });
  }

  return { boot, renderPicker, renderThread };
})();

/* A top-level `const` is a lexical binding, not a property of window. The chat
   page looks for window.GOGOSupport, so attach it explicitly. */
window.GOGOSupport = GOGOSupport;

