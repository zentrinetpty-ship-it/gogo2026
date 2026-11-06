/**
 * GOGO — face check proxy.
 *
 * WHY A PROXY AND NOT A DIRECT CALL FROM THE BROWSER
 *   The face core runs on 127.0.0.1:8092 on the server. A phone cannot reach
 *   that, and it must not: exposing a face detector publicly is an open door to
 *   anyone using our hardware. So the browser posts to our own API, and the API
 *   forwards to the core over loopback.
 *
 * WHY ONLY DETECTION, NOT IDENTIFICATION
 *   CompreFace can enrol named subjects and later say "this is the same person".
 *   GOGO does not do that and must not start: a template that identifies a rider
 *   is biometric data under POPIA, needs a far stronger legal basis, and turns a
 *   24-hour quality gate into a permanent face database. This endpoint answers
 *   exactly one question — is there one clear, frontal, unobstructed face in this
 *   photo — and stores nothing.
 *
 * WHAT IT REFUSES, AND WHY EACH REFUSAL MATTERS
 *   none       no face at all: a wall, a thumb over the lens, a dark frame.
 *   multiple   two or more faces: someone else in the shot, or a photo of a
 *              photo. A selfie is one person.
 *   small      a face but too little of it: the rider is far from the camera, so
 *              nobody could recognise them later. This is the case a plain
 *              "face found" check waves through and it is the one that makes the
 *              record worthless.
 *   offcentre  half the face out of frame, or turned away.
 *   low_conf   the detector is unsure, which usually means heavy blur or an
 *              extreme angle.
 */
"use strict";

const CORE = process.env.FACE_CORE_URL || "http://127.0.0.1:8092";

/* a selfie is one person at conversational distance. These are the numbers that
   decide whether the resulting record could actually identify someone. */
const RULES = {
  minProbability: 0.72,   // detector confidence in the face itself
  minFaceFraction: 0.055, // face box area as a share of the image
  maxFaceFraction: 0.92,  // tighter than this and it is a close-up of skin

  /* ══ FACING THE CAMERA ══════════════════════════════════════════════════════
     A detector will happily box a face that is turned away, tilted down, or
     cropped at the chin. Those photos have eyes, so a "is there a face" check
     passes them, and then nobody can recognise the person at the roadside.

     Two measured signals catch it:

     pose    yaw   = left/right turn. Beyond ~22 degrees one ear is hidden and the
                     photo stops being a likeness.
             pitch = up/down tilt. Beyond ~18 degrees the chin is foreshortened
                     against the neck and the jawline disappears.

     chin    the 5 landmark points end at the MOUTH CORNERS, so the detector's own
             box always extends below the lowest landmark by roughly the chin.
             Measured on a real frontal-ish photo: landmarks ended at y=351 in a
             box ending at y=417, i.e. 22% of the box height was chin. That is the
             healthy ratio. When the chin is cropped, cut off, or tilted away, the
             landmarks sit much closer to the bottom edge of the box - which is the
             "eyes but no chin" photo. */
  maxYaw: 22,
  maxPitch: 18,
  /* chinSpace = (boxBottom - lowestLandmarkY) / boxHeight. Below this, the chin
     is not really in the picture. */
  minChinSpace: 0.13,
  /* A detector reports a box that fits the face it found, so "inside the frame"
     is really about a box that runs off an EDGE — a rider half out of shot, or
     turned away. 0.55 let a third of someone's face be outside the picture and
     still pass, which is not a photo a driver could recognise at a roadside.
     0.92 means essentially the whole face must be visible. */
  minCentreOverlap: 0.92,
};

function fail(code, say, hint, extra) {
  return Object.assign({ ok: false, code, say, hint }, extra || {});
}

/**
 * Read a multipart body into { buffer, mime, filename } without a dependency.
 * The selfie is capped at 6MB; anything larger is refused before it is parsed.
 */
