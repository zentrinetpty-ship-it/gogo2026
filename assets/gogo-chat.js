/* =========================================================================
   GOGO — Messaging
   • One thread per ride (passenger <-> driver)
   • One platform support thread (passenger or driver <-> GOGO support)
   • System events land in the ride thread (accepted, trip started, ended)
   The other side is simulated in this build: no second device yet.
   ========================================================================= */

const GOGOChat = (() => {
  const nowISO = () => new Date().toISOString();

  function store() {
    if (!S.threads) S.threads = [];
    return S.threads;
  }

  function ensure(rideId, peer, role) {
    const st = store();
    let t = st.find(x => x.rideId === rideId && x.kind === "ride");
    if (!t) {
      t = { id: "t" + rideId, rideId, kind: "ride", peer, role, subtitle: "", messages: [], unread: 0 };
      st.push(t);
    }
    if (peer) t.peer = peer;
    return t;
  }

  function support() {
    const st = store();
    let t = st.find(x => x.kind === "support");
    if (!t) {
      t = {
        id: "t-support", kind: "support", peer: "GOGO Support", role: "platform",
        subtitle: "Safety, fares and disputes · 24/7", messages: [
          { id: "m0", who: "them", text: "Hi, this is GOGO Support. Tell us what is happening and a human joins in minutes.", at: nowISO(), read: true, support: true },
        ], unread: 0,
      };
      st.push(t);
    }
    return t;
  }

  function push(thread, who, text, extra = {}) {
    thread.messages.push(Object.assign({ id: "m" + Date.now() + Math.random().toString(16).slice(2, 6), who, text, at: nowISO(), read: who === "me" }, extra));
    if (who !== "me") thread.unread = (thread.unread || 0) + 1;
    save();
  }

  function system(rideId, text) {
    const st = store();
    let t = st.find(x => x.rideId === rideId && x.kind === "ride");
    if (!t) return;
    push(t, "system", text);
  }

  const SUPPORT = [
    [/safe|scared|threat|harass|danger|emergency/i, "I am logging this as a safety incident right now. If you are in immediate danger call 10111 first. Stay on this thread — a GOGO safety agent is joining and I have your ride, driver and selfie check on screen."],
    [/fare|price|pay|money|refund/i, "Fares are agreed up front and paid to the driver on boarding. If the driver asks for more than the listed fare, do not pay the extra — send me a screenshot here and we handle it."],
    [/late|wait|where|slow|delayed/i, "Thanks for telling me. The driver can see your pickup pin. If he is more than 15 minutes behind the window, we can move you to another hike at no cost."],
    [/parcel|package|bag|luggage/i, "Luggage is declared when you book so the driver can plan his boot. Message your driver in the ride thread if it changed."],
    [/selfie|photo|privacy|delete|camera/i, `The selfie is a security record for that ride session. If anything goes wrong on the trip, we know exactly who was on board. It is shown only to the person you are travelling with, and deleted ${GOGOSafety.RETENTION_H} hours after the trip ends and you tap "I am safe". You can also delete yours right now from the safety centre.`],
    [/driver|behav/i, "Noted. Tell me what the driver did or said and I will attach it to his record. He is notified that a report is open, not who opened it."],
    [/stop|queenstown|butterworth|pick ?up address/i, "Stops can be added by the driver on the route. Tell me the town and I will ask him to add it to the hop-off list."],
  ];

  function supportReply(text) {
    for (const [re, answer] of SUPPORT) if (re.test(text)) return answer;
    return "Got it — I have logged that against your ride. A GOGO agent will reply on this thread, and I will keep you posted here.";
  }

  /* the peer reacting (simulated: there is no second device in this build) */
  function simulatePeer(thread) {
    const t = thread.kind === "support" ? support() : thread;
    const replies = {
      driver: ["Sharp, I see you. Will hoot when I turn into your street.", "On my way, 12 minutes out.", "Okay, wait by the gate, I am in a white Quantum."],
      passenger: ["Thank you, I am outside now.", "Please give me 5 minutes, I am coming.", "Is there space for one more bag in the boot?"],
    };
    const set = replies[t.role === "driver" ? "passenger" : "driver"] || replies.driver;
    const text = set[Math.floor(Math.random() * set.length)];
    const el = document.querySelector("#typing");
    if (el) el.innerHTML = `<i></i><i></i><i></i> ${esc(t.peer)} is typing`;
    setTimeout(() => {
      if (el) el.innerHTML = "";
      push(t, "them", text, { support: t.kind === "support" });
      if (document.body.dataset.page === "messages") renderThread(t.id, true);
    }, 1700);
  }

  const unreadTotal = () => store().reduce((n, t) => n + (t.unread || 0), 0);

  const rideThread = r => store().find(t => t.rideId === r.id && t.kind === "ride");

  /* ── messages page ─────────────────────────────────────────────────────── */
  let openThreadId = null;

  function pageMessages() {
    const st = store();
    support();
    const list = st.slice().sort((a, b) => {
      const la = a.messages.length ? a.messages[a.messages.length - 1].at : "";
      const lb = b.messages.length ? b.messages[b.messages.length - 1].at : "";
      return lb.localeCompare(la);
    });
    if (!openThreadId) openThreadId = list[0] ? list[0].id : null;

    $('#main').innerHTML = `
    <div class="g-wrap g-section">
      <div class="g-between g-anim">
        <div><span class="g-label">Messages</span><h1 class="g-h2 g-mt-sm">Ride chat and platform support</h1>
          <p class="g-s">Chat with the driver on your ride, or open a safety thread with GOGO. Numbers stay hidden until a seat is confirmed.</p></div>
        <div class="g-row">
          <span class="g-stamp g-stamp-idle">${st.length} thread${st.length === 1 ? "" : "s"}</span>
          <a class="g-btn g-btn-outline g-btn-sm" href="safety"><span aria-hidden>🛡️</span> Safety centre</a>
        </div>
      </div>

      <div class="g-grid g-mt-lg">
        <div class="g-4 g-anim">
          <div class="g-card">
            <div class="g-head"><span class="g-label">Ride updates</span><span class="g-ic g-ic-sm" aria-hidden>💺</span></div>
            <div class="g-updates" id="updatesList"></div>
          </div>
          <div class="g-card g-mt">
            <div class="g-head"><span class="g-label">Threads</span><span class="g-ic g-ic-sm" aria-hidden>💬</span></div>
            <div id="threadList"></div>
          </div>
          <div class="g-card g-mt">
            <div class="g-head"><span class="g-label">Start a thread</span><span class="g-ic g-ic-sm" aria-hidden>➕</span></div>
            <p class="g-s">No driver yet? Ask the platform to find you a seat on the route.</p>
            <button class="g-btn g-btn-ink g-btn-block g-mt" id="newSupport" type="button"><span aria-hidden>🛡️</span> Message GOGO support</button>
          </div>
        </div>

        <div class="g-8 g-anim">
          <div class="g-card" id="threadPane"></div>
        </div>
      </div>
    </div>`;

    $('#newSupport').onclick = () => { const t = support(); openThreadId = t.id; renderThread(t.id); };

    /* seats fill up: whoever is already on the ride hears about it */
    function renderUpdates() {
      const me = String((S.me && S.me.phone) || "").replace(/[^\d+]/g, "");
      const mine = (S.notices || []).filter(n => !me || n.to === me).slice(0, 6);
      const box = $('#updatesList');
      if (!box) return;
      box.innerHTML = mine.length
        ? mine.map(n => `
        <div class="g-update${n.read ? "" : " unread"}">
          <span class="g-update-ic" aria-hidden>💺</span>
          <div style="min-width:0">
            <div class="g-update-t">${esc(n.text)}</div>
            <div class="g-update-s">${esc(n.sub || "")}</div>
          </div>
          <span class="g-update-w">${n.at ? new Date(n.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
        </div>`).join("")
        : `<p class="g-s">No updates yet. When someone else books a seat on your ride, you will see it here with the seats left.</p>`;
      /* opening the page is reading them: clear the counter */
      let changed = false;
      (S.notices || []).forEach(n => { if (!n.read && (!me || n.to === me)) { n.read = true; changed = true; } });
      if (changed) { save(); if (window.GOGOAuth && GOGOAuth.badge) GOGOAuth.badge(); }
    }

    function renderList() {
      $('#threadList').innerHTML = list.map(t => {
        const last = t.messages[t.messages.length - 1];
        const when = last ? new Date(last.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        return `
        <div class="g-thread" data-open="${t.id}">
          <span class="g-ic ${t.kind === "support" ? "g-ic-lime" : ""}" aria-hidden>${t.kind === "support" ? "🛡️" : (window.GOGO && GOGO.van ? GOGO.van() : '')}</span>
          <div style="min-width:0">
            <div class="g-list-t">${esc(t.peer)}</div>
            <div class="g-list-s" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px">${last ? esc(last.text.slice(0, 44)) : "No messages yet"}</div>
          </div>
          <div class="g-thread-badge" style="display:${t.unread ? "grid" : "none"}">${t.unread || ""}</div>
          <span class="g-thread-when">${when}</span>
        </div>`;
      }).join("") || `<p class="g-s">No threads yet.</p>`;
      $$('[data-open]').forEach(el => el.onclick = () => { openThreadId = el.dataset.open; renderThread(openThreadId); });
    }

    window.renderThreadList = renderList;
    renderList();

    renderUpdates();
    if (openThreadId) renderThread(openThreadId);
  }

  function renderThread(id, keepScroll) {
    const t = store().find(x => x.id === id);
    if (!t) return;
    t.unread = 0; save();
    openThreadId = id;
    const pane = $('#threadPane');
    if (!pane) return;

    const ride = t.rideId ? S.rides.find(r => r.id === t.rideId) : null;
    pane.innerHTML = `
      <div class="g-between">
        <div class="g-row">
          <span class="g-ic ${t.kind === "support" ? "g-ic-lime" : ""}" aria-hidden>${t.kind === "support" ? "🛡️" : (window.GOGO && GOGO.van ? GOGO.van() : '')}</span>
          <div><div class="g-t">${esc(t.peer)}</div>
            <div class="g-list-s">${t.kind === "support" ? "Platform support · 24/7" : (ride ? esc(ride.from + " → " + ride.to) : "Ride chat")}</div></div>
        </div>
        <div class="g-row">
          ${t.kind === "support" ? `<span class="g-stamp g-stamp-full">agent online</span>` : `<span class="g-stamp g-stamp-idle">numbers hidden</span>`}
          ${ride ? `<a class="g-btn g-btn-outline g-btn-sm" href="ride.html?id=${ride.id}">Ride</a>` : ""}
        </div>
      </div>

      <div class="g-chat g-mt" id="chatScroll">
        ${t.messages.map(m => bubble(m, t)).join("")}
      </div>
      <div class="g-typing g-mt-sm" id="typing"></div>

      <div class="g-composer">
        <textarea id="composer" rows="1" placeholder="Message ${esc(t.peer)}…" aria-label="Message"></textarea>
        <button class="g-btn g-btn-ink" id="sendBtn" type="button"><span aria-hidden>➤</span> Send</button>
      </div>
      <div class="g-quick">
        ${quickReplies(t).map(q => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
      </div>`;

    const scroller = $('#chatScroll');
    if (scroller) scroller.scrollTop = keepScroll ? scroller.scrollHeight : scroller.scrollHeight;

    const input = $('#composer');
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      push(t, "me", text, { support: t.kind === "support" });
      input.value = "";
      renderThread(t.id, true);
      if (window.renderThreadList) window.renderThreadList();
      if (t.kind === "support") {
        setTimeout(() => {
          const el = document.querySelector("#typing");
          if (el) el.innerHTML = `<i></i><i></i><i></i> GOGO Support is typing`;
          setTimeout(() => { push(t, "them", supportReply(text), { support: true }); if (openThreadId === t.id) renderThread(t.id, true); }, 1400);
        }, 350);
      } else {
        simulatePeer(t);
      }
    };
    $('#sendBtn').onclick = send;
    input.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
    $$('[data-q]').forEach(b => b.onclick = () => { input.value = b.dataset.q; send(); });
    input.focus();
  }

  function quickReplies(t) {
    if (t.kind === "support") return ["I don't feel safe", "Fare question", "Driver is late", "How long are selfies kept?"];
    const acc = (t.rideId ? (S.rides.find(r => r.id === t.rideId) || {}).requests || [] : []);
    void acc;
    return ["I'm at the gate", "Running 5 minutes late", "Please wait at the corner", "How far are you?"];
  }

  function bubble(m, t) {
    if (m.who === "system") return `<div class="g-msg g-msg-system"><div class="g-bubble">${esc(m.text)}</div></div>`;
    const mine = m.who === "me";
    const cls = mine ? "g-msg-me" : m.support || t.kind === "support" ? "g-msg-them g-msg-support" : "g-msg-them";
    const time = new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `
      <div class="g-msg ${cls}">
        <div class="g-msg-who">${mine ? "You" : esc(t.peer)}</div>
        <div class="g-bubble">${esc(m.text)}</div>
        <div class="g-msg-meta">${time}${mine ? ` · <span class="g-ticks ${m.read ? "read" : ""}">${m.read ? "READ" : "SENT"}</span>` : ""}</div>
      </div>`;
  }

  /* ── safety centre page ────────────────────────────────────────────────── */
  function pageSafety() {
    const st = GOGOSafety;
    const selfies = (S.safety && S.safety.selfies) || [];
    const rides = S.rides.filter(r => (r.requests || []).length);

    $('#main').innerHTML = `
    <div class="g-wrap g-section">
      <div class="g-between g-anim">
        <div><span class="g-label">Safety centre</span><h1 class="g-h2 g-mt-sm">Your safety photos and how long we keep them</h1>
          <p class="g-s">Every driver and passenger takes one selfie before the ride. It is the security record for that ride session: if anything goes wrong on the trip, we know who was on board. It is shown only to the person you are travelling with, and deleted automatically ${st.RETENTION_H} hours after the trip ends and you tap "I am safe".</p></div>
        <div class="g-row">
          <a class="g-btn g-btn-outline g-btn-sm" href="messages"><span aria-hidden>💬</span> Support chat</a>
          <button class="g-btn g-btn-ink g-btn-sm" id="wipeAll" type="button"><span aria-hidden>🗑️</span> Delete my photos now</button>
        </div>
      </div>

      <div class="g-grid g-mt-lg">
        <div class="g-7 g-anim">
          <div class="g-card">
            <div class="g-head"><span class="g-label">Safety photo vault</span><span class="g-s-sm">${selfies.length} on file</span></div>
            <div class="g-vault" id="vault"></div>
          </div>

          <div class="g-card g-mt">
            <div class="g-head"><span class="g-label">Retention rules</span><span class="g-ic g-ic-sm" aria-hidden>📘</span></div>
            ${[
              ["📸", "Taken when you book or list", "One selfie per person, per ride. Both sides are checked, so nobody rides anonymously."],
              ["🔒", "Held only for the ride", "Visible to the other person on that ride only. Never public, never used for marketing."],
              ["⏱️", `Deleted ${st.RETENTION_H} hours after the trip`, "The clock starts when the ride is completed and every passenger has tapped “I am safe”."],
              ["🗑️", "You can delete early", "One tap removes your photo immediately, on top of the automatic deletion."],
              ["⚠️", "If someone never confirms safe", `After ${st.ESCALATE_H} hours the ride is escalated to platform review and the photos are held for that investigation instead of silently expiring.`],
            ].map(([e, t, s]) => `
              <div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>${e}</span>
                <div><div class="g-list-t">${t}</div><div class="g-list-s">${s}</div></div></div>`).join("")}
            <p class="g-s-sm g-mt">South African law (POPIA) treats a face photo as special personal information. GOGO stores it with your explicit consent, for one purpose only, for the shortest possible time.</p>
          </div>
        </div>

        <div class="g-5 g-anim">
          <div class="g-card">
            <div class="g-head"><span class="g-label">Ride safeguards</span><span class="g-ic g-ic-sm" aria-hidden>🛡️</span></div>
            ${rides.length ? rides.map(r => {
              const accepted = (r.requests || []).filter(q => q.status === "accepted");
              const safeCount = accepted.filter(q => (r.safe || {})[q.phone]).length;
              const photos = st.forRide(r.id).length;
              return `
              <div class="g-list-row">
                <span class="g-ic g-ic-sm ${r.status === "completed" ? "g-ic-lime" : ""}" aria-hidden>${r.status === "completed" ? "✅" : (window.GOGO && GOGO.van ? GOGO.van() : '')}</span>
                <div><div class="g-list-t">${esc(r.from)} → ${esc(r.to)}</div>
                  <div class="g-list-s">${photos} photo${photos === 1 ? "" : "s"} · ${safeCount}/${accepted.length} safe confirmed</div></div>
                <div class="g-list-r">${r.purgeAt ? `<span class="g-count">${st.countdown(r.purgeAt)}</span><div class="g-list-s">until deletion</div>` : `<span class="g-stamp ${r.status === "completed" ? "g-stamp-open" : "g-stamp-idle"}">${r.status === "completed" ? "awaiting safe" : esc(r.status)}</span>`}</div>
              </div>`;
            }).join("") : `<p class="g-s">No rides yet. Your protection starts the moment you book one.</p>`}
          </div>

          <div class="g-card g-mt">
            <div class="g-head"><span class="g-label">Audit trail</span><span class="g-ic g-ic-sm" aria-hidden>🧾</span></div>
            <div class="g-audit" id="audit"></div>
            <p class="g-s-sm g-mt">Every capture, retention decision and deletion is logged with a timestamp.</p>
          </div>
        </div>
      </div>
    </div>`;

    renderVault();
    renderAudit();
    $('#wipeAll').onclick = () => {
      selfies.slice().forEach(s => GOGOSafety.purgeNow(s.id));
      toast("<b>Deleted</b> · your safety photos are gone");
      setTimeout(() => location.reload(), 700);
    };
  }

  function renderVault() {
    const st = GOGOSafety, selfies = (S.safety && S.safety.selfies) || [];
    const el = $('#vault'); if (!el) return;
    el.innerHTML = selfies.length ? selfies.map(s => {
      const r = S.rides.find(x => x.id === s.rideRef);
      const state = s.purgeAt
        ? `<div class="g-count ${new Date(s.purgeAt) - Date.now() < 3600000 ? "g-count-soon" : ""}">${st.countdown(s.purgeAt)}</div><div class="g-list-s">until auto-delete</div>`
        : `<span class="g-stamp g-stamp-open">held for ride</span><div class="g-list-s">deletes after “I am safe”</div>`;
      return `
      <div class="g-vault-item">
        <div class="g-vault-face">${s.dataUrl ? `<img src="${s.dataUrl}" alt="${esc(s.name)}'s safety selfie">` : "🧍"}</div>
        <div style="flex:1;min-width:0">
          <div class="g-list-t">${esc(s.name)} · ${s.role === "driver" ? "driver" : "passenger"}</div>
          <div class="g-list-s">${r ? esc(r.from + " → " + r.to) : s.rideRef} · taken ${st.fmt(s.takenAt)}</div>
          <div class="g-mt-sm">${state}</div>
        </div>
        <button class="g-btn g-btn-outline g-btn-sm" data-del="${s.id}" type="button">Delete</button>
      </div>`;
    }).join("") : `
      <div class="g-empty"><span class="g-ic g-ic-lg" aria-hidden>🛡️</span>
        <h3 class="g-h3">No safety photos stored</h3>
        <p class="g-s g-mt-sm">Book a ride and you will be asked for one selfie. It stays in this vault only until the trip is done and confirmed safe.</p>
        <a class="g-btn g-btn-ink g-mt" href="rides.html?from=East+London&to=Mthatha">Find a ride</a></div>`;
    $$('[data-del]').forEach(b => b.onclick = () => { GOGOSafety.purgeNow(b.dataset.del); toast("Photo deleted"); setTimeout(() => location.reload(), 600); });
  }

  function renderAudit() {
    const el = $('#audit'); if (!el) return;
    const log = GOGOSafety.auditLog();
    el.innerHTML = log.length ? log.slice(0, 12).map(l => `
      <div class="g-audit-row"><span class="g-audit-time">${new Date(l.at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        <span>${esc(l.text)}</span></div>`).join("") : `<p class="g-s">Nothing logged yet.</p>`;
  }

  /* ── enhance other pages: selfie gates, chat buttons, safe / end trip ───── */
  function enhance() {
    const page = document.body.dataset.page;

    /* passenger: selfie required before a join request leaves */
    if (page === "ride") {
      const form = $('#joinForm');
      const rideId = new URLSearchParams(location.search).get("id");
      if (form && rideId) {
        const r = S.rides.find(x => x.id === rideId);
        const gate = document.createElement("div");
        gate.className = "g-safe g-mt";
        const me = GOGOSafety.forRide(rideId).find(s => s.role === "passenger");
        gate.innerHTML = `
          <div class="g-row">
            <span class="g-ic g-ic-lime" aria-hidden>🛡️</span>
            <div style="flex:1"><div class="g-t">Safety selfie ${me ? "on file" : "required"}</div>
              <div class="g-list-s">${me ? `Taken ${GOGOSafety.fmt(me.takenAt)} · auto-deletes after the trip` : `Both sides take one. Kept for this ride, deleted ${GOGOSafety.RETENTION_H}h after it ends.`}</div></div>
            <div class="g-vault-face" style="width:52px;height:52px">${me && me.dataUrl ? `<img src="${me.dataUrl}" alt="">` : "📸"}</div>
          </div>
          <button class="g-btn ${me ? "g-btn-outline" : "g-btn-ink"} g-btn-block g-mt" id="selfieGate" type="button">
            <span aria-hidden>📸</span> ${me ? "Retake my selfie" : "Take my safety selfie"}</button>`;
        const submit = form.querySelector("button[type=submit]");
        form.insertBefore(gate, submit);

        const take = () => GOGOSafety.capture({
          rideRef: rideId, role: "passenger", name: (S.me && S.me.name) || "Passenger",
          onSaved: () => setTimeout(() => location.reload(), 400),
        });
        $('#selfieGate').onclick = take;

        form.addEventListener("submit", e => {
          const has = GOGOSafety.forRide(rideId).some(s => s.role === "passenger");
          if (!has) {
            e.preventDefault(); e.stopImmediatePropagation();
            toast("Take your safety selfie to continue");
            take();
          }
        }, true);
      }
      const back = $('#joinBox');
      if (back && rideId) {
        const thread = ensure(rideId, (S.rides.find(x => x.id === rideId) || {}).driver || "Driver", "driver");
        const link = document.createElement("a");
        link.className = "g-btn g-btn-outline g-btn-block g-mt";
        link.href = "messages";
        link.innerHTML = `<span aria-hidden>💬</span> Message ${esc(thread.peer.split(" ")[0])} about this ride`;
        back.appendChild(link);
      }
    }

    /* rider: live thread, i-am-safe, safety centre link */
    if (page === "rider") {
      const myReq = [];
      S.rides.forEach(r => (r.requests || []).forEach(q => { if (q.phone === S.me.phone && q.status !== "declined") myReq.push({ r, q }); }));
      const live = myReq.find(x => x.q.status === "accepted") || myReq[0];
      if (live) {
        const thread = ensure(live.r.id, live.r.driver, "driver");
        const card = document.querySelector("#main .g-8 .g-card");
        if (card) {
          const bar = document.createElement("div");
          bar.className = "g-row g-mt";
          bar.innerHTML = `
            <a class="g-btn g-btn-ink g-btn-sm" href="messages"><span aria-hidden>💬</span> Message ${esc(live.r.driver.split(" ")[0])}${thread.unread ? ` (${thread.unread})` : ""}</a>
            <a class="g-btn g-btn-outline g-btn-sm" href="safety"><span aria-hidden>🛡️</span> Safety</a>
            <button class="g-btn g-btn-outline g-btn-sm" id="askSupport" type="button"><span aria-hidden>🆘</span> Get help now</button>`;
          card.appendChild(bar);
          $('#askSupport').onclick = () => {
            const t = support();
            push(t, "me", `Help needed on my ride ${live.r.from} → ${live.q.getOff}`, {});
            toast("Support thread opened");
            setTimeout(() => location.href = "messages", 700);
          };
        }

        /* I am safe */
        const safeBox = document.createElement("div");
        safeBox.className = "g-safe g-mt";
        const already = live.r.safe && live.r.safe[live.q.phone];
        safeBox.innerHTML = already
          ? `<div class="g-safe-done"><span aria-hidden>✅</span> You confirmed you are safe${live.r.purgeAt ? ` · safety photos delete in ${GOGOSafety.countdown(live.r.purgeAt)}` : ""}</div>`
          : `<div class="g-row">
               <span class="g-ic g-ic-lime" aria-hidden>🛡️</span>
               <div style="flex:1"><div class="g-t">${live.r.status === "completed" ? "Trip finished — are you safe?" : "At the end of your trip"}</div>
                 <div class="g-list-s">Tapping this closes the safety window and starts the ${GOGOSafety.RETENTION_H}-hour deletion timer for the ride selfies.</div></div>
             </div>
             <button class="g-safe-btn g-btn-block g-mt" id="imSafe" type="button">✅ I am safe</button>`;
        const host = document.querySelector("#main .g-8");
        if (host) host.appendChild(safeBox);
        if ($('#imSafe')) $('#imSafe').onclick = () => {
          const allDone = GOGOSafety.markSafe(live.r, live.q);
          toast(allDone ? "<b>Thanks</b> · all passengers safe · photos delete in 24h" : "<b>Thanks</b> · marked safe");
          setTimeout(() => location.reload(), 800);
        };
      }
    }

    /* driver: selfie, list-a-ride, thread links, end trip */
    if (page === "driver") {
      const r = S.rides.find(x => x.driver === "Sipho M." || (x.requests || []).some(q => q.status !== "declined")) || S.rides[0];
      const accepted = (r.requests || []).filter(q => q.status === "accepted");

      /* driver's own selfie for this ride + list a ride */
      const host = document.querySelector("#main .g-5");
      if (host) {
        const mine = GOGOSafety.forRide(r.id).find(s => s.role === "driver");
        const box = document.createElement("div");
        box.className = "g-card g-mt";
        box.innerHTML = `
          <div class="g-head"><span class="g-label">Driver safety check</span><span class="g-ic g-ic-sm ${mine ? "g-ic-lime" : ""}" aria-hidden>🛡️</span></div>
          <div class="g-row">
            <div class="g-vault-face" style="width:58px;height:58px">${mine && mine.dataUrl ? `<img src="${mine.dataUrl}" alt="">` : "📸"}</div>
            <div style="flex:1"><div class="g-t">${mine ? "Selfie on file" : "Selfie required before passengers board"}</div>
              <div class="g-list-s">${mine ? `Taken ${GOGOSafety.fmt(mine.takenAt)} · passengers on this ride can see it` : "Passengers see this so they know who is collecting them."}</div></div>
          </div>
          <button class="g-btn ${mine ? "g-btn-outline" : "g-btn-ink"} g-btn-block g-mt" id="driverSelfie" type="button">
            <span aria-hidden>📸</span> ${mine ? "Retake driver selfie" : "Take driver selfie"}</button>
          <a class="g-btn g-btn-outline g-btn-block g-mt-sm" href="safety"><span aria-hidden>🧾</span> Safety vault & audit log</a>`;
        host.appendChild(box);
        $('#driverSelfie').onclick = () => GOGOSafety.capture({
          rideRef: r.id, role: "driver", name: r.driver,
          onSaved: () => setTimeout(() => location.reload(), 400),
        });
      }

      /* list a new ride (driver selfie gate before publishing) */
      const host5 = document.querySelector("#main .g-5");
      if (host5) {
        const lr = document.createElement("div");
        lr.className = "g-card g-mt";
        lr.innerHTML = `
          <div class="g-head"><span class="g-label">List a new ride</span><span class="g-ic g-ic-sm" aria-hidden>🗺️</span></div>
          <div class="g-2col">
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>📍</span><div style="flex:1"><label class="g-f-k">From</label>
              <select id="nrFrom">${["East London","Mthatha","Queenstown","Butterworth","Idutywa"].map(c => `<option>${c}</option>`).join("")}</select></div></div>
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>🏁</span><div style="flex:1"><label class="g-f-k">To</label>
              <select id="nrTo">${["Mthatha","East London","Queenstown","Butterworth","Idutywa"].map(c => `<option${c === "Mthatha" ? " selected" : ""}>${c}</option>`).join("")}</select></div></div>
          </div>
          <div class="g-2col">
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>🕕</span><div style="flex:1"><label class="g-f-k">Leave at</label><input id="nrTime" type="time" value="07:00"></div></div>
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>🪑</span><div style="flex:1"><label class="g-f-k">Seats</label>
              <select id="nrSeats">${[2,3,4,5,6,7].map(n => `<option${n === 6 ? " selected" : ""}>${n}</option>`).join("")}</select></div></div>
          </div>
          <div class="g-2col">
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>💰</span><div style="flex:1"><label class="g-f-k">Fare / seat</label><input id="nrFare" value="230"></div></div>
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>🧳</span><div style="flex:1"><label class="g-f-k">Luggage</label>
              <select id="nrLug"><option>Boot space</option><option>Hand luggage only</option><option>Trailer</option></select></div></div>
          </div>
          <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>🚏</span><div style="flex:1"><label class="g-f-k">Stops (comma separated)</label>
            <input id="nrStops" value="Queenstown, Butterworth" placeholder="Queenstown, Butterworth"></div></div>
          <div class="g-safe g-mt-sm">
            <div class="g-s-sm"><b>Security step:</b> one selfie before this goes live. It is the ride-session record, so if anything goes wrong we know who was on board, and it lets your passengers see who is collecting them. It deletes ${GOGOSafety.RETENTION_H}h after the trip and their “I am safe”.</div>
          </div>
          <button class="g-btn g-btn-ink g-btn-block g-mt" id="publishNew" type="button"><span aria-hidden>📸</span> Take selfie and publish ride</button>
          <p class="g-s-sm g-mt-sm">Ride appears in search immediately and passengers can request seats.</p>`;
        host5.appendChild(lr);

        $('#publishNew').onclick = () => {
          const draft = {
            from: $('#nrFrom').value, to: $('#nrTo').value, time: $('#nrTime').value,
            seats: Number($('#nrSeats').value), fare: Number($('#nrFare').value) || 230,
            luggage: $('#nrLug').value,
            stops: $('#nrStops').value.split(",").map(x => x.trim()).filter(Boolean).map((c, i) => ({ city: c, time: "on route", fare: Math.max(90, Math.round(Number($('#nrFare').value) * (0.55 + i * 0.15))) })),
          };
          const newId = "g" + (++S.seq);
          GOGOSafety.capture({
            rideRef: newId, role: "driver", name: r.driver,
            onSaved: () => {
              const d = new Date(); const [hh, mm] = draft.time.split(":").map(Number);
              d.setHours(hh || 7, mm || 0, 0, 0);
              if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
              S.rides.push({
                id: newId, driver: r.driver, rating: r.rating, trips: r.trips, vehicle: r.vehicle, plate: r.plate, colour: r.colour,
                from: draft.from, to: draft.to, depart: d.toISOString(), seatsTotal: draft.seats, luggage: draft.luggage,
                stops: draft.stops, fare: draft.fare, requests: [], status: "open",
              });
              S.activity.unshift({ e: "🗺️", t: "Ride listed · " + draft.from + " → " + draft.to, s: `${draft.seats} seats · ${money(draft.fare)} per seat`, when: "just now" });
              save();
              toast("<b>Ride live</b> · passengers can now request seats");
              setTimeout(() => location.href = "rides.html?from=" + encodeURIComponent(draft.from) + "&to=" + encodeURIComponent(draft.to), 900);
            },
          });
        };
      }

      /* end trip */
      const host7 = document.querySelector("#main .g-7");
      if (host7 && r.status === "started") {
        const box = document.createElement("div");
        box.className = "g-card g-mt";
        box.innerHTML = `
          <div class="g-head"><span class="g-label">Close the trip</span><span class="g-ic g-ic-sm" aria-hidden>🏁</span></div>
          <p class="g-s">Ending the trip asks every passenger to tap “I am safe”. Their safety photos then delete automatically ${GOGOSafety.RETENTION_H} hours later.</p>
          <button class="g-btn g-btn-ink g-btn-block" id="endTrip" type="button"><span aria-hidden>🏁</span> End trip and ask for safe confirmations</button>`;
        host7.appendChild(box);
        $('#endTrip').onclick = () => {
          r.status = "completed"; r.completedAt = new Date().toISOString();
          /* Demo build: seats created by "Fill seats" cannot tap the button,
             so they are confirmed on arrival. Real passengers always tap "I am safe". */
          (r.requests || []).filter(q => q.status === "accepted" && q.demo).forEach(q => { (r.safe = r.safe || {})[q.phone] = r.completedAt; });
          if (window.GOGOPay) { const res = GOGOPay.captureForRide(r); if (res && res.captured) toast("<b>" + res.captured + " payment" + (res.captured === 1 ? "" : "s") + " captured</b> · fees posted to the ledger"); }
          GOGOSafety.schedulePurge(r);
          system(r.id, "Trip completed. Passengers: please tap “I am safe”.");
          toast("<b>Trip ended</b> · passengers asked to confirm safe");
          setTimeout(() => location.reload(), 900);
        };
      }

      /* message each passenger */
      $$(".g-req.accepted").forEach((card, i) => {
        const q = accepted[i];
        if (!q) return;
        const t = ensure(r.id, q.name, "passenger");
        t.subtitle = q.getOff;
        const row = card.querySelector(".g-row");
        if (row) {
          const a = document.createElement("a");
          a.className = "g-btn g-btn-outline g-btn-sm";
          a.href = "messages";
          a.innerHTML = `<span aria-hidden>💬</span> Message ${esc(q.name.split(" ")[0])}${t.unread ? ` (${t.unread})` : ""}`;
          row.appendChild(a);
        }
      });

      /* ride thread summary card */
      if (host7 && accepted.length) {
        const t = ensure(r.id, accepted[0].name, "passenger");
        const box = document.createElement("div");
        box.className = "g-card g-mt";
        box.innerHTML = `
          <div class="g-head"><span class="g-label">Passenger chat</span><span class="g-ic g-ic-sm" aria-hidden>💬</span></div>
          ${accepted.map(q => { const th = ensure(r.id, q.name, "passenger"); const last = th.messages[th.messages.length - 1];
            return `<div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>🧍</span>
              <div><div class="g-list-t">${esc(q.name)}</div><div class="g-list-s">${last ? esc(last.text.slice(0, 40)) : "No messages yet"}</div></div>
              <div class="g-list-r"><span class="g-thread-badge" style="display:${th.unread ? "grid" : "none"}">${th.unread || ""}</span></div></div>`; }).join("")}
          <a class="g-btn g-btn-ink g-btn-block g-mt" href="messages"><span aria-hidden>💬</span> Open chats</a>`;
        host7.appendChild(box);
        void t;
      }
    }

    /* unread badge on the dock + nav */
    const badge = unreadTotal();
    const dockChat = document.querySelector('#dock a[href="messages"]');
    if (dockChat && badge) dockChat.insertAdjacentHTML("beforeend", `<span class="g-thread-badge" style="position:absolute;top:2px;right:14px">${badge}</span>`);
  }

  function boot() {
    const page = document.body.dataset.page;
    if (page === "messages") pageMessages();
    if (page === "safety") pageSafety();
    if (page !== "messages") support();          // ensure the support thread always exists
    if (page !== "home") enhance();
  }

  return { boot, ensure, push, system, support, unreadTotal, pageMessages, pageSafety, renderThread, renderVault, renderAudit, spend: null };
})();

window.GOGOChat = GOGOChat;

document.addEventListener("DOMContentLoaded", () => {
  try { GOGOChat.boot(); } catch (e) { console.error("GOGOChat boot failed", e); }
});
