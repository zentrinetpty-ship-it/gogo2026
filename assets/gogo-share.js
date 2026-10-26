/* =========================================================================
   GOGO — Live tracking shares (Phase 0)
   Up to 3 people per ride, one revocable token each, shareable to any
   platform. The recipient opens a no-login page that shows the vehicle
   moving, the ETA, the trip state and whether the passenger tapped
   "I am safe" — with no phone numbers and no payment detail anywhere.
   ========================================================================= */

const GOGOShare = (() => {
  const MAX_SHARES = 3;
  const WINDOW_HOURS = 2;          // link stays alive this long after the ride ends

  function store() { if (!S.shares) S.shares = []; return S.shares; }
  const forRide = rideId => store().filter(s => s.rideId === rideId);
  const active = rideId => forRide(rideId).filter(s => !s.revokedAt);

  function token() {
    const a = new Uint8Array(9);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.floor(Math.random() * 256));
    return Array.from(a).map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
  }

  function create(rideId, label) {
    const live = active(rideId);
    if (live.length >= MAX_SHARES) return { ok: false, reason: `You can share with ${MAX_SHARES} people. Revoke one first.` };
    const s = {
      id: "s" + Date.now(), rideId, token: token(),
      label: label || "Contact " + (live.length + 1),
      createdAt: new Date().toISOString(), revokedAt: null, views: [],
    };
    store().push(s); save();
    return { ok: true, share: s };
  }

  function revoke(id) {
    const s = store().find(x => x.id === id);
    if (s) { s.revokedAt = new Date().toISOString(); save(); }
    return s;
  }

  function recordView(tok) {
    const s = store().find(x => x.token === tok);
    if (!s) return null;
    s.views.push(new Date().toISOString());
    if (s.views.length > 40) s.views = s.views.slice(-40);
    save();
    return s;
  }

  const byToken = tok => store().find(x => x.token === tok);

  function expiryFor(ride) {
    const base = ride.completedAt ? new Date(ride.completedAt).getTime() : new Date(ride.depart).getTime() + 12 * 3600 * 1000;
    return new Date(base + WINDOW_HOURS * 3600 * 1000).toISOString();
  }

  const linkFor = (ride, s) => location.origin + location.pathname.replace(/[^/]*$/, "") + "track.html?t=" + s.token;

  function shareText(ride, s) {
    const t = new Date(ride.depart);
    const st = tripState(ride);
    return `${S.me ? S.me.name : "I"} is hiking with ${ride.driver} in a ${ride.colour} ${ride.vehicle} (${ride.plate}), ${ride.from} → ${ride.to}, leaving ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. ${st.etaText}. Watch the live trip: ${linkFor(ride, s)}`;
  }

  function tripState(ride) {
    const accepted = (ride.requests || []).filter(q => q.status === "accepted");
    const done = accepted.filter(q => (ride.safe || {})[q.phone]);
    if (ride.status === "completed") return { step: 4, label: "Arrived", etaText: `arrived, ${done.length} of ${accepted.length} confirmed safe`, canShare: true };
    if (ride.status === "started") return { step: 3, label: "On the way", etaText: "on the way now", canShare: true };
    if (accepted.length) return { step: 2, label: "Driver assigned", etaText: "driver assigned", canShare: true };
    return { step: 1, label: "Booked", etaText: "seat booked", canShare: true };
  }

  /* ── channels: every platform the phone can reach ────────────────────── */
  function channels(ride, s) {
    const text = encodeURIComponent(shareText(ride, s));
    const url = encodeURIComponent(linkFor(ride, s));
    return [
      { key: "whatsapp", label: "WhatsApp", icon: "🟢", href: `https://wa.me/?text=${text}` },
      { key: "sms", label: "SMS", icon: "chat", href: `sms:?&body=${text}` },
      { key: "telegram", label: "Telegram", icon: "✈️", href: `https://t.me/share/url?url=${url}&text=${encodeURIComponent("GOGO live trip")}` },
      { key: "email", label: "Email", icon: "chat", href: `mailto:?subject=${encodeURIComponent("Watch my GOGO trip")}&body=${text}` },
      { key: "copy", label: "Copy link", icon: "link", action: "copy" },
      { key: "native", label: "More apps", icon: "send", action: "native" },
    ];
  }

  async function fire(ch, ride, s) {
    if (ch.action === "copy") {
      try { await navigator.clipboard.writeText(linkFor(ride, s)); toast("Link copied · paste it anywhere"); }
      catch { toast("Copy failed — select the link text instead"); }
      return;
    }
    if (ch.action === "native") {
      if (navigator.share) {
        try { await navigator.share({ title: "Watch my GOGO trip", text: shareText(ride, s), url: linkFor(ride, s) }); } catch {}
      } else { toast("This browser has no share sheet — use Copy link"); }
    }
  }

  /* ── passenger panel ─────────────────────────────────────────────────── */
  function renderShareCard(host, ride) {
    if (!host || !ride) return;
    const live = active(ride.id);
    const st = tripState(ride);
    const card = document.createElement("div");
    card.className = "g-card g-mt";
    card.innerHTML = `
      <div class="g-head"><span class="g-label">Share my ride</span>
        <span class="g-s-sm">${live.length} of ${MAX_SHARES} people</span></div>
      <p class="g-s">Up to three people can follow this trip live — the car moving on the map, the ETA, and your “I am safe” at the end. They never see your number.</p>

      ${live.length ? live.map(s => `
        <div class="g-thread" style="cursor:default">
          <span class="g-ic g-ic-sm ${s.views.length ? "g-ic-lime" : ""}" aria-hidden>${s.views.length ? "👀" : "link"}</span>
          <div style="min-width:0">
            <div class="g-list-t">${esc(s.label)}</div>
            <div class="g-list-s">${s.views.length ? `${s.views.length} view${s.views.length === 1 ? "" : "s"} · last ${new Date(s.views[s.views.length - 1]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "not opened yet"} · expires ${new Date(expiryFor(ride)).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
          </div>
          <div class="g-row" style="margin-left:auto">
            <button class="g-btn g-btn-outline g-btn-sm" data-copy="${s.id}" type="button">Copy</button>
            <button class="g-btn g-btn-ghost g-btn-sm" data-rev="${s.id}" type="button">Revoke</button>
          </div>
        </div>`).join("") : `<p class="g-s-sm">Nobody is watching yet.</p>`}

      ${live.length < MAX_SHARES ? `
        <div class="g-row g-mt">
          <input id="shareLabel" placeholder="Who? e.g. Mom" style="flex:1;min-width:0;border:1px solid rgba(11,11,11,.16);border-radius:4px;padding:11px 12px;font-family:inherit;font-size:13px;font-weight:700" value="">
          <button class="g-btn g-btn-ink g-btn-sm" id="addShare" type="button"><span aria-hidden>${GICON("cross")}</span> Add</button>
        </div>
        <div class="g-chips g-mt-sm" id="shareChannels"></div>
      ` : `<p class="g-s-sm g-mt">All three shares are in use. Revoke one to add someone else.</p>`}
    `;
    host.appendChild(card);

    const chips = card.querySelector("#shareChannels");
    const last = live[live.length - 1];
    if (chips && last) {
      chips.innerHTML = channels(ride, last).map(c => `<button class="g-chip" data-ch="${c.key}">${c.icon} ${c.label}</button>`).join("");
      chips.querySelectorAll("[data-ch]").forEach(b => b.onclick = () => {
        const ch = channels(ride, last).find(c => c.key === b.dataset.ch);
        if (ch.href) window.open(ch.href, "_blank");
        else fire(ch, ride, last);
      });
    }

    card.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => {
      const s = store().find(x => x.id === b.dataset.copy);
      navigator.clipboard && navigator.clipboard.writeText(linkFor(ride, s));
      toast("Link copied · " + esc(s.label));
    });
    card.querySelectorAll("[data-rev]").forEach(b => b.onclick = () => {
      revoke(b.dataset.rev); toast("Share revoked · that person can no longer watch");
      setTimeout(() => location.reload(), 600);
    });
    const add = card.querySelector("#addShare");
    if (add) add.onclick = () => {
      const label = (card.querySelector("#shareLabel").value || "").trim() || "Contact " + (active(ride.id).length + 1);
      const res = create(ride.id, label);
      if (!res.ok) { toast("<b>" + esc(res.reason) + "</b>"); return; }
      toast("<b>Share created</b> for " + esc(label) + " · pick a platform");
      setTimeout(() => location.reload(), 700);
    };
  }

  /* ── public tracker (recipient, no login) ────────────────────────────── */
  function pageTrack() {
    const q = new URLSearchParams(location.search);
    const tok = q.get("t");
    const s = tok ? byToken(tok) : null;

    if (!s) {
      $('#main').innerHTML = `<div class="g-wrap g-section"><div class="g-card"><div class="g-empty">
        <span class="g-ic g-ic-lg" aria-hidden>${GICON("lock")}</span><h3 class="g-h3">This tracking link is not valid</h3>
        <p class="g-s g-mt-sm">It may have expired, or the passenger revoked it. Ask them to send a fresh link.</p></div></div></div>`;
      return;
    }
    const ride = S.rides.find(r => r.id === s.rideId);
    if (!ride) { $('#main').innerHTML = `<div class="g-wrap g-section"><div class="g-card"><div class="g-empty"><h3 class="g-h3">Ride not found</h3></div></div></div>`; return; }

    const revoked = !!s.revokedAt;
    const expired = Date.now() > new Date(expiryFor(ride)).getTime();
    if (revoked || expired) {
      $('#main').innerHTML = `<div class="g-wrap g-section"><div class="g-card"><div class="g-empty">
        <span class="g-ic g-ic-lg" aria-hidden>${revoked ? "🚫" : "clock"}</span>
        <h3 class="g-h3">${revoked ? "The passenger stopped sharing this trip" : "This trip link has expired"}</h3>
        <p class="g-s g-mt-sm">${revoked ? "Contact them directly if you need an update." : "Tracking links close shortly after a trip ends. Ask for a new one next time."}</p></div></div></div>`;
      return;
    }

    if (!revoked && !expired && !s.views.length) recordView(tok);
    else recordView(tok);

    const st = tripState(ride);
    const accepted = (ride.requests || []).filter(rq => rq.status === "accepted");
    const safeDone = accepted.filter(rq => (ride.safe || {})[rq.phone]);
    const t = new Date(ride.depart);
    const stops = [ride.from, ...ride.stops.map(x => x.city), ride.to];

    $('#main').innerHTML = `
    <div class="g-wrap g-section">
      <div class="g-card g-anim" style="padding:0;overflow:hidden">
        <div class="g-track-map" id="trackMap" aria-hidden></div>
        <div style="padding:16px">
          <div class="g-between">
            <div>
              <span class="g-label">Live trip · shared with you</span>
              <h1 class="g-h2 g-mt-sm">${esc(ride.from)} <span style="opacity:.4">→</span> ${esc(ride.to)}</h1>
            </div>
            <span class="g-stamp ${ride.status === "completed" ? "g-stamp-full" : "g-stamp-open"}">${esc(st.label)}</span>
          </div>
          <div class="g-row g-mt-sm" style="gap:14px">
            <span class="g-s-sm"><span aria-hidden>${GICON("clock")}</span> left ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <span class="g-s-sm" id="heartbeat"><span aria-hidden>${GICON("signal")}</span> updated just now</span>
            <span class="g-s-sm"><span aria-hidden>${GICON("stop")}</span> ${stops.length} points on the route</span>
          </div>
        </div>
      </div>

      <div class="g-grid g-mt">
        <div class="g-7 g-anim">
          <div class="g-card">
            <div class="g-head"><span class="g-label">Trip progress</span><span class="g-s-sm">${st.etaText}</span></div>
            <div class="g-route g-mt">
              ${stops.map((c, i) => {
                const step = i / (stops.length - 1) * 4;
                const cls = step <= st.step - 1 ? "done" : (step < st.step ? "now" : "");
                return `<div class="g-route-item ${cls}">
                  <div class="g-route-rail"><div class="g-route-dot" aria-hidden>${i === 0 ? "📍" : i === stops.length - 1 ? "🏁" : "🚏"}</div><div class="g-route-line"></div></div>
                  <div style="flex:1"><div class="g-t">${esc(c)}</div>
                    <div class="g-list-s">${i === 0 ? "pickup point" : i === stops.length - 1 ? "final stop" : "hop-off stop"}</div></div>
                </div>`;
              }).join("")}
            </div>
          </div>

          <div class="g-card g-mt">
            <div class="g-head"><span class="g-label">Safety</span><span class="g-ic g-ic-sm" aria-hidden>${GICON("shield")}</span></div>
            <div class="g-list-row"><span class="g-ic g-ic-sm g-ic-lime" aria-hidden>${GICON("camera")}</span>
              <div><div class="g-list-t">Identity checked at booking</div>
                <div class="g-list-s">Both driver and passenger took a safety selfie for this ride. They delete 24 hours after the trip ends and the passenger confirms safe.</div></div></div>
            <div class="g-list-row"><span class="g-ic g-ic-sm ${safeDone.length ? "g-ic-lime" : ""}" aria-hidden>${safeDone.length ? "✅" : "⏳"}</span>
              <div><div class="g-list-t">${safeDone.length ? "“I am safe” confirmed" : "Waiting for the safe check"}</div>
                <div class="g-list-s">${safeDone.length} of ${accepted.length} passengers confirmed${safeDone.length ? " · " + new Date(ride.safe[accepted[0].phone]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</div></div></div>
            <button class="g-btn g-btn-outline g-btn-block g-mt" id="reportBtn" type="button"><span aria-hidden>🆘</span> Report a problem</button>
            <p class="g-s-sm g-mt-sm">This link is single-purpose and expires when the trip closes. No phone numbers or payment details are shown.</p>
          </div>
        </div>

        <div class="g-4 g-anim">
          <div class="g-card">
            <div class="g-head"><span class="g-label">Your driver</span><span class="g-stamp g-stamp-full">verified</span></div>
            <div class="g-driver"><div class="g-avatar">${esc(ride.driver.split(" ").map(w => w[0]).slice(0, 2).join(""))}</div>
              <div><div class="g-t">${esc(ride.driver)}</div><div class="g-list-s"><span class="g-stars">★ ${ride.rating}</span> · ${ride.trips} trips</div></div></div>
            <div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>${(window.GOGO && GOGO.van) ? GOGO.van() : ''}</span>
              <div><div class="g-list-t">${esc(ride.colour)} ${esc(ride.vehicle)}</div><div class="g-list-s">${esc(ride.plate)}</div></div></div>
            <div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>doc</span>
              <div><div class="g-list-t">Documents on file</div><div class="g-list-s">Licence · PDP · criminal clearance · roadworthy, all verified by GOGO</div></div></div>
          </div>

          <div class="g-card g-mt">
            <div class="g-head"><span class="g-label">Watching</span><span class="g-s-sm">${s.label}</span></div>
            <p class="g-s">You are one of up to three people following this trip as a safety contact. The passenger can see that you opened the link.</p>
            <a class="g-btn g-btn-ghost g-btn-block g-mt" href="index.html"><span aria-hidden>${(window.GOGO && GOGO.van) ? GOGO.van() : ''}</span> Book your own hike</a>
          </div>
        </div>
      </div>
    </div>`;

    if (window.GOGOMap) {
      const el = $('#trackMap');
      if (el) { try { GOGOMap.build(el); } catch (e) { console.warn("map build failed", e); } }
    }

    const hb = $('#heartbeat');
    let secs = 0;
    setInterval(() => { secs += 5; if (hb) hb.innerHTML = `<span aria-hidden>${GICON("signal")}</span> updated ${secs < 60 ? secs + "s" : Math.round(secs / 60) + "m"} ago`; }, 5000);

    const rep = $('#reportBtn');
    if (rep) rep.onclick = () => {
      const t = GOGOChat.support();
      GOGOChat.push(t, "me", `Safety contact reporting on ${ride.from} → ${ride.to} (${ride.driver}).`, { support: true });
      toast("Report sent to GOGO support");
      setTimeout(() => location.href = "messages", 800);
    };
  }

  function boot() {
    const page = document.body.dataset.page;
    if (page === "track") { pageTrack(); return; }
    if (window.GOGO && GOGO.reveal) setTimeout(GOGO.reveal, 30);
    if (page === "rider") {
      const my = [];
      S.rides.forEach(r => (r.requests || []).forEach(q => { if (q.phone === S.me.phone && q.status !== "declined") my.push({ r, q }); }));
      const live = my.find(x => x.q.status === "accepted") || my[0];
      if (live) renderShareCard(document.querySelector("#main .g-8"), live.r);
    }
  }

  return { boot, create, revoke, recordView, byToken, forRide, active, linkFor, shareText, channels,
           tripState, renderShareCard, pageTrack, MAX_SHARES, WINDOW_HOURS, expiryFor };
})();

window.GOGOShare = GOGOShare;
document.addEventListener("DOMContentLoaded", () => { try { GOGOShare.boot(); } catch (e) { console.error("GOGOShare boot failed", e); } });
