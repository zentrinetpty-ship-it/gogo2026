/* =========================================================================
   GOGO — Safety layer
   • Selfie captured at booking (passenger) and at listing (driver)
   • Held only for the duration of the ride
   • Auto-deleted 24h after the ride completes AND every passenger taps
     "I am safe". If a passenger never confirms, the ride is escalated to
     the platform instead of silently expiring.
   ========================================================================= */

const GOGOSafety = (() => {
  const HOUR = 3600 * 1000;
  const RETENTION_H = 24;          // delete 24h after completion + safe
  const ESCALATE_H = 72;           // no safe tap -> platform review
  const MAX_SIDE = 260;            // selfie stored small (privacy + size)

  /* ── store helpers ─────────────────────────────────────────────────────── */
  function safety() {
    if (!S.safety) S.safety = { selfies: [], log: [], consent: {} };
    if (!S.safety.selfies) S.safety.selfies = [];
    if (!S.safety.log) S.safety.log = [];
    return S.safety;
  }

  function audit(text) {
    safety().log.unshift({ at: new Date().toISOString(), text });
    save();
  }

  const fmt = iso => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  /* ── capture: camera sheet with consent ────────────────────────────────── */
  function capture({ rideRef, role, name, onSaved }) {
    const st = safety();
    const existing = st.selfies.find(s => s.rideRef === rideRef && s.role === role);
    const sheet = document.createElement("div");
    sheet.className = "g-sheet";
    sheet.innerHTML = `
      <div class="g-sheet-card" role="dialog" aria-modal="true" aria-label="Safety selfie">
        <div class="g-between" style="margin-bottom:12px">
          <div>
            <span class="g-label">Safety check</span>
            <div class="g-t g-mt-sm">${role === "driver" ? "Driver" : "Passenger"} selfie required</div>
            <div class="g-s-sm g-mt-sm">One photo, for security. It is the record of who was on this ride, so if anything goes wrong on the trip we know who was on board. Shown only to the person you travel with, deleted ${RETENTION_H}h after the trip.</div>
          </div>
          <span class="g-stamp g-stamp-ink">${RETENTION_H}h retention</span>
        </div>

        <div class="g-cam" id="camBox">
          <video id="camVideo" playsinline autoplay muted></video>
          <img id="camShot" alt="" style="display:none">
          <div class="g-cam-frame" aria-hidden></div>
          <div class="g-cam-hint" id="camHint">Look at the camera</div>
        </div>

        <div class="g-consent">
          <input type="checkbox" id="consentBox">
          <label for="consentBox">I agree GOGO may store this photo for the duration of this ride. It is the security record of who was on board, so if anything goes wrong on the trip we know who was in the car. It is shared only with the other person on the ride, and <b>auto-deleted ${RETENTION_H} hours after the trip ends</b> and I tap "I am safe". I can also delete it myself at any time.</label>
        </div>

        <div class="g-row g-mt" id="camBtns">
          <button class="g-btn g-btn-ink" id="shotBtn" type="button"><span aria-hidden>📸</span> Take selfie</button>
          <button class="g-btn g-btn-outline" id="retakeBtn" type="button" style="display:none">Retake</button>
          <button class="g-btn g-btn-outline" id="fileBtn" type="button"><span aria-hidden>🖼️</span> Use a photo</button>
          <button class="g-btn g-btn-ghost" id="cancelBtn" type="button">Cancel</button>
        </div>
        <input type="file" id="camFile" accept="image/*" capture="user" style="display:none">
        <p class="g-s-sm g-mt-sm" id="camNote">Photos are never shown publicly and never used for marketing.</p>
      </div>`;
    document.body.appendChild(sheet);

    const video = sheet.querySelector("#camVideo");
    const shot = sheet.querySelector("#camShot");
    const hint = sheet.querySelector("#camHint");
    const consent = sheet.querySelector("#consentBox");
    const shotBtn = sheet.querySelector("#shotBtn");
    const retakeBtn = sheet.querySelector("#retakeBtn");
    const note = sheet.querySelector("#camNote");
    let stream = null, dataUrl = existing ? existing.dataUrl : null, confirmed = false;

    if (existing) {                      // already captured this ride
      shot.src = existing.dataUrl; shot.style.display = "block"; video.style.display = "none";
      hint.textContent = "Selfie on file for this ride";
      shotBtn.innerHTML = '<span aria-hidden>✅</span> Keep this selfie';
      consent.checked = true;
    }

    async function startCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 640 }, audio: false });
        video.srcObject = stream; video.style.display = "block"; shot.style.display = "none";
        shotBtn.innerHTML = '<span aria-hidden>📸</span> Take selfie';
      } catch (e) {
        video.style.display = "none";
        hint.textContent = "No camera access — use a photo instead";
        note.textContent = "Camera blocked. Tap “Use a photo” to pick one from your device.";
      }
    }
    startCam();

    function stopCam() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }

    function toDataUrl(source, w, h) {
      const c = document.createElement("canvas");
      const side = Math.min(source.videoWidth || w, source.videoHeight || h);
      const sw = source.videoWidth || w, sh = source.videoHeight || h;
      const s = Math.min(sw, sh);
      c.width = MAX_SIDE; c.height = MAX_SIDE;
      const ctx = c.getContext("2d");
      ctx.drawImage(source, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, MAX_SIDE, MAX_SIDE);
      return c.toDataURL("image/jpeg", 0.72);
    }

    function paint() {
      if (!dataUrl) return;
      shot.src = dataUrl; shot.style.display = "block"; video.style.display = "none";
      retakeBtn.style.display = "";
      hint.textContent = confirmed ? "Selfie on file for this ride" : "Looking good";
      shotBtn.innerHTML = confirmed ? '<span aria-hidden>✅</span> Confirm selfie' : '<span aria-hidden>✅</span> Use this selfie';
    }

    shotBtn.onclick = () => {
      if (confirmed && dataUrl) { finish(); return; }              // already have one: confirm
      if (!consent.checked) { toast("Please tick the consent box first"); return; }
      if (video.style.display !== "none" && video.videoWidth) {
        dataUrl = toDataUrl(video, video.videoWidth, video.videoHeight);
        confirmed = true; paint();
      } else {
        sheet.querySelector("#camFile").click();                   // no camera: pick a photo
      }
    };

    retakeBtn.onclick = () => { dataUrl = null; confirmed = false; startCam(); };
    sheet.querySelector("#fileBtn").onclick = () => sheet.querySelector("#camFile").click();
    sheet.querySelector("#camFile").onchange = e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const img = new Image();
      img.onload = () => { dataUrl = toDataUrl(img, img.width, img.height); confirmed = true; paint(); };
      img.src = URL.createObjectURL(f);
    };
    sheet.querySelector("#cancelBtn").onclick = () => { stopCam(); sheet.remove(); };

    function finish() {
      if (!dataUrl) { toast("A selfie is required to continue"); return; }
      stopCam();
      const st2 = safety();
      if (existing) {
        existing.dataUrl = dataUrl; existing.takenAt = new Date().toISOString();
        audit(`Selfie refreshed · ${role} ${name} · ${rideRef}`);
      } else {
        st2.selfies.push({
          id: "sf" + Date.now(), rideRef, role, name, dataUrl,
          takenAt: new Date().toISOString(), purgeAt: null, deletedAt: null,
        });
        audit(`Selfie captured · ${role} ${name} · ${rideRef}`);
      }
      st2.consent[role] = new Date().toISOString();
      save();
      sheet.remove();
      toast("<b>Safety check done</b> · stored for this ride only");
      if (onSaved) onSaved(dataUrl);
    }

    if (existing) { confirmed = true; paint(); consent.checked = true; }
  }

  /* ── retention engine ─────────────────────────────────────────────────── */
  function schedulePurge(r) {
    const accepted = (r.requests || []).filter(q => q.status === "accepted");
    const safeOf = phone => (r.safe || {})[phone] || null;
    const times = accepted.map(q => safeOf(q.phone)).filter(Boolean);
    const allSafe = accepted.length > 0 && times.length === accepted.length;
    const completed = r.completedAt ? new Date(r.completedAt).getTime() : null;
    const lastSafe = times.length ? Math.max(...times.map(t => new Date(t).getTime())) : null;

    /* Per person: a passenger's own photo clears 24h after the ride is complete
       AND that passenger tapped "I am safe". The driver's photo clears once
       everyone on the ride is accounted for. */
    safety().selfies.filter(s => s.rideRef === rideRefOf(r)).forEach(s => {
      let base = null;
      if (s.role === "passenger") {
        const q = accepted.find(x => x.name === s.name);
        const t = q ? safeOf(q.phone) : null;
        if (completed && t) base = Math.max(completed, new Date(t).getTime());
      } else if (s.role === "driver" && completed && allSafe) {
        base = Math.max(completed, lastSafe);
      }
      s.purgeAt = base ? new Date(base + RETENTION_H * HOUR).toISOString() : null;
      s.holdReason = base ? null : (!completed ? "ride still running" : "waiting for a safe confirmation");
    });

    const armed = safety().selfies.filter(s => s.rideRef === rideRefOf(r) && s.purgeAt).map(s => new Date(s.purgeAt).getTime());
    r.purgeAt = armed.length ? new Date(Math.max(...armed)).toISOString() : null;

    if (completed && !allSafe && Date.now() - completed > ESCALATE_H * HOUR) {
      if (!r.escalated) {
        r.escalated = true;
        audit(`⚠ ${rideRefOf(r)} · a passenger never confirmed safe · escalated to platform review · photos held`);
      }
    }
    if (completed && allSafe) r.escalated = false;
    save();
  }

  const rideRefOf = r => (r && (r.id || r.rideId)) || "ride";

  function purgeDue() {
    const now = Date.now();
    let removed = 0;
    const st = safety();
    st.selfies = st.selfies.filter(s => {
      if (s.purgeAt && new Date(s.purgeAt).getTime() <= now) {
        audit(`Deleted · ${s.role} ${s.name}'s selfie · ${s.rideRef} · retention period ended`);
        removed++;
        return false;
      }
      return true;
    });
    if (removed) save();
    return removed;
  }

  function purgeNow(id) {
    const st = safety();
    const s = st.selfies.find(x => x.id === id);
    if (!s) return;
    st.selfies = st.selfies.filter(x => x.id !== id);
    audit(`Deleted by user · ${s.role} ${s.name}'s selfie · ${s.rideRef}`);
    save();
  }

  const countdown = iso => {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "deleting now";
    const h = Math.floor(ms / HOUR), m = Math.floor((ms % HOUR) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const forRide = rideRef => safety().selfies.filter(s => s.rideRef === rideRef);

  /* ── "I am safe" ──────────────────────────────────────────────────────── */
  function markSafe(r, q) {
    r.safe = r.safe || {};
    r.safe[q.phone] = new Date().toISOString();
    save();
    schedulePurge(r);
    const st = safety();
    const whom = (r.requests || []).filter(x => x.status === "accepted");
    const done = whom.every(x => r.safe[x.phone]);
    audit(`“I am safe” · ${q.name} · ${rideRefOf(r)}${done ? " · all passengers confirmed" : ""}`);
    return done;
  }

  function boot() {
    const n = purgeDue();
    // keep the retention clock honest as time passes while the app is open
    setInterval(() => { if (purgeDue()) toast("Retention: expired safety photos deleted"); }, 60000);
    return n;
  }

  return { capture, schedulePurge, purgeDue, purgeNow, countdown, forRide, markSafe, boot, audit,
           auditLog: () => safety().log, RETENTION_H, ESCALATE_H, rideRefOf, fmt };
})();

window.GOGOSafety = GOGOSafety;

document.addEventListener("DOMContentLoaded", () => {
  try { GOGOSafety.boot(); } catch (e) { console.error("GOGOSafety boot failed", e); }
});
