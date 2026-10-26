/* =========================================================================
   GOGO — PARCEL BOOKING + NEGOTIATION UI
   The confirmation page never re-asks for anything: it renders the draft the
   sender already filled in on the landing page, every row editable.
   Then: request → chat → driver offer → counter → agreed → driver accepts →
   booking fee → collected → delivered.
   ========================================================================= */

function pageParcel() {
  const q = parseQuery();
  const id = q.id || "";
  let p = id ? parcel(id) : null;

  /* no request yet: build one from the draft. Nothing is asked twice. */
  if (!p) {
    const d = draft();
    if (!d.pickup || !d.destination || !Number(d.weightKg)) {
      $('#main').innerHTML = `
        <div class="g-wrap g-section"><div class="g-card">
          <div class="g-empty">
            <span class="g-ic g-ic-lg" aria-hidden>${GICON("parcel")}</span>
            <h3 class="g-h3">Tell us about the parcel first</h3>
            <p class="g-s g-mt-sm">Where we collect it, where it goes and how heavy it is. That is all we need to find a driver.</p>
            <a class="g-btn g-btn-ink g-mt" href="index.html">Back to booking</a>
          </div>
        </div></div>`;
      return;
    }
    p = parcelFromDraft();
    if (p) { draftClear(); history.replaceState(null, "", "parcel.html?id=" + p.id); }
  }
  if (!p) return;

  let selRide = p.rideId ? ride(p.rideId) : null;
  const t = parcelThread(p);
  const agreed = p.agreedPrice != null;

  /* ── which driver on this route gets it ─────────────────────────────── */
  const candidates = S.rides.filter(r => {
    const P = window.GOGOPlaces;
    const same = (a, b) => (P ? P.same(a, b) : a === b);
    return same(r.to, p.destinationCity) || (r.stops || []).some(s => same(s.city, p.destinationCity));
  });

  /* offers the sender can act on: only the driver's offers are acceptable */
  const pay = parcelPayout(p);
  const myTurn = p.lastOfferBy === "driver" && offerLive(p);

  $('#main').innerHTML = `
  <div class="g-wrap g-section">
    <div class="g-grid">
      <div class="g-7 g-anim">
        <div class="g-card">
          <div class="g-between">
            <div class="g-ride-route" style="font-size:19px">${esc(p.pickupAddress)} <em>→</em> ${esc(p.destinationCity)}</div>
            <span class="g-stamp ${["booked", "collected", "in_transit", "delivered", "accepted"].includes(p.status) ? "g-stamp-full" : "g-stamp-open"}">${esc(PARCEL_LABEL[p.status] || p.status)}</span>
          </div>
          <div class="g-row g-mt-sm" style="gap:14px;flex-wrap:wrap">
            <span class="g-s-sm"><span aria-hidden>${GICON("parcel")}</span> ${p.weightKg}kg · ${esc((PARCEL_SIZES.find(s => s.id === p.sizeClass) || {}).label || p.sizeClass)}</span>
            <span class="g-s-sm"><span aria-hidden>📅</span> ${esc(p.pickupDate)}${p.pickupTime ? " · " + esc(p.pickupTime) : ""}</span>
            <span class="g-s-sm"><span aria-hidden>${GICON("van")}</span> boot only, never a seat</span>
          </div>
          ${p.description ? `<div class="g-list-row g-mt-sm"><span class="g-ic g-ic-sm" aria-hidden>📝</span><div><div class="g-list-t">${esc(p.description)}</div><div class="g-list-s">What is in the parcel</div></div></div>` : ""}

          <h3 class="g-h3 g-mt-lg">Parcel details</h3>
          <p class="g-s-sm g-mt-sm">Everything here came from your booking and is editable. Nothing is asked twice.</p>
          <div class="g-2col g-mt">
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>${GICON("pin")}</span><div style="flex:1"><label class="g-f-k">Collect from</label><input id="pFrom" value="${esc(p.pickupAddress)}"></div></div>
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>${GICON("flag")}</span><div style="flex:1"><label class="g-f-k">Goes to</label><input id="pTo" value="${esc(p.destinationCity)}"></div></div>
          </div>
          <div class="g-2col">
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>📅</span><div style="flex:1"><label class="g-f-k">Collection date</label><input id="pDate" type="date" value="${esc(p.pickupDate)}"></div></div>
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>${GICON("clock")}</span><div style="flex:1"><label class="g-f-k">Time</label><input id="pTime" type="time" value="${esc(p.pickupTime || "")}"></div></div>
          </div>
          <div class="g-2col">
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>⚖️</span><div style="flex:1"><label class="g-f-k">Weight (kg)</label><input id="pKg" type="number" min="1" max="200" value="${p.weightKg}"></div></div>
            <div class="g-field"><span class="g-ic g-ic-sm" aria-hidden>${GICON("parcel")}</span><div style="flex:1"><label class="g-f-k">Size</label>
              <select id="pSize">${PARCEL_SIZES.map(s => `<option value="${s.id}"${s.id === p.sizeClass ? " selected" : ""}>${s.label} · ${s.hint}</option>`).join("")}</select></div></div>
          </div>
          <button class="g-btn g-btn-ghost g-btn-block g-mt" type="button" id="pSave">Save these details</button>
        </div>

        ${selRide ? "" : `
        <div class="g-card g-mt">
          <div class="g-head"><span class="g-label">Drivers on this route</span><span class="g-ic g-ic-sm" aria-hidden>${van()}</span></div>
          ${candidates.length ? candidates.map(r => `
            <div class="g-list-row">
              <span class="g-ic g-ic-sm" aria-hidden>${van()}</span>
              <div>
                <div class="g-list-t">${esc(r.driver)} · ${esc(r.from)} → ${esc(r.to)}</div>
                <div class="g-list-s">${capacityLine(r)} · from ${rands(Number(r.ratePerKg || 12) * p.weightKg)} suggested</div>
              </div>
              <button class="g-btn g-btn-ink g-btn-sm" type="button" data-send="${r.id}">Send</button>
            </div>`).join("") : `<p class="g-s">No driver is on this corridor yet. Set an alert and we will tell you the moment one lists it.</p>`}
        </div>`}

        <div class="g-card g-mt" id="chatCard">
          <div class="g-head"><span class="g-label">Chat with the driver</span><span class="g-s-sm">${selRide ? esc(selRide.driver) : "not sent yet"}</span></div>
          ${selRide ? `<div class="g-thread" id="thread"></div>
            <div class="g-row g-mt" style="gap:8px">
              <input id="msgBox" class="g-bk-in" style="padding-left:14px" placeholder="Type a message" ${agreed && p.status !== "negotiating" ? "disabled" : ""}>
              <button class="g-btn g-btn-ink" type="button" id="msgSend">Send</button>
            </div>` : `<p class="g-s">Send the parcel to a driver above. Your chat opens the moment they pick it up.</p>`}
        </div>
      </div>

      <div class="g-5 g-anim">
        ${pay ? `
        <div class="g-card g-card-lime">
          <div class="g-head"><span class="g-label">Agreed price</span><span class="g-ic g-ic-sm" aria-hidden>🤝</span></div>
          <div class="g-kpi-val">${rands(p.agreedPrice)}</div>
          <div class="g-list-s">per parcel, agreed with ${selRide ? esc(selRide.driver) : "your driver"}</div>
          ${feeTable(pay ? parcelLines(p.agreedPrice) : null, `Carriage goes to the driver. GOGO keeps the ${rands(FEE_CONFIG.parcelBooking)} booking fee.`)}
        </div>` : ""}

        ${myTurn ? `
        <div class="g-card ${pay ? "g-mt" : ""}">
          <div class="g-head"><span class="g-label">Offer on the table</span><span class="g-s-sm">expires in ${Math.max(0, Math.round((new Date(p.offerExpiresAt) - Date.now()) / 60000))} min</span></div>
          <div class="g-kpi-val">${rands(p.offeredPrice)}</div>
          <div class="g-row g-mt">
            <button class="g-btn g-btn-lime" type="button" id="doAccept">Accept ${rands(p.offeredPrice)}</button>
            <button class="g-btn g-btn-outline" type="button" id="doCounter">Counter</button>
            <button class="g-btn g-btn-ghost" type="button" id="doDecline">No thanks</button>
          </div>
        </div>` : ""}

        ${selRide ? `
        <div class="g-card ${pay || myTurn ? "g-mt" : ""}">
          <div class="g-head"><span class="g-label">Your driver</span><span class="g-ic g-ic-sm" aria-hidden>🛡️</span></div>
          <div class="g-driver">
            <div class="g-avatar">${esc(initials(selRide.driver))}</div>
            <div><div class="g-t">${esc(selRide.driver)}</div>
            <div class="g-list-s"><span class="g-stars">★ ${selRide.rating}</span> · ${selRide.trips} trips</div></div>
          </div>
          <div class="g-list-row g-mt-sm"><span class="g-ic g-ic-sm" aria-hidden>${van()}</span><div><div class="g-list-t">${esc(selRide.vehicle)}</div>
            <div class="g-list-s">${capacityLine(selRide)}</div></div></div>
          <div class="g-list-row"><span class="g-ic g-ic-sm" aria-hidden>⚖️</span><div><div class="g-list-t">Rate from ${rands(Number(selRide.ratePerKg || 12))}/kg</div><div class="g-list-s">A suggestion only. You agree the figure together.</div></div></div>
        </div>` : ""}

        <div class="g-card ${(pay || myTurn || selRide) ? "g-mt" : ""}">
          <div class="g-head"><span class="g-label">Progress</span><span class="g-s-sm">${esc(PARCEL_LABEL[p.status] || p.status)}</span></div>
          <div class="g-steps g-mt-sm">
            ${["requested", "negotiating", "agreed", "accepted", "booked", "collected", "in_transit", "delivered"].map(st => {
              const done = PARCEL_STATES.indexOf(p.status) >= PARCEL_STATES.indexOf(st);
              return `<div class="g-step ${done ? "done" : ""}"><span class="g-step-dot" aria-hidden></span>${esc(PARCEL_LABEL[st])}</div>`;
            }).join("")}
          </div>
          <p class="g-s-sm g-mt-sm">Nothing is paid before you agree a price. The only money up front is the ${rands(FEE_CONFIG.parcelBooking)} booking fee.</p>
        </div>
      </div>
    </div>
  </div>`;

  /* ── save edited details (nothing re-entered, just corrected) ───────── */
  $('#pSave').onclick = () => {
    const kg = Number($('#pKg').value || 0);
    if (!kg || kg <= 0) { toast("<b>Weight must be more than 0kg</b>"); return; }
    Object.assign(p, {
      pickupAddress: $('#pFrom').value.trim() || p.pickupAddress,
      destinationCity: $('#pTo').value.trim() || p.destinationCity,
      pickupDate: $('#pDate').value || p.pickupDate,
      pickupTime: $('#pTime').value || "",
      weightKg: kg,
      sizeClass: $('#pSize').value,
      updatedAt: new Date().toISOString(),
    });
    save();
    toast("<b>Saved</b> · your parcel details are updated");
    render();
  };

  /* ── send to a driver ───────────────────────────────────────────────── */
  $$('[data-send]').forEach(b => b.onclick = () => {
    const r = ride(b.dataset.send);
    if (!r) return;
    if (Number(p.weightKg) > bootLeft(r)) {
      toast(`<b>That boot is taken</b> · only ${bootLeft(r)}kg left on this ride`);
      return;
    }
    p.rideId = r.id;
    p.driverId = r.driver;
    p.ratePerKg = Number(r.ratePerKg || 12);
    p.status = "requested";
    p.suggested = suggestCarriage(p, r);
    parcelThread(p);
    parcelSay(p, "sender", "text", `Hi ${r.driver}, I have a ${p.weightKg}kg parcel from ${p.pickupAddress} to ${p.destinationCity}. Around ${rands(p.suggested)} was my guess, but let us talk.`);
    save();
    toast(`<b>Sent to ${esc(r.driver)}</b> · they will come back to you here`);
    render();
  });

  /* ── chat thread ────────────────────────────────────────────────────── */
  function renderThread() {
    const el = $('#thread');
    if (!el) return;
    el.innerHTML = t.msgs.length ? t.msgs.map(m => {
      if (m.kind === "text") {
        return `<div class="g-msg ${m.role === "sender" ? "me" : "them"}"><div class="g-msg-b">${esc(m.body)}</div><div class="g-msg-t">${new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></div>`;
      }
      const dead = m.expiresAt && new Date(m.expiresAt).getTime() < Date.now();
      const word = m.kind === "offer" ? "Offered" : m.kind === "counter" ? "Countered" : m.kind === "accept" ? "Accepted" : "Declined";
      return `<div class="g-offer ${m.role === "sender" ? "me" : "them"} ${dead ? "dead" : ""}">
        <div class="g-offer-h"><span class="g-label">${word}</span><span class="g-s-sm">${m.amount != null ? rands(m.amount) : ""}</span></div>
        ${m.body ? `<div class="g-msg-b">${esc(m.body)}</div>` : ""}
        <div class="g-msg-t">${new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${dead ? " · expired" : ""}</div>
      </div>`;
    }).join("") : `<p class="g-s-sm">No messages yet. Say hello, then agree a price per kg.</p>`;
    el.scrollTop = el.scrollHeight;
  }
  renderThread();

  const msg = $('#msgBox'), send = $('#msgSend');
  if (send) send.onclick = () => {
    const v = (msg.value || "").trim();
    if (!v) return;
    parcelSay(p, "sender", "text", v);
    msg.value = "";
    renderThread();
  };
  if (msg) msg.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); send.click(); } };

  /* ── accept / counter / decline ─────────────────────────────────────── */
  const acc = $('#doAccept');
  if (acc) acc.onclick = () => {
    if (!offerLive(p)) { toast("<b>That offer has expired</b> · ask the driver to send it again"); render(); return; }
    parcelSay(p, "sender", "accept", `Agreed at ${rands(p.offeredPrice)}`);
    save();
    toast(`<b>Price agreed</b> · ${rands(p.agreedPrice)}. The driver still has to accept the job.`);
    render();
  };
  const cnt = $('#doCounter');
  if (cnt) cnt.onclick = () => {
    if ((t.counters || 0) >= MAX_COUNTERS * 2) { toast("<b>You have haggled enough</b> · this request is closed"); return; }
    const v = prompt(`Counter the ${rands(p.offeredPrice)} offer. What do you want to pay?`, p.offeredPrice);
    if (v == null) return;
    const n = Number(String(v).replace(/[^\d.]/g, ""));
    if (!n || n <= 0) { toast("<b>Enter an amount in rands</b>"); return; }
    parcelSay(p, "sender", "counter", `Can we do ${rands(n)}?`, n);
    save();
    render();
  };
  const dec = $('#doDecline');
  if (dec) dec.onclick = () => {
    parcelSay(p, "sender", "decline", "Not at that price, thanks.");
    save();
    toast("<b>Declined</b> · nothing is owed, the thread stays open");
    render();
  };

  reveal();
}
