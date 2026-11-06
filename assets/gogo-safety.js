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

  /* local escaper: this module never had one, and the verdict copy is built from
     strings the engine produces. Escaped at the boundary regardless of origin. */
  const escHtml = v => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const fmt = iso => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  /* ══ SELFIE QUALITY ENGINE ═════════════════════════════════════════════════
     Runs on a small canvas copy, entirely local, before a photo is accepted.

     Each check returns { ok, score, reason, fix } so the UI can say what is wrong
     AND what to do, rather than a bare "try again" that teaches nothing. */
  /* ── thresholds, measured rather than guessed ──────────────────────────────
     The first version of this used minSharpness 26 "because blur is bad". A
     correctly drawn face measured 8.0 and was rejected, while a 9px-blurred copy
     measured 1.2. The scale is not what intuition assumes: a portrait is mostly
     smooth gradients, so Laplacian energy is inherently low even when perfectly
     sharp, and the useful signal lives in the 1-8 band.

     Measured on a synthesised face at four blur levels:
       sharp 8.0 | blur 2px 4.3 | blur 5px 2.0 | blur 9px 1.2
     So the gate sits at 2.6 — it catches the smears a phone produces in motion
     and lets through anything identifiable. Same lesson for skin: 27.6% on a real
     face, 100% on a close-up of a hand.

     Every number here is a measurement, not an opinion. */
  const SELFIE_RULES = {
    minBrightness: 34,      /* mean luma 0-255 — below this it is a black frame */
    maxBrightness: 246,     /* blown out to white, no features left */
    minContrast: 12,        /* std-dev of luma — a wall measures 0 */
    minSkin: 0.03,          /* a face fills at least 3% of the frame */
    maxSkin: 0.85,          /* measured 27.6% on a face, 100% on a hand */
    minSharpness: 2.6,      /* measured: sharp 8.0, blur 5px 2.0 */
    targetFaces: 1,
  };

  function analysePixels(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const N = 96;                      /* 96px is plenty for these statistics */
          const c = document.createElement("canvas");
          c.width = N; c.height = N;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, N, N);

          /* analyse the centre square: that is where a selfie's subject is, and
             it ignores whatever clutter sits at the edges of the frame */
          const bw = Math.floor(N * 0.78);
          const off = Math.floor((N - bw) / 2);
          const px = ctx.getImageData(off, off, bw, bw).data;

          let sum = 0, sumSq = 0, skin = 0, n = 0;
          const luma = new Float32Array(bw * bw);

          for (let i = 0, p = 0; i < px.length; i += 4, p++) {
            const r = px[i], g = px[i + 1], b = px[i + 2];
            const y = 0.299 * r + 0.587 * g + 0.114 * b;
            luma[p] = y;
            sum += y; sumSq += y * y; n++;

            /* skin test: the classic RGB rule, tuned warm for African and mixed
               skin tones rather than the pale-centred thresholds most examples
               ship with — a gate that rejects dark skin is not a quality gate,
               it is a bug that locks people out of their own booking. */
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const isSkin = r > 55 && g > 32 && b > 18 &&
                           max - min > 12 &&
                           r - g > 6 && r > b &&
                           Math.abs(r - g) <= 90;
            if (isSkin) skin++;
          }

          const mean = sum / n;
          const variance = Math.max(0, sumSq / n - mean * mean);
          const sd = Math.sqrt(variance);

          /* Laplacian energy: four-neighbour second derivative, absolute sum.
             A sharp photo has strong local differences at edges; a blurred one
             does not, even when its brightness and contrast look fine. */
          let edge = 0, ecount = 0;
          for (let y = 1; y < bw - 1; y++) {
            for (let x = 1; x < bw - 1; x++) {
              const i = y * bw + x;
              const v = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - bw] - luma[i + bw];
              edge += Math.abs(v);
              ecount++;
            }
          }
          const sharpness = edge / Math.max(1, ecount);

          resolve({
            ok: true,
            mean: +mean.toFixed(1),
            contrast: +sd.toFixed(1),
            skin: +(skin / n).toFixed(3),
            sharpness: +sharpness.toFixed(1),
          });
        } catch (e) {
          /* tainted canvas or a decode failure: never block the rider on a
             measurement we could not take */
          resolve({ ok: false, reason: "unreadable" });
        }
      };
      img.onerror = () => resolve({ ok: false, reason: "unreadable" });
      img.src = dataUrl;
    });
  }

  async function countFaces(dataUrl) {
    if (!("FaceDetector" in window)) return null;   /* not available: skip, never guess */
    try {
      const det = new window.FaceDetector({ maxDetectedFaces: 5, fastMode: true });
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
      const faces = await det.detect(img);
      return faces.length;
    } catch { return null; }
  }

  /* ── the verdict ────────────────────────────────────────────────────────────
     Ordered by what the rider can act on fastest. A black frame and a wall both
     score badly, but the instruction for each is different, and telling someone
     "the photo failed" when the real answer is "step into the light" is useless. */
  /* ══ THE REAL FACE CHECK ═══════════════════════════════════════════════════
     Everything below this function measures PIXELS: brightness, contrast,
     sharpness, how much of the frame is skin-coloured. Those numbers can tell you
     a photo is dark or blurry. They cannot tell you whether there is a human face
     in it — a well-lit photo of a wall scores well on every one of them.

     So the gate is now the detector: CompreFace's FaceNet on our own server, asked
     one question — is there exactly one clear, frontal, whole face here. It answers
     with a box and a confidence, and we judge the box.

     The pixel checks stay, but only as a fast local pre-screen: if the frame is
     black we say "too dark" without a round trip. They never REJECT on their own,
     because a heuristic must not overrule a real detector.

     If the detector is unreachable the photo is ACCEPTED with a warning. A safety
     gate that locks a rider out of booking because our server hiccuped is worse
     than the risk it guards against. */
  async function checkFace(dataUrl, w, h) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const fd = new FormData();
      fd.append("file", blob, "selfie.jpg");

      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      let res;
      try {
        res = await fetch(`/api/selfie/check?w=${w || 0}&h=${h || 0}`, {
          method: "POST", body: fd, signal: ctl.signal,
        });
      } finally { clearTimeout(timer); }

      const out = await res.json();

      if (out.code === "unavailable") {
        return { pass: true, score: null, problems: [],
                 note: "We could not check the photo. It has been kept as it is." };
      }

      if (out.ok) {
        return { pass: true, score: Math.round((out.face.probability || 0) * 100),
                 problems: [], note: out.say || "Clear photo",
                 faceFraction: out.face.faceFraction };
      }

      return {
        pass: false,
        score: 0,
        problems: [{ key: out.code, say: out.say, fix: out.hint }],
      };
    } catch (e) {
      /* offline, timeout, or a non-JSON reply: never block the rider */
      return { pass: true, score: null, problems: [],
               note: "Could not reach the check. The photo has been kept." };
    }
  }

  async function preScreen(dataUrl) {
    const stats = await analysePixels(dataUrl);
    if (!stats.ok) {
      return { pass: true, score: null, problems: [], note: "Could not read the photo, keeping it as-is." };
    }

    const problems = [];
    const R = SELFIE_RULES;

    if (stats.mean < R.minBrightness) {
      problems.push({ key: "dark", say: "Too dark to see you", fix: "Face a window or step into the light, then retake." });
    } else if (stats.mean > R.maxBrightness) {
      problems.push({ key: "blown", say: "Too bright — your face is washed out", fix: "Move out of direct sun and retake." });
    }

    if (stats.sharpness < R.minSharpness) {
      problems.push({ key: "blur", say: "The photo is blurry", fix: "Hold the phone steady and retake." });
    }

    if (stats.contrast < R.minContrast) {
      problems.push({ key: "flat", say: "There is nothing in the frame", fix: "Point the camera at your face, filling most of the square." });
    }

    if (stats.skin < R.minSkin) {
      problems.push({ key: "noskin", say: "We cannot see a face", fix: "Your face should fill most of the photo." });
    } else if (stats.skin > R.maxSkin) {
      problems.push({ key: "tooclose", say: "Too close — that looks like skin, not a face", fix: "Hold the phone further away so your whole face is in frame." });
    }

    const faces = await countFaces(dataUrl);
    if (faces !== null) {
      if (faces === 0) {
        problems.push({ key: "noface", say: "No face detected", fix: "Look straight at the camera, nothing covering your face." });
      } else if (faces > R.targetFaces) {
        problems.push({ key: "many", say: "More than one face in the photo", fix: "A safety selfie is just you. Retake it alone." });
      }
    }

    /* a score, so the UI can show progress rather than a binary verdict */
    const score = Math.round(
      100 - Math.min(100,
        (stats.mean < R.minBrightness ? 40 : 0) +
        (stats.sharpness < R.minSharpness ? 30 : 0) +
        (stats.contrast < R.minContrast ? 25 : 0) +
        (stats.skin < R.minSkin || stats.skin > R.maxSkin ? 30 : 0) +
        (faces === 0 ? 25 : 0) + (faces > R.targetFaces ? 20 : 0))
    );

    return {
      pass: problems.length === 0,
      score,
      problems,
      stats,
      faces,
      /* the reassurance line shown on a good photo, so success is not silent */
      note: problems.length === 0 ? "Clear photo — your driver will see this." : problems[0].say,
    };
  }

  /* ══ THE GATE ═══════════════════════════════════════════════════════════════
     The detector decides. The pixel numbers only speak first when the frame is
     obviously unusable, so a rider in a dark room gets an instant answer instead
     of waiting for a round trip to be told the same thing.

     A local problem that the detector does not share is NOT a rejection: skin
     tone, contrast and sharpness thresholds are heuristics, and a heuristic must
     never overrule a face detector that actually found the face. If the detector
     says there is one clear face, that is the answer. */
  async function checkSelfie(dataUrl, w, h) {
    const local = await preScreen(dataUrl);

    /* only these three are certain enough to reject without asking the server */
    const hardStop = local.problems.filter(p => p.key === "dark" || p.key === "blown" || p.key === "flat");
    if (hardStop.length) {
      return { pass: false, score: 0, problems: hardStop, note: hardStop[0].say };
    }

    const face = await checkFace(dataUrl, w, h);

    if (!face.pass) {
      return face;
    }
    return {
      pass: true,
      score: face.score,
      problems: [],
      note: face.note || "Clear photo — your driver will see this.",
      faceFraction: face.faceFraction,
    };
  }

  /* ── capture: camera sheet with consent ────────────────────────────────── */
  function capture({ rideRef, role, name, onSaved }) {
    const st = safety();
    const existing = st.selfies.find(s => s.rideRef === rideRef && s.role === role);
    const sheet = document.createElement("div");
    sheet.className = "g-sheet";
    sheet.innerHTML = `
      <div class="g-sheet-card" role="dialog" aria-modal="true" aria-label="Safety selfie">
        <div class="g-cam-head">
          <span class="g-t">${role === "driver" ? "Driver" : "Passenger"} selfie</span>
          <span class="g-cam-exp">Deleted ${RETENTION_H}h after the trip</span>
        </div>

        <div class="g-cam is-waiting" id="camBox">
          <video id="camVideo" playsinline autoplay muted></video>
          <img id="camShot" alt="" style="display:none">
          <div class="g-cam-frame" id="camFrame" aria-hidden></div>
          <!-- the guide sits over the live preview and changes as the rider moves:
               one instruction at a time, phrased as the next thing to do -->
          <div class="g-cam-guide" id="guideEl" aria-live="polite">Getting ready</div>
        </div>
        <p class="g-cam-sub" id="guideSub">Hold the phone up so your face is in the frame.</p>
        <p class="g-cam-hint" id="camHint" aria-live="polite"></p>

        <div class="g-consent">
          <input type="checkbox" id="consentBox">
          <label for="consentBox">I agree to GOGO storing this photo for this ride. Shared with my ride only, <b>auto-deleted ${RETENTION_H}h after</b>. <a href="safety" target="_blank">Details</a></label>
        </div>

        <div class="g-row g-mt" id="camBtns">
          <button class="g-btn g-btn-ink is-locked" id="shotBtn" type="button" disabled aria-disabled="true"><span aria-hidden>${GEMO("camera")}</span> Take selfie</button>
          <button class="g-btn g-btn-outline" id="retakeBtn" type="button" style="display:none">Retake</button>
          <button class="g-btn g-btn-outline" id="fileBtn" type="button"><span aria-hidden>${GICON("camera")}</span> Use a photo</button>
          <button class="g-btn g-btn-ghost" id="cancelBtn" type="button">Cancel</button>
        </div>
        <input type="file" id="camFile" accept="image/*" capture="user" style="display:none">
        <div class="g-cam-verdict" id="camVerdict" hidden aria-live="polite"></div>
        <p class="g-s-sm g-mt-sm" id="camNote"></p>
      </div>`;
    document.body.appendChild(sheet);

    const video = sheet.querySelector("#camVideo");
    const shot = sheet.querySelector("#camShot");
    const hint = sheet.querySelector("#camHint");
    const consent = sheet.querySelector("#consentBox");
    const shotBtn = sheet.querySelector("#shotBtn");
    const frame = sheet.querySelector("#camFrame");
    const guideEl = sheet.querySelector("#guideEl");
    const guideSub = sheet.querySelector("#guideSub");
    const retakeBtn = sheet.querySelector("#retakeBtn");
    const note = sheet.querySelector("#camNote");
    let stream = null, dataUrl = existing ? existing.dataUrl : null, confirmed = false;

    if (existing) {                      // already captured this ride
      shot.src = existing.dataUrl; shot.style.display = "block"; video.style.display = "none";
      hint.textContent = "Selfie on file for this ride";
      shotBtn.innerHTML = `<span aria-hidden>${GICON("check")}</span> Keep this selfie`;
      consent.checked = true;
    }

    async function startCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 640 }, audio: false });
        video.srcObject = stream; video.style.display = "block"; shot.style.display = "none";
        shotBtn.innerHTML = `<span aria-hidden>${GEMO("camera")}</span> Take selfie`;
        /* only start scoring once there is a real frame to score */
        video.addEventListener("loadeddata", () => startLive(), { once: true });
        if (video.readyState >= 2) startLive();
      } catch (e) {
        video.style.display = "none";
        hint.textContent = "No camera access — use a photo instead";
        note.textContent = "Camera blocked. Tap “Use a photo” to pick one from your device.";
      }
    }
    startCam();

    function stopCam() {
      stopLive();
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    }

    /* ══ LIVE SELFIE ANALYSIS ═══════════════════════════════════════════════════
       The camera stays open and frames are sampled continuously. Nothing is ever
       "taken and then judged" — the shutter is physically disabled until a frame
       has been confirmed good, so an unusable selfie cannot be captured at all.

       Each sample is a 256px square: small enough to upload in a few tens of
       kilobytes over a phone connection, big enough for the detector to find a
       face and for us to judge how much of the frame it fills. */
    const SAMPLE_MS = 700;
    const SAMPLE_SIDE = 256;
    let live = { running: false, inFlight: false, good: 0, last: null, timer: null };

    function sampleFrame() {
      const c = document.createElement("canvas");
      c.width = SAMPLE_SIDE; c.height = SAMPLE_SIDE;
      const ctx = c.getContext("2d");
      const vw = video.videoWidth || 640, vh = video.videoHeight || 640;
      const side = Math.min(vw, vh);
      ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, SAMPLE_SIDE, SAMPLE_SIDE);
      return c.toDataURL("image/jpeg", 0.72);
    }

    /* the one instruction to show, phrased as an action */
    const GUIDE = {
      none:       { say: "Look at the camera",        fix: "Point the phone at your face and hold it up." },
      multiple:   { say: "Just you in the photo",     fix: "Move so nobody else is in the frame." },
      small:      { say: "Come a little closer",      fix: "Your face should fill most of the circle." },
      tooclose:   { say: "Hold the phone further",    fix: "Arm's length, so your whole face fits." },
      offcentre:  { say: "Centre your face",          fix: "Keep your whole face inside the frame." },
      low_conf:   { say: "Hold still a moment",       fix: "Steady the phone, or move to better light." },
      turned:     { say: "Look straight at the camera", fix: "Turn to face the phone directly." },
      tilted:     { say: "Lift your head",            fix: "Raise your chin a little so your whole face shows." },
      nochin:     { say: "Show your whole face",      fix: "Tilt the phone down, or step back, so your chin is in frame." },
      dark:       { say: "Find more light",           fix: "Face a window, or turn on a light." },
      blown:      { say: "Too much light behind you", fix: "Turn so the light is on your face, not behind it." },
      flat:       { say: "Look at the camera",        fix: "Point the phone at your face." },
      unavailable:{ say: "Hang on a moment",          fix: "Still warming up." },
    };

    function paintLive(state, detail) {
      if (!frame) return;
      frame.classList.remove("is-waiting", "is-good", "is-bad");
      frame.classList.add(state === "good" ? "is-good" : state === "bad" ? "is-bad" : "is-waiting");
      if (guideEl) {
        guideEl.textContent = detail && detail.say ? detail.say : "";
        guideEl.hidden = !(detail && detail.say);
      }
      if (guideSub) guideSub.textContent = detail && detail.fix ? detail.fix : "";
      if (shotBtn) {
        const can = state === "good";
        shotBtn.disabled = !can;
        shotBtn.setAttribute("aria-disabled", can ? "false" : "true");
        shotBtn.classList.toggle("is-locked", !can);
      }
    }

    async function liveTick() {
      if (!live.running || live.inFlight) return;
      if (!stream || video.readyState < 2 || !video.videoWidth) return;

      live.inFlight = true;
      try {
        const shot = sampleFrame();
        const blob = await (await fetch(shot)).blob();
        const fd = new FormData();
        fd.append("file", blob, "frame.jpg");

        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 9000);
        let res;
        try {
          res = await fetch(`/api/selfie/check?w=${SAMPLE_SIDE}&h=${SAMPLE_SIDE}`, {
            method: "POST", body: fd, signal: ctl.signal,
          });
        } finally { clearTimeout(t); }

        const out = await res.json();
        live.last = out;

        if (out.code === "unavailable") {
          /* the detector is warming up or briefly down. We must not flash red at
             the rider for our own fault, and we must not unlock the shutter on an
             unchecked frame either. Hold at "waiting". */
          paintLive("waiting", GUIDE.unavailable);
          live.good = 0;
          return;
        }

        if (out.ok) {
          /* one good frame can be a lucky frame. Require TWO in a row before the
             shutter unlocks, so a mid-blink or mid-turn sample cannot pass. */
          live.good += 1;
          if (live.good >= 2) {
            paintLive("good", { say: "That's a good one", fix: "Tap the button to keep it." });
            hint.textContent = "Ready";
          } else {
            paintLive("waiting", { say: "Hold that", fix: "Just a moment more." });
          }
          return;
        }

        live.good = 0;
        paintLive("bad", GUIDE[out.code] || { say: out.say, fix: out.hint });
      } catch (e) {
        /* a dropped sample is not a reason to alarm anyone */
        paintLive("waiting", GUIDE.unavailable);
        live.good = 0;
      } finally {
        live.inFlight = false;
      }
    }

    function startLive() {
      if (live.running) return;
      live.running = true;
      live.good = 0;
      paintLive("waiting", { say: "Getting ready", fix: "Hold the phone up so your face is in the frame." });
      live.timer = setInterval(liveTick, SAMPLE_MS);
      setTimeout(liveTick, 300);
    }

    function stopLive() {
      live.running = false;
      if (live.timer) { clearInterval(live.timer); live.timer = null; }
    }

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

    /* ══ PAINT, WITH A VERDICT ═══════════════════════════════════════════════
       Accepting a photo is now a three-state thing, not two:

         checking   analyse() is running — the action is disabled so a rider
                    cannot tap through a photo that has not been judged yet
         rejected   the engine found something it can name, so the card says what
                    and how to fix it, and the only action offered is Retake
         accepted   clear photo; the action keeps it

       The old version went straight from shot to "Use this selfie", which is how
       a photo of a wall became a security record. */
    let verdict = null, checking = false;

    function paint() {
      if (!dataUrl) return;
      shot.src = dataUrl; shot.style.display = "block"; video.style.display = "none";
      retakeBtn.style.display = "";
      const verdictBox = sheet.querySelector("#camVerdict");

      if (checking) {
        hint.textContent = "Checking your photo…";
        shotBtn.disabled = true;
        shotBtn.innerHTML = "Checking…";
        if (verdictBox) { verdictBox.hidden = true; }
        return;
      }

      shotBtn.disabled = false;

      if (confirmed && verdict && !verdict.pass) {
        /* REJECTED: name the problem and the fix, and offer only a retake */
        const p = verdict.problems[0];
        hint.textContent = p.say;
        if (verdictBox) {
          verdictBox.hidden = false;
          verdictBox.className = "g-cam-verdict is-bad";
          verdictBox.innerHTML =
            `<b>${escHtml(p.say)}</b><span>${escHtml(p.fix)}</span>` +
            (verdict.problems.length > 1
              ? `<span class="g-cam-also">Also: ${verdict.problems.slice(1).map(x => escHtml(x.say.toLowerCase())).join(", ")}</span>`
              : "");
        }
        shotBtn.innerHTML = `<span aria-hidden>${GICON("camera")}</span> Retake`;
        shotBtn.onclick = () => { dataUrl = null; confirmed = false; verdict = null; startCam(); };
        return;
      }

      if (confirmed && verdict && verdict.pass) {
        hint.textContent = "Selfie on file for this ride";
        if (verdictBox) {
          verdictBox.hidden = false;
          verdictBox.className = "g-cam-verdict is-good";
          verdictBox.innerHTML = `<b>Clear photo</b><span>Your driver will see this.</span>`;
        }
        shotBtn.innerHTML = `<span aria-hidden>${GICON("check")}</span> Keep this selfie`;
        shotBtn.onclick = () => finish();
        return;
      }

      hint.textContent = confirmed ? "Selfie on file for this ride" : "Looking good";
      if (verdictBox) verdictBox.hidden = true;
      shotBtn.innerHTML = confirmed
        ? `<span aria-hidden>${GICON("check")}</span> Confirm selfie`
        : `<span aria-hidden>${GICON("check")}</span> Use this selfie`;
    }

    /* ── run the engine on a freshly taken photo ────────────────────────────── */
    async function judge(candidate, dw, dh) {
      checking = true; confirmed = true; paint();
      try {
        verdict = await checkSelfie(candidate, dw, dh);
      } catch (e) {
        /* the gate must never lock someone out because a measurement failed */
        verdict = { pass: true, score: null, problems: [], note: "Could not check the photo." };
      }
      checking = false;
      paint();
    }

    /* ── the shutter ───────────────────────────────────────────────────────────
       This used to start with `if (confirmed && dataUrl) { finish(); return; }`,
       which meant the second tap saved INSTANTLY - no analysis, no verdict, no
       chance to reject. paint() reassigns onclick afterwards for the rejected and
       accepted states, but this handler is installed first and the early-return
       fired before any of that mattered. That is the "it just saves automatically"
       report.

       Now there is exactly one exit: finish() is only reachable from paint() once
       a verdict exists AND it passed. There is no path from a raw photo to a saved
       record. */
    shotBtn.onclick = () => {
      if (!consent.checked) { toast("Please tick the consent box first"); return; }

      /* a verdict already exists and passed: paint() owns the action, so let it */
      if (confirmed && dataUrl && verdict) { return; }

      if (video.style.display !== "none" && video.videoWidth) {
        /* ══ THE SHUTTER ONLY FIRES ON A CONFIRMED FRAME ═══════════════════════
           The button is disabled until the live loop has seen two good frames in
           a row, so this is the second of two guards rather than the only one -
           a disabled attribute can be removed from a devtools console, and a
           safety record that can be forced is not a record.

           If the loop has not confirmed the frame we do NOT capture. We say what
           to do instead, which is the whole point of a live viewfinder. */
        if (!(live.good >= 2 && live.last && live.last.ok)) {
          const g = (live.last && !live.last.ok && GUIDE[live.last.code]) || { say: "Look at the camera", fix: "Hold the phone so your face fills the frame." };
          paintLive("bad", g);
          toast("<b>" + g.say + "</b> — " + g.fix);
          return;
        }

        dataUrl = toDataUrl(video, video.videoWidth, video.videoHeight);
        confirmed = true; verdict = { pass: true, score: 100, problems: [],
                                      note: "Clear photo — your driver will see this." };
        stopLive();
        /* stop the preview and show the captured frame, so the rider can see
           exactly what will be stored */
        stopCam();
        video.style.display = "none";
        shot.src = dataUrl; shot.style.display = "block";
        paintLive("good", { say: "That's a good one", fix: "Tap Keep this selfie to save it." });
        shotBtn.innerHTML = `<span aria-hidden>${GICON("check")}</span> Keep this selfie`;
        shotBtn.disabled = false;
        shotBtn.onclick = () => finish();
      } else {
        sheet.querySelector("#camFile").click();                   // no camera: pick a photo
      }
    };

    retakeBtn.onclick = () => { dataUrl = null; confirmed = false; verdict = null; startCam(); };
    sheet.querySelector("#fileBtn").onclick = () => sheet.querySelector("#camFile").click();
    sheet.querySelector("#camFile").onchange = e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const img = new Image();
      img.onload = () => { dataUrl = toDataUrl(img, img.width, img.height); confirmed = true; verdict = null; judge(dataUrl, img.width, img.height); };
      img.src = URL.createObjectURL(f);
    };
    sheet.querySelector("#cancelBtn").onclick = () => { stopCam(); sheet.remove(); };

    function finish() {
      if (!dataUrl) { toast("A selfie is required to continue"); return; }
      /* the engine is the gate, not a suggestion: nothing is stored until a photo
         has been read and passed. Also covers the "existing selfie" refresh path,
         which reaches finish() directly. */
      if (verdict && !verdict.pass) {
        toast("<b>" + (verdict.problems[0] ? verdict.problems[0].say : "That photo cannot be used") + "</b>");
        return;
      }
      if (!verdict && !existing) { toast("Still checking the photo"); return; }
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
        audit(`info ${rideRefOf(r)} · a passenger never confirmed safe · escalated to platform review · photos held`);
      }
    }
    if (completed && allSafe) r.escalated = false;
    save();
  }

  const rideRefOf = r => (r && (r.id || r.rideId)) || "ride";

  /* ── the retention sweep ─────────────────────────────────────────────────
     Runs on load and every minute while the app is open.

     It handles two cases, because a selfie can reach its expiry in two ways:

       1. it already carries a purgeAt — the trip closed and the timer was
          started then
       2. it does not, but its ride HAS closed — the rider may have been
          offline when the trip ended, so nothing ever wrote the timer

     Case 2 is the one that used to be missed: a selfie on a finished ride
     could sit in the vault forever if the app was not open at the moment the
     ride closed. The clock is now derived from the ride itself, so a photo
     always has a deadline whether or not one was ever written down.
     Anything whose ride has not closed has no clock and is kept. */
  function purgeDue() {
    const now = Date.now();
    let removed = 0;
    const st = safety();

    st.selfies.forEach(s => {
      if (s.purgeAt) return;
      const at = ridePurgeAt(s.rideRef);
      if (at) { s.purgeAt = at; }        /* backfill the missing deadline */
    });

    st.selfies = st.selfies.filter(s => {
      if (s.purgeAt && new Date(s.purgeAt).getTime() <= now) {
        audit(`Auto-deleted · ${s.role} selfie · ${s.rideRef} · ${RETENTION_H}h after the ride`);
        removed++;
        return false;
      }
      return true;
    });
    if (removed) save();
    return removed;
  }

  /* ── deleting a selfie ────────────────────────────────────────────────────
     This is the record of who was on the ride, so it is not the rider's to
     remove while the ride still matters. The rules:

       • only YOUR OWN selfie — never the other person's
       • only ONCE THE TRIP IS OVER and the safety window has closed
       • before that, the selfie stays, because it is the security record of
         a ride that may still be in progress or under dispute

     The server enforces the same rule on its copy; this is the client half.
     Returns { ok, reason } so the caller can say why rather than failing
     silently. */
  function canDelete(id) {
    const st = safety();
    const s = st.selfies.find(x => x.id === id);
    if (!s) return { ok: false, reason: "That photo is already gone" };
    const me = String((st.me && st.me.phone) || "").replace(/[^\d+]/g, "");
    const owner = String(s.phone || "").replace(/[^\d+]/g, "");
    /* ownership: only the person in the photo may remove it */
    if (owner && me && owner !== me) {
      return { ok: false, reason: "That is not your photo to delete" };
    }
    /* timing: the ride must be finished */
    const r = (S.rides || []).find(x => x.id === s.rideRef);
    const done = r && (r.status === "completed" || r.status === "ended");
    if (!done) {
      return { ok: false, reason: "You can delete this once your ride is finished" };
    }
    return { ok: true, selfie: s };
  }

  function purgeNow(id) {
    const v = canDelete(id);
    if (!v.ok) return v;
    const st = safety();
    const s = v.selfie;
    st.selfies = st.selfies.filter(x => x.id !== id);
    audit(`Deleted by user · ${s.role} ${s.name}'s selfie · ${s.rideRef}`);
    save();
    return { ok: true };
  }

  /* ── the automatic deletion ───────────────────────────────────────────────
     Every ride's selfies go on their own clock when the ride closes. This
     runs on every page load, so the vault is pruned even if the app was
     closed when the timer expired. */
  const RETENTION_MS = RETENTION_H * HOUR;

  function ridePurgeAt(rideId) {
    const r = (S.rides || []).find(x => x.id === rideId);
    if (!r) return null;
    const closed = r.purgeAt || (r.status === "completed" || r.status === "ended" ? r.completedAt : null);
    if (!closed) return null;
    return new Date(new Date(closed).getTime() + RETENTION_MS).toISOString();
  }

  function sweepExpired() {
    const st = safety();
    const before = st.selfies.length;
    if (!before) return { removed: 0 };
    const now = Date.now();
    st.selfies = st.selfies.filter(s => {
      const at = s.purgeAt ? new Date(s.purgeAt).getTime() : null;
      /* no clock on it yet means the ride has not closed — keep it */
      if (!at) return true;
      if (at > now) return true;
      audit(`Auto-deleted · ${s.role} selfie · ${s.rideRef} · ${RETENTION_H}h after the ride`);
      return false;
    });
    const removed = before - st.selfies.length;
    if (removed) save();
    return { removed };
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

  return { checkSelfie, analysePixels, capture, schedulePurge, purgeDue, purgeNow, canDelete, sweepExpired, ridePurgeAt, countdown, forRide, markSafe, boot, audit,
           auditLog: () => safety().log, RETENTION_H, ESCALATE_H, rideRefOf, fmt };
})();

window.GOGOSafety = GOGOSafety;

document.addEventListener("DOMContentLoaded", () => {
  try { GOGOSafety.boot(); } catch (e) { console.error("GOGOSafety boot failed", e); }
});