function readMultipart(req, limitBytes = 6 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Pull one file part out of a multipart/form-data body. */
function extractFile(raw, boundary) {
  const delim = Buffer.from("--" + boundary);
  let pos = raw.indexOf(delim);
  if (pos < 0) return null;

  while (pos >= 0 && pos < raw.length) {
    const next = raw.indexOf(delim, pos + delim.length);
    if (next < 0) break;
    const part = raw.slice(pos + delim.length, next);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd > 0) {
      const head = part.slice(0, headerEnd).toString("utf8");
      if (/name="file"/.test(head)) {
        const m = /filename="([^"]*)"/.exec(head);
        const t = /Content-Type:\s*([^\r\n]+)/i.exec(head);
        return {
          data: part.slice(headerEnd + 4, part.length - 2),
          mime: t ? t[1].trim() : "application/octet-stream",
          filename: m ? m[1] : "selfie.jpg",
        };
      }
    }
    pos = next;
  }
  return null;
}

/** Ask the core where the faces are. */
async function detect(imageBuffer, mime, filename) {
  const form = new FormData();
  form.append("file", new Blob([imageBuffer], { type: mime }), filename);

  /* a hard timeout: a detector that hangs must not hang the rider's form */
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    /* landmarks and pose are what let us tell "a face with eyes" from "a whole
       face looking at the camera". Without them the detector happily returns a
       box for somebody turned away and looking down. */
    const res = await fetch(CORE + "/find_faces?det_prob_threshold=0.5&limit=0&face_plugins=landmarks,pose", {
      method: "POST",
      body: form,
      signal: ctl.signal,
    });
    const text = await res.text();

    /* CompreFace answers 400 with a message when it finds nothing, which is a
       normal outcome and not an error of ours. */
    if (!res.ok) {
      if (/No face is found/i.test(text)) return [];
      throw new Error("detector said " + res.status + ": " + text.slice(0, 160));
    }
    const json = JSON.parse(text);
    return (json && json.result) || [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Judge the detection against the selfie rules.
 * `imgW`/`imgH` are needed to know how much of the frame the face fills.
 */
function judge(faces, imgW, imgH) {
  if (!faces.length) {
    return fail(
      "none",
      "We could not find a face in that photo",
      "Face the camera straight on, take off hats or sunglasses, and make sure your whole face is in the frame."
    );
  }

  if (faces.length > 1) {
    return fail(
      "multiple",
      "There is more than one face in that photo",
      "A safety selfie is just you. Take it somewhere without anyone else in the shot."
    );
  }

  const f = faces[0];
  const box = f.box || {};
  const prob = Number(box.probability || 0);

  if (prob < RULES.minProbability) {
    return fail(
      "low_conf",
      "We cannot see you clearly enough",
      "Hold still, wipe the lens if it is smudged, and take it again in better light.",
      { confidence: prob }
    );
  }

  const w = Math.max(0, Number(box.x_max || 0) - Number(box.x_min || 0));
  const h = Math.max(0, Number(box.y_max || 0) - Number(box.y_min || 0));
  const frac = imgW && imgH ? (w * h) / (imgW * imgH) : 0;

  if (frac > RULES.maxFaceFraction) {
    return fail(
      "tooclose",
      "You are too close to the camera",
      "Hold the phone at arm's length so your whole face and a little of your shoulders are in the shot.",
      { faceFraction: +frac.toFixed(3) }
    );
  }

  if (frac && frac < RULES.minFaceFraction) {
    return fail(
      "small",
      "You are too far from the camera",
      "Come closer so your face fills more of the photo. A driver needs to recognise you at the roadside.",
      { faceFraction: +frac.toFixed(3) }
    );
  }

  /* how much of the face box actually sits inside the picture */
  const insideW = Math.max(0, Math.min(Number(box.x_max || 0), imgW) - Math.max(Number(box.x_min || 0), 0));
  const insideH = Math.max(0, Math.min(Number(box.y_max || 0), imgH) - Math.max(Number(box.y_min || 0), 0));
  const inside = w && h ? (insideW * insideH) / (w * h) : 1;

  if (w && h && inside < RULES.minCentreOverlap) {
    return fail(
      "offcentre",
      "Part of your face is out of the frame",
      "Centre yourself in the picture and keep the whole of your face and chin inside it.",
      { insideFrame: +inside.toFixed(2) }
    );
  }

  /* ── is the person actually FACING the camera, chin included? ─────────────
     Everything above only proved a face exists. These three prove it is usable
     as a likeness: turned straight on, not tilted, and with the chin in frame. */

  const pose = f.pose || null;
  if (pose) {
    const yaw = Math.abs(Number(pose.yaw) || 0);
    const pitch = Math.abs(Number(pose.pitch) || 0);

    if (yaw > RULES.maxYaw) {
      return fail(
        "turned",
        "Look straight at the camera",
        "Turn to face the phone directly — we can only see one side of your face from there.",
        { yaw: +yaw.toFixed(1) }
      );
    }

    if (pitch > RULES.maxPitch) {
      return fail(
        "tilted",
        Number(pose.pitch) < 0 ? "Lift your head" : "Bring your chin down",
        Number(pose.pitch) < 0
          ? "Raise your chin a little so the camera sees your whole face."
          : "Lower your chin slightly, you are looking up.",
        { pitch: +Number(pose.pitch).toFixed(1) }
      );
    }
  }

  /* the chin: the landmarks end at the mouth corners, so a healthy frontal photo
     always has clear box below the lowest one. If there is not, the chin is cut
     off by the frame or foreshortened by the tilt. */
  const lm = f.landmarks;
  if (Array.isArray(lm) && lm.length && h) {
    const lowestY = Math.max.apply(null, lm.map(p => Number(p[1]) || 0));
    const chinSpace = (Number(box.y_max || 0) - lowestY) / h;

    if (chinSpace < RULES.minChinSpace) {
      return fail(
        "nochin",
        "We cannot see your chin",
        "Tilt the phone down a little, or step back, so your whole face from forehead to chin is in the frame.",
        { chinSpace: +chinSpace.toFixed(3) }
      );
    }
  }

  return {
    ok: true,
    face: {
      box,
      probability: prob,
      faceFraction: +frac.toFixed(3),
      yaw: pose ? +Number(pose.yaw).toFixed(1) : null,
      pitch: pose ? +Number(pose.pitch).toFixed(1) : null,
    },
    say: "Clear photo",
  };
}

/**
 * Handle POST /api/selfie/check
 * Body: multipart/form-data with a `file` field. `w` and `h` are the ORIGINAL
 * image dimensions, sent because the browser may have downscaled before upload.
 */
async function checkSelfie(req, res, json) {
  const ctype = String(req.headers["content-type"] || "");
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ctype);
  if (!m) return json(res, 400, { ok: false, code: "bad_request", say: "Send the photo as form data." });

  let raw;
  try {
    raw = await readMultipart(req);
  } catch (e) {
    return json(res, 413, { ok: false, code: "too_large", say: "That photo is too big. Try again." });
  }

  const file = extractFile(raw, m[1] || m[2]);
  if (!file) return json(res, 400, { ok: false, code: "bad_request", say: "No photo was attached." });
  if (!/^image\//.test(file.mime)) {
    return json(res, 400, { ok: false, code: "bad_request", say: "That file is not an image." });
  }

  const q = new URL(req.url, "http://x").searchParams;
  const imgW = Number(q.get("w")) || 0;
  const imgH = Number(q.get("h")) || 0;

  let faces;
  try {
    faces = await detect(file.data, file.mime, file.filename);
  } catch (e) {
    /* the detector being down is OUR fault, and must never be reported as a bad
       photo. The rider would keep retaking a perfectly good selfie. */
    console.error("selfie check failed:", e.message);
    return json(res, 503, {
      ok: false,
      code: "unavailable",
      say: "We could not check that photo just now",
      hint: "This is on us, not your photo. Try again in a moment.",
    });
  }

  const verdict = judge(faces, imgW, imgH);
  return json(res, 200, verdict);
}

module.exports = { checkSelfie, judge, RULES };
