/* =========================================================================
   GOGO — Driver compliance (Phase 0)
   Free to join, never free to skip: licence, PDP, criminal clearance and
   roadworthy must all be VERIFIED and unexpired before a ride can be listed
   or accepted. Expiry windows are data, not code.
   ========================================================================= */

const GOGODocs = (() => {
  const DAY = 86400000;

  const REQUIREMENTS = [
    { key: "licence",    label: "Driver's licence",        icon: "🪪", required: true,  months: 60, note: "Correct code for carrying passengers." },
    { key: "pdp",        label: "Professional Driving Permit", icon: "🎫", required: true,  months: 6,  note: "Permit to carry passengers for reward." },
    { key: "criminal",   label: "Criminal record clearance", icon: "🔎", required: true,  months: 6,  note: "Vetting decision is stored, not the certificate itself (POPIA)." },
    { key: "roadworthy", label: "Roadworthy certificate",   icon: "🛠️", required: true,  months: 12, note: "Vehicle fitness, renewed annually." },
    { key: "reg",        label: "Vehicle registration + disc", icon: "📄", required: true, months: 12, note: "Must match the plate on your ride listing." },
    { key: "id",         label: "ID document",             icon: "🆔", required: true,  months: 120, note: "Identity must match the licence." },
    { key: "bank",       label: "Bank confirmation",        icon: "🏦", required: true,  months: 24, note: "Where your payout lands." },
    { key: "photos",     label: "Vehicle photos",           icon: "📸", required: true,  months: 12, note: "All sides, plate, interior and seats." },
    { key: "insurance",  label: "Insurance",               icon: "🛡️", required: false, months: 12, note: "Recommended, not blocking." },
  ];

  const STATES = {
    missing:   { label: "Not submitted", cls: "g-stamp-idle" },
    review:    { label: "Under review",  cls: "g-stamp-open" },
    verified:  { label: "Verified",      cls: "g-stamp-full" },
    rejected:  { label: "Rejected",      cls: "g-stamp-ink" },
    expired:   { label: "Expired",       cls: "g-stamp-ink" },
  };

  function store() {
    if (!S.docs) S.docs = {};
    if (!S.docLog) S.docLog = [];
    return S.docs;
  }

  const daysTo = iso => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
  const addMonths = (m) => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toISOString(); };

  function seedDriver(driver, plan) {
    const d = store();
    if (d[driver]) return;
    d[driver] = REQUIREMENTS.map(r => {
      const p = plan[r.key] || {};
      return {
        key: r.key, label: r.label,
        state: p.state || "missing",
        issued: p.issued || null,
        expires: p.expires || null,
        file: p.file || null, fileSize: p.fileSize || null,
        reviewer: p.reviewer || null, decidedAt: p.decidedAt || null, reason: p.reason || null,
      };
    });
    save();
  }

  function seed() {
    const iso = d => new Date(Date.now() + d * DAY).toISOString();
    /* every seeded driver gets a full document file with a realistic mix of
       cleared / expiring / blocked states */
    const all = (S.rides || []).map(r => r.driver).filter(Boolean);
    const cleared = d => ({
      licence: { state: "verified", issued: iso(-600), expires: iso(900), reviewer: "ops.naledi", decidedAt: iso(-40) },
      pdp: { state: "verified", issued: iso(-100), expires: iso(200), reviewer: "ops.naledi", decidedAt: iso(-39) },
      criminal: { state: "verified", issued: iso(-50), expires: iso(130), reviewer: "vetting.partner", decidedAt: iso(-38) },
      roadworthy: { state: "verified", issued: iso(-90), expires: iso(275), reviewer: "ops.naledi", decidedAt: iso(-37) },
      reg: { state: "verified", issued: iso(-180), expires: iso(185), reviewer: "ops.naledi", decidedAt: iso(-36) },
      id: { state: "verified", issued: iso(-2000), expires: null, reviewer: "ops.naledi", decidedAt: iso(-36) },
      bank: { state: "verified", issued: iso(-30), expires: iso(700), reviewer: "finance", decidedAt: iso(-29) },
      photos: { state: "verified", issued: iso(-25), expires: iso(340), reviewer: "ops.naledi", decidedAt: iso(-24) },
    });
    all.forEach((d, i) => {
      if (d === "Sipho M." || d === "Thabo N.") return;           /* hand-seeded below */
      if (i % 4 === 3) {
        /* one driver in four has something that needs attention */
        seedDriver(d, Object.assign(cleared(d), {
          pdp: { state: "verified", issued: iso(-170), expires: iso(24 + i), reviewer: "ops.naledi", decidedAt: iso(-169) },
          roadworthy: { state: i % 8 === 7 ? "review" : "verified", fileSize: "890 KB", issued: iso(-5), expires: iso(360) },
        }));
      } else {
        seedDriver(d, cleared(d));
      }
    });
    /* a fully compliant driver, with the PDP coming up for renewal */
    seedDriver("Sipho M.", {
      licence: { state: "verified", issued: iso(-700), expires: iso(1200), reviewer: "ops.naledi", decidedAt: iso(-30), fileSize: "412 KB" },
      pdp: { state: "verified", issued: iso(-150), expires: iso(38), reviewer: "ops.naledi", decidedAt: iso(-29), fileSize: "298 KB" },
      criminal: { state: "verified", issued: iso(-60), expires: iso(120), reviewer: "vetting.partner", decidedAt: iso(-28), fileSize: "checked" },
      roadworthy: { state: "verified", issued: iso(-100), expires: iso(260), reviewer: "ops.naledi", decidedAt: iso(-27), fileSize: "1.2 MB" },
      reg: { state: "verified", issued: iso(-200), expires: iso(160), reviewer: "ops.naledi", decidedAt: iso(-27) },
      id: { state: "verified", issued: iso(-3000), expires: null, reviewer: "ops.naledi", decidedAt: iso(-27) },
      bank: { state: "verified", issued: iso(-40), expires: iso(700), reviewer: "finance", decidedAt: iso(-26) },
      photos: { state: "verified", issued: iso(-20), expires: iso(340), reviewer: "ops.naledi", decidedAt: iso(-19) },
      insurance: { state: "verified", issued: iso(-90), expires: iso(275), reviewer: "ops.naledi", decidedAt: iso(-25) },
    });
    /* a driver who must be blocked: expired roadworthy + rejected PDP */
    seedDriver("Thabo N.", {
      licence: { state: "verified", issued: iso(-900), expires: iso(900), reviewer: "ops.naledi", decidedAt: iso(-40) },
      pdp: { state: "rejected", reason: "Permit expired before upload — renew and resubmit.", reviewer: "ops.naledi", decidedAt: iso(-3) },
      criminal: { state: "review", fileSize: "381 KB", issued: iso(-10) },
      roadworthy: { state: "expired", issued: iso(-400), expires: iso(-12), reviewer: "ops.naledi", decidedAt: iso(-395) },
      reg: { state: "verified", issued: iso(-400), expires: iso(-12), reviewer: "ops.naledi", decidedAt: iso(-395) },
      id: { state: "verified", issued: iso(-2500), expires: null, reviewer: "ops.naledi", decidedAt: iso(-40) },
      bank: { state: "verified", issued: iso(-60), expires: iso(660), reviewer: "finance", decidedAt: iso(-50) },
      photos: { state: "verified", issued: iso(-30), expires: iso(330), reviewer: "ops.naledi", decidedAt: iso(-29) },
    });
  }

  /* ── evaluation ───────────────────────────────────────────────────────── */
  function docsOf(driver) { store(); return S.docs[driver] || []; }
  const docOf = (driver, key) => docsOf(driver).find(d => d.key === key);

  function evaluate(driver) {
    const docs = docsOf(driver);
    const blocking = [], expiring = [], verified = [];
    REQUIREMENTS.filter(r => r.required).forEach(r => {
      const d = docOf(driver, r.key);
      const st = d ? d.state : "missing";
      const expiredNow = d && d.expires && daysTo(d.expires) < 0;
      if (st === "verified" && !expiredNow) {
        verified.push(r.key);
        const days = d.expires ? daysTo(d.expires) : null;
        if (days !== null && days <= 60) expiring.push({ key: r.key, label: r.label, days, expires: d.expires });
      } else {
        blocking.push({ key: r.key, label: r.label, state: expiredNow && st === "verified" ? "expired" : st, reason: d ? d.reason : null });
      }
    });
    const days = docs.filter(d => d.expires).map(d => daysTo(d.expires)).sort((a, b) => a - b);
    return { canDrive: blocking.length === 0, blocking, expiring: expiring.sort((a, b) => a.days - b.days), verified, nextExpiryDays: days.length ? days[0] : null };
  }

  const canDrive = driver => evaluate(driver).canDrive;

  /* ── driver actions ───────────────────────────────────────────────────── */
  function submit(driver, key, { file, fileSize, issued, expires }) {
    const docs = store();
    if (!docs[driver]) docs[driver] = [];
    let d = docs[driver].find(x => x.key === key);
    const req = REQUIREMENTS.find(r => r.key === key);
    if (!d) { d = { key, label: req.label }; docs[driver].push(d); }
    Object.assign(d, {
      state: "review", file: file || null, fileSize: fileSize || null,
      issued: issued || new Date().toISOString(),
      expires: expires || addMonths(req.months),
      reviewer: null, decidedAt: null, reason: null,
    });
    S.docLog.unshift({ at: new Date().toISOString(), actor: driver, action: "submitted", subject: req.label });
    save();
    return d;
  }

  function review(driver, key, decision, reason, reviewer = "ops.you") {
    const d = docOf(driver, key);
    if (!d) return;
    d.state = decision === "verify" ? "verified" : "rejected";
    d.reviewer = reviewer;
    d.decidedAt = new Date().toISOString();
    d.reason = decision === "verify" ? null : (reason || "Not accepted — resubmit.");
    S.docLog.unshift({ at: d.decidedAt, actor: reviewer, action: decision === "verify" ? "verified" : "rejected", subject: d.label + " · " + driver, note: d.reason });
    save();
    return d;
  }

  /* ── expiry watchboard (ops) ──────────────────────────────────────────── */
  function watchboard() {
    const out = [];
    Object.keys(store()).forEach(driver => docsOf(driver).forEach(d => {
      if (!d.expires) return;
      const days = daysTo(d.expires);
      if (days <= 90) out.push({ driver, ...d, days });
    }));
    return out.sort((a, b) => a.days - b.days);
  }

  function reviewQueue() {
    const out = [];
    Object.keys(store()).forEach(driver => docsOf(driver).forEach(d => { if (d.state === "review") out.push({ driver, ...d }); }));
    return out;
  }

  /* ── UI: driver's own document centre ─────────────────────────────────── */
  function renderDocsCard(host, driver) {
    if (!host) return;
    const ev = evaluate(driver);
    const box = document.createElement("div");
    box.className = "g-card g-mt";
    box.innerHTML = `
      <div class="g-head"><span class="g-label">Compliance · ${esc(driver)}</span>
        <span class="g-stamp ${ev.canDrive ? "g-stamp-full" : "g-stamp-ink"}">${ev.canDrive ? "cleared to drive" : "blocked"}</span></div>

      ${ev.canDrive ? `
        <p class="g-s">All four core documents are verified. ${ev.expiring.length ? `Next renewal: <b>${esc(ev.expiring[0].label)}</b> in ${ev.expiring[0].days} days.` : "Nothing expiring in the next 60 days."}</p>
        ${ev.expiring.length ? `<div class="g-chips g-mt-sm">${ev.expiring.map(e => `<span class="g-chip ${e.days <= 30 ? "g-chip-lime" : ""}">${esc(e.label)} · ${e.days}d</span>`).join("")}</div>` : ""}
      ` : `
        <div class="g-safe g-mt-sm" style="border-color:rgba(192,57,43,.4);background:rgba(192,57,43,.06)">
          <div class="g-t">You cannot list or accept rides right now</div>
          <div class="g-list-s">${ev.blocking.map(b => esc(b.label) + " · " + esc(STATES[b.state] ? STATES[b.state].label : b.state)).join(" · ")}</div>
        </div>`}

      <div class="g-mt">
        ${docsOf(driver).map(d => {
          const expiredNow = d.expires && daysTo(d.expires) < 0;
          const st = expiredNow && d.state === "verified" ? "expired" : d.state;
          const meta = STATES[st] || STATES.missing;
          const days = d.expires ? daysTo(d.expires) : null;
          return `
          <div class="g-doc">
            <span class="g-ic g-ic-sm ${st === "verified" ? "g-ic-lime" : ""}" aria-hidden>${(REQUIREMENTS.find(r => r.key === d.key) || {}).icon || "📄"}</span>
            <div style="flex:1;min-width:0">
              <div class="g-list-t">${esc(d.label)}</div>
              <div class="g-list-s">${d.expires ? `expires ${new Date(d.expires).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}${days !== null ? ` · ${days < 0 ? Math.abs(days) + " days ago" : days + " days left"}` : ""}` : (d.reason || "No expiry recorded")}</div>
              ${d.reason ? `<div class="g-list-s" style="color:#8a3a3a">${esc(d.reason)}</div>` : ""}
            </div>
            <span class="g-stamp ${meta.cls}">${meta.label}</span>
            <button class="g-btn g-btn-outline g-btn-sm" data-up="${d.key}" type="button">${st === "verified" ? "Renew" : st === "review" ? "Replace" : "Upload"}</button>
          </div>`;
        }).join("")}
      </div>

      <p class="g-s-sm g-mt">Criminal clearance is treated as special personal information: GOGO stores the vetting <b>result</b> and its expiry, not the certificate, and every view is audited.</p>
      <input type="file" id="docFile" accept="image/*,application/pdf" style="display:none">`;

    host.appendChild(box);
    box.querySelectorAll("[data-up]").forEach(b => b.onclick = () => pick(b.dataset.up));
    function pick(key) {
      const input = box.querySelector("#docFile");
      input.onchange = e => {
        const f = e.target.files && e.target.files[0];
        const size = f ? Math.round(f.size / 1024) + " KB" : "sample 300 KB";
        const req = REQUIREMENTS.find(r => r.key === key);
        GOGODocs.submit(driver, key, { fileSize: size, issued: new Date().toISOString(), expires: addMonths(req.months) });
        toast("<b>" + esc(req.label) + "</b> submitted · under review");
        setTimeout(() => location.reload(), 700);
      };
      input.click();
    }
  }

  /* ── UI: ops console ──────────────────────────────────────────────────── */
  function pageOps() {
    seed();
    const queue = reviewQueue();
    const board = watchboard();
    const rec = GOGOPay.reconciliation();
    const drivers = GOGOPay.allDrivers();

    $('#main').innerHTML = `
    <div class="g-wrap g-section">
      <div class="g-between g-anim">
        <div><span class="g-label">Platform ops</span><h1 class="g-h2 g-mt-sm">Verification, money and reconciliation</h1>
          <p class="g-s">Mock provider — the arithmetic is real, the charges are not. Every number below is derived from the append-only ledger.</p></div>
        <div class="g-row">
          <span class="g-stamp g-stamp-open">${queue.length} awaiting review</span>
          <span class="g-stamp ${board.some(b => b.days < 0) ? "g-stamp-ink" : "g-stamp-idle"}">${board.filter(b => b.days < 0).length} expired</span>
        </div>
      </div>

      <div class="g-grid g-mt-lg">
        <div class="g-12 g-anim">
          <div class="g-grid" style="grid-template-columns:repeat(2,1fr);gap:12px">
            ${[["Platform fees earned", GOGOPay.money2(rec.platformFees), GOGOPay.feeTxt() + " × completed bookings"],
               ["Card money captured", GOGOPay.money2(rec.cardCaptured), "held for drivers, minus fees"],
               ["Owed to drivers", GOGOPay.money2(rec.owedToDrivers), "next payout"],
               ["Owed to platform (cash fees)", GOGOPay.money2(rec.owedToPlatform), "receivable from drivers"],
               ["Card processing absorbed", GOGOPay.money2(rec.pspFees), "platform cost inside the " + GOGOPay.feeTxt()],
               ["Net platform position", GOGOPay.money2(rec.netPlatform), "fees − processing"]].map(([l, v, s]) => `
              <div class="g-card"><div class="g-label">${l}</div>
                <div class="g-kpi-val g-mt-sm" style="font-size:24px">${v}</div>
                <div class="g-list-s">${s}</div></div>`).join("")}
          </div>
        </div>

        <div class="g-6 g-anim">
          <div class="g-card">
            <div class="g-head"><span class="g-label">Review queue</span><span class="g-s-sm">${queue.length} document${queue.length === 1 ? "" : "s"}</span></div>
            ${queue.length ? queue.map(q => `
              <div class="g-req pending g-mt-sm">
                <div class="g-between">
                  <div class="g-row"><span class="g-ic g-ic-sm" aria-hidden>${(REQUIREMENTS.find(r => r.key === q.key) || {}).icon || "📄"}</span>
                    <div><div class="g-t">${esc(q.label)}</div><div class="g-list-s">${esc(q.driver)} · ${esc(q.fileSize || "file attached")}</div></div></div>
                  <span class="g-stamp g-stamp-open">review</span>
                </div>
                <div class="g-row g-mt-sm">
                  <button class="g-btn g-btn-lime g-btn-sm" data-ok="${q.driver}|${q.key}" type="button">${GICON("check")} Verify</button>
                  <button class="g-btn g-btn-ghost g-btn-sm" data-no="${q.driver}|${q.key}" type="button">Reject</button>
                </div>
              </div>`).join("") : `<p class="g-s">Nothing waiting. Documents appear here the moment a driver uploads.</p>`}
          </div>

          <div class="g-card g-mt">
            <div class="g-head"><span class="g-label">Expiry watchboard</span><span class="g-s-sm">next 90 days</span></div>
            ${board.length ? board.map(b => `
              <div class="g-list-row">
                <span class="g-ic g-ic-sm ${b.days < 0 ? "" : b.days <= 30 ? "g-ic-lime" : ""}" aria-hidden>${b.days < 0 ? "⛔" : "⏳"}</span>
                <div><div class="g-list-t">${esc(b.label)}</div><div class="g-list-s">${esc(b.driver)} · ${new Date(b.expires).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</div></div>
                <div class="g-list-r"><span class="g-count ${b.days < 0 ? "g-count-soon" : ""}">${b.days < 0 ? Math.abs(b.days) + "d overdue" : b.days + " days"}</span></div>
              </div>`).join("") : `<p class="g-s">No document expires in the next 90 days.</p>`}
          </div>
        </div>

        <div class="g-12 g-anim">
          <div class="g-card">
            <div class="g-head"><span class="g-label">Passengers</span>
              <span class="g-s-sm">${(S.passengers || []).length} profiles</span></div>
            <p class="g-s">Ten ready-made passengers for testing. Pick one on the login screen to travel as them.</p>
            <div class="g-people g-mt">
              ${(S.passengers || []).map(p => `
                <button class="g-person" data-as="${esc(p.phone)}" type="button">
                  <span class="g-avatar" style="width:38px;height:38px;font-size:12px;border-radius:4px">${esc(p.name.split(" ").map(w => w[0]).slice(0, 2).join(""))}</span>
                  <div style="min-width:0">
                    <div class="g-list-t">${esc(p.name)} <span class="g-stamp ${p.method === "cash" ? "g-stamp-idle" : "g-stamp-open"}">${p.method}</span></div>
                    <div class="g-p-meta">${esc(p.phone)} · ${esc(p.area)}</div>
                    <div class="g-p-meta">${esc(p.route)} · ${esc(p.note)}</div>
                  </div>
                  <div class="g-p-amt">${esc(p.trips)} <span>trips</span></div>
                </button>`).join("")}
            </div>
          </div>
        </div>

        <div class="g-6 g-anim">
          <div class="g-card">
            <div class="g-head"><span class="g-label">Driver statements</span><span class="g-s-sm">${GOGOPay.cfg().settlement}</span></div>
            ${drivers.map(d => {
              const st = GOGOPay.statement(d, 0);
              const ev = evaluate(d);
              return `
              <div class="g-list-row">
                <span class="g-avatar" style="width:36px;height:36px;font-size:12px;border-radius:4px">${esc(d.split(" ").map(w => w[0]).slice(0, 2).join(""))}</span>
                <div style="min-width:0">
                  <div class="g-list-t">${esc(d)} ${ev.canDrive ? "" : `<span class="g-stamp g-stamp-ink">blocked</span>`}</div>
                  <div class="g-list-s">${st.label} · card ${GOGOPay.money(st.cardShare)} · cash ${GOGOPay.money(st.cashShare)} · fees ${GOGOPay.money(st.fees)}</div>
                  <div class="g-list-s">card money collected ${GOGOPay.money(st.cardShare + st.fees)} · payout ${GOGOPay.money(st.closing)}</div>
                </div>
                <div class="g-list-r"><div class="g-count">${GOGOPay.money(st.closing)}</div><div class="g-list-s">payout due</div></div>
              </div>`;
            }).join("")}
            <button class="g-btn g-btn-ink g-btn-block g-mt" id="genStatements" type="button"><span aria-hidden>${GICON("receipt")}</span> Generate this month's invoices</button>
          </div>

          <div class="g-card g-mt">
            <div class="g-head"><span class="g-label">Ledger</span><span class="g-s-sm">append-only · last 12</span></div>
            <div class="g-audit">
              ${GOGOPay.ledger().slice(-12).reverse().map(l => `
                <div class="g-audit-row"><span class="g-audit-time">${new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span>${esc(l.label)} · <b>${l.kind === "fee" || l.kind === "refund" || l.kind === "chargeback" || l.kind === "payout" ? "−" : "+"}${GOGOPay.money2(l.amount)}</b> · ${esc(l.driver || "")}</span></div>`).join("") || `<p class="g-s">No ledger entries yet.</p>`}
            </div>
            <a class="g-btn g-btn-outline g-btn-block g-mt" href="driver"><span aria-hidden>${(window.GOGO && GOGO.van) ? GOGO.van() : ''}</span> Driver earnings view</a>
          </div>
        </div>
      </div>
    </div>`;

    $$("[data-ok]").forEach(b => b.onclick = () => {
      const [driver, key] = b.dataset.ok.split("|");
      GOGODocs.review(driver, key, "verify");
      toast("<b>Verified</b> · " + esc(driver) + " cleared on that document");
      setTimeout(() => location.reload(), 700);
    });
    $$("[data-no]").forEach(b => b.onclick = () => {
      const [driver, key] = b.dataset.no.split("|");
      const reason = prompt("Reason shown to the driver:", "Blurred photo — please upload a clearer copy.");
      if (reason === null) return;
      GOGODocs.review(driver, key, "reject", reason);
      toast("Rejected · driver notified with your reason");
      setTimeout(() => location.reload(), 700);
    });
    /* The "sign in as this passenger" buttons are gone with the phone flow.
       They faked a session in the browser, which is exactly the kind of
       backdoor that must not ship. Reviewing a passenger now means signing in
       as yourself. */
    $$("[data-as]").forEach(b => b.onclick = () => {
      toast("<b>Sign in as yourself</b> · passenger impersonation was removed");
      setTimeout(() => location.href = "auth", 900);
    });
    const gen = $('#genStatements');
    if (gen) gen.onclick = () => {
      GOGOPay.allDrivers().forEach(d => { const st = GOGOPay.statement(d, 0); if (st.payoutDue > 0) GOGOPay.post({ driver: d, kind: "payout", amount: st.payoutDue, label: "Payout · " + st.label }); });
      toast("<b>Invoices generated</b> · payouts posted to the ledger");
      setTimeout(() => location.reload(), 800);
    };
  }

  function boot() {
    seed();
    const page = document.body.dataset.page;
    if (page === "ops") pageOps();
    if (window.GOGO && GOGO.reveal) setTimeout(GOGO.reveal, 30);
    if (page === "driver") {
      const r = S.rides.find(x => x.driver === "Sipho M." || (x.requests || []).some(q => q.status !== "declined")) || S.rides[0];
      const host = document.querySelector("#main .g-5");
      if (host && r) {
        renderDocsCard(host, r.driver);
        if (!evaluate(r.driver).canDrive) {
          const banner = document.createElement("div");
          banner.className = "g-card g-mt";
          banner.style.borderColor = "rgba(192,57,43,.45)";
          banner.innerHTML = `<div class="g-row"><span class="g-ic" aria-hidden>⛔</span>
            <div><div class="g-t">Rides paused — compliance</div>
            <div class="g-list-s">${evaluate(r.driver).blocking.map(b => esc(b.label)).join(", ")} · fix this in the document centre below.</div></div></div>`;
          host.insertBefore(banner, host.firstChild);
        }
      }
    }
  }

  return { boot, pageOps, seed, REQUIREMENTS, STATES, docsOf, docOf, evaluate, canDrive,
           submit, review, watchboard, reviewQueue, renderDocsCard, daysTo, addMonths };
})();

window.GOGODocs = GOGODocs;
document.addEventListener("DOMContentLoaded", () => { try { GOGODocs.boot(); } catch (e) { console.error("GOGODocs boot failed", e); } });
