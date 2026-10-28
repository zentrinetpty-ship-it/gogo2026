/**
 * GOGO — AUTHENTICATION
 *
 * Phone number is the identity. Signup and login are the same flow: enter a
 * number, receive a 6-digit code, enter it. If the number is new, an account is
 * created; if it exists, you are signed in. There are no passwords to forget and
 * no email to verify.
 *
 * ── WHY PHONE ONLY ────────────────────────────────────────────────────────
 * The old auth.html shipped a 31KB email/password client talking to routes that
 * did not exist on this server — it could never have worked. Rather than repair
 * a second identity system, there is now one: the phone number, which is also
 * what the driver needs to call a rider and what the rider needs to identify a
 * van. One identifier, used for login, contact and safety.
 *
 * ── WHAT THIS DOES NOT TRUST ──────────────────────────────────────────────
 * · The client never says who it is. Every authenticated request carries a token
 *   and the server resolves it. A user id in a request body is ignored.
 * · Codes are hashed in the store, never held in plaintext: a leaked data file
 *   does not let anyone sign in.
 * · Tokens are signed and expire. They are stored httpOnly where possible, so a
 *   script on the page cannot read them.
 *
 * ── TWILIO ────────────────────────────────────────────────────────────────
 * Configured by environment only:
 *     TWILIO_ACCOUNT_SID
 *     TWILIO_AUTH_TOKEN
 *     TWILIO_FROM_NUMBER      e.g. +27871234567  (must be an SMS-capable number)
 *
 * With no credentials the service runs in DEV MODE: the code is generated,
 * stored and returned in the API response so the flow is testable, and the
 * response is clearly marked `dev: true`. It NEVER pretends an SMS was sent.
 * A production deploy must set the three variables; `devMode()` surfaces into
 * /auth/config so the UI can warn instead of silently leaking codes.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const USERS = path.join(__dirname, "auth-users.json");
const OTPS = path.join(__dirname, "auth-otps.json");

/* ── tunables ─────────────────────────────────────────────────────────────── */
const CODE_TTL_MS = 5 * 60 * 1000;      // a code is good for five minutes
const MAX_ATTEMPTS = 5;                  // wrong guesses before the code dies
const RESEND_COOLDOWN_MS = 30 * 1000;    // one request per 30s per number
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // a session lasts 30 days
const MAX_PER_HOUR = 6;                  // hard ceiling per number per hour

/* ── the secret is per-install, generated once ─────────────────────────────
   Tokens must survive a restart or every user is signed out whenever the
   process is redeployed. The secret lives beside the data, not in source. */
const SECRET_FILE = path.join(__dirname, "auth-secret");
function secret() {
  try {
    return fs.readFileSync(SECRET_FILE);
  } catch (e) {
    const s = crypto.randomBytes(48);
    try { fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 }); } catch (_) {}
    return s;
  }
}
let SECRET = null;
function getSecret() {
  if (!SECRET) SECRET = secret();
  return SECRET;
}

/* ── tiny json stores ─────────────────────────────────────────────────────
   Deliberately not a database. This is a few thousand riders at most, and a
   file that can be read with cat is worth more operationally than a schema. */
function read(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}
function write(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/* ── phone normalisation ───────────────────────────────────────────────────
   Store one canonical form and compare only that. Accepting several shapes is
   how "no account for that number" bugs happen: the signup writes 082… and the
   lookup reads 2782…, finds nothing, and creates a duplicate account.

   South African numbers, because that is the corridor:
       082 555 1234   -> 27825551234
       +27 82 555 1234 -> 27825551234
       27825551234     -> 27825551234
   Non-SA international numbers keep their country code. */
function normalisePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;

  let n = digits;
  if (n.startsWith("0027")) n = n.slice(2);
  if (n.startsWith("27")) {
    /* already international */
  } else if (n.startsWith("0") && n.length === 10) {
    n = "27" + n.slice(1);
  } else if (n.length === 9) {
    n = "27" + n;
  }
  /* SA mobile numbers are 27 + 9 digits = 11 total. Landlines can differ, but a
     sign-in identity that is not a reachable mobile is useless, so require it. */
  if (n.startsWith("27") && n.length !== 11) return null;
  if (n.length < 10 || n.length > 15) return null;
  return n;
}

/** How a number is shown back to its owner: 082 555 1234 */
function prettyPhone(n) {
  if (!n) return "";
  if (n.startsWith("27") && n.length === 11) {
    const r = n.slice(2);
    return "0" + r.slice(0, 2) + " " + r.slice(2, 5) + " " + r.slice(5);
  }
  return "+" + n;
}

/* ── codes ────────────────────────────────────────────────────────────────── */
function hashCode(code, phone) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(String(code) + "|" + phone)
    .digest("hex");
}

function newCode() {
  /* randomInt is uniform; Math.random is not, and a predictable code is a
     bypass. Six digits, so 1e6 space — combined with the attempt cap and TTL
     that is enough for an SMS code. */
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

/* ── tokens ───────────────────────────────────────────────────────────────
   A signed blob, not a JWT library: `base64(payload).hmac`. Small, no
   dependency, and the only property needed is "cannot be forged". */
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return body + "." + mac;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i);
  const mac = token.slice(i + 1);
  const want = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  /* timingSafeEqual throws on length mismatch, so compare guarded */
  const a = Buffer.from(mac);
  const b = Buffer.from(want);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch (e) {
    return null;
  }
  if (!p || !p.sub || !p.exp) return null;
  if (Date.now() > p.exp) return null;
  return p;
}

/* ── store helpers ────────────────────────────────────────────────────────── */
function loadUsers() { return read(USERS, { users: [] }); }
function saveUsers(d) { write(USERS, d); }
function loadOtps() { return read(OTPS, { otps: {} }); }
function saveOtps(d) { write(OTPS, d); }

function findUser(phone) {
  return loadUsers().users.find((u) => u.phone === phone) || null;
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    phone: u.phone,
    phonePretty: prettyPhone(u.phone),
    name: u.name || "",
    home: u.home || "",
    onboarded: !!(u.name && u.home),
    createdAt: u.createdAt,
  };
}

/* ── rate limiting ────────────────────────────────────────────────────────
   Two windows: a 30s cooldown between sends, and an hourly ceiling. Both are
   per NUMBER, because the abuse case is SMS bombing one person, not many. */
function checkRate(phone) {
  const db = loadOtps();
  const rec = db.otps[phone];
  const now = Date.now();

  if (rec) {
    const since = now - (rec.lastSentAt || 0);
    if (since < RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        waitMs: RESEND_COOLDOWN_MS - since,
        reason: "cooldown",
      };
    }
    const hour = (rec.sendLog || []).filter((t) => now - t < 3600000);
    if (hour.length >= MAX_PER_HOUR) {
      return {
        ok: false,
        waitMs: 3600000 - (now - hour[0]),
        reason: "hourly_limit",
      };
    }
  }
  return { ok: true };
}

/* ── Twilio sender ────────────────────────────────────────────────────────
   The REST API directly. Sending an SMS is one POST; a 90MB SDK for that is a
   supply-chain surface nobody needs. Credentials come from the environment and
   are read at call time, so a rotated token does not need a redeploy. */
function twilioConfigured() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  const url = "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(sid) + "/Messages.json";
  const form = new URLSearchParams({
    To: "+" + to,
    From: from,
    Body: body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(sid + ":" + auth).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json && json.message) || "twilio " + res.status;
    throw new Error(msg);
  }
  return { sid: json.sid, status: json.status };
}

/* ── config surfaced to the UI ────────────────────────────────────────────
   The page must be able to say "codes are shown because SMS is not connected",
   rather than silently displaying a code and looking broken. */
function devMode() {
  return !twilioConfigured();
}

function config() {
  return {
    devMode: devMode(),
    provider: twilioConfigured() ? "twilio" : "none",
    codeLength: 6,
    ttlSeconds: Math.round(CODE_TTL_MS / 1000),
    maxAttempts: MAX_ATTEMPTS,
    resendSeconds: Math.round(RESEND_COOLDOWN_MS / 1000),
  };
}

/* ── the flow ─────────────────────────────────────────────────────────────── */

/**
 * Step 1: ask for a code.
 * Creates nothing. An account only exists once a code is verified, so a
 * mistyped number never leaves an orphan record.
 */
async function requestCode(rawPhone) {
  const phone = normalisePhone(rawPhone);
  if (!phone) {
    return {
      ok: false,
      code: "invalid_phone",
      message: "That does not look like a mobile number. Try 082 555 1234.",
    };
  }

  const rate = checkRate(phone);
  if (!rate.ok) {
    const secs = Math.ceil(rate.waitMs / 1000);
    return {
      ok: false,
      code: rate.reason,
      retryAfter: secs,
      message:
        rate.reason === "cooldown"
          ? "A code was just sent. You can ask again in " + secs + " seconds."
          : "Too many codes requested for this number. Try again in " +
            Math.ceil(secs / 60) + " minutes.",
    };
  }

  const code = newCode();
  const now = Date.now();

  const db = loadOtps();
  const prev = db.otps[phone] || {};
  db.otps[phone] = {
    hash: hashCode(code, phone),
    createdAt: now,
    lastSentAt: now,
    attempts: 0,
    /* keep the send log for the hourly ceiling, trimmed to the last hour */
    sendLog: ((prev.sendLog || []).filter((t) => now - t < 3600000)).concat([now]),
  };
  saveOtps(db);

  const existing = findUser(phone);
  const body = existing
    ? "Your GOGO sign-in code is " + code + ". It expires in 5 minutes."
    : "Welcome to GOGO. Your sign-up code is " + code + ". It expires in 5 minutes.";

  if (twilioConfigured()) {
    try {
      await sendSms(phone, body);
      return {
        ok: true,
        phone,
        phonePretty: prettyPhone(phone),
        isNewUser: !existing,
        expiresInSeconds: Math.round(CODE_TTL_MS / 1000),
        dev: false,
      };
    } catch (e) {
      /* The code is already stored. If the send failed the user cannot get it,
         so drop the record rather than leaving a live code nobody received. */
      const clean = loadOtps();
      delete clean.otps[phone];
      saveOtps(clean);
      return {
        ok: false,
        code: "sms_failed",
        message: "We could not send the SMS just now. Please try again.",
        detail: String(e.message || e).slice(0, 160),
      };
    }
  }

  /* DEV MODE — no provider configured. Say so, and return the code so the flow
     can be tested. This must never be reachable on a live deployment. */
  return {
    ok: true,
    phone,
    phonePretty: prettyPhone(phone),
    isNewUser: !existing,
    expiresInSeconds: Math.round(CODE_TTL_MS / 1000),
    dev: true,
    devCode: code,
    message: "SMS is not connected yet, so your code is shown here.",
  };
}

/**
 * Step 2: check the code and issue a session.
 * On success the code is destroyed immediately — a used code must not be
 * reusable, which is the whole point of a one-time code.
 */
function verifyCode(rawPhone, rawCode) {
  const phone = normalisePhone(rawPhone);
  if (!phone) {
    return { ok: false, code: "invalid_phone", message: "That number is not valid." };
  }

  const digits = String(rawCode || "").replace(/\D/g, "");
  if (digits.length !== 6) {
    return {
      ok: false,
      code: "invalid_code",
      message: "Enter the six-digit code from the SMS.",
    };
  }

  const db = loadOtps();
  const rec = db.otps[phone];

  if (!rec) {
    return {
      ok: false,
      code: "no_code",
      message: "Request a new code — that one is no longer valid.",
    };
  }

  if (Date.now() - rec.createdAt > CODE_TTL_MS) {
    delete db.otps[phone];
    saveOtps(db);
    return {
      ok: false,
      code: "expired",
      message: "That code expired. Ask for a new one.",
    };
  }

  if (rec.attempts >= MAX_ATTEMPTS) {
    delete db.otps[phone];
    saveOtps(db);
    return {
      ok: false,
      code: "too_many_attempts",
      message: "Too many wrong codes. Ask for a new one.",
    };
  }

  const given = hashCode(digits, phone);
  const want = rec.hash;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    rec.attempts += 1;
    const left = MAX_ATTEMPTS - rec.attempts;
    if (rec.attempts >= MAX_ATTEMPTS) {
      delete db.otps[phone];
      saveOtps(db);
      return {
        ok: false,
        code: "too_many_attempts",
        message: "That code is now cancelled after " + MAX_ATTEMPTS + " wrong tries. Request a new one.",
      };
    }
    saveOtps(db);
    return {
      ok: false,
      code: "wrong_code",
      attemptsLeft: left,
      message:
        "That code is not right. You have " +
        left +
        (left === 1 ? " try" : " tries") +
        " left.",
    };
  }

  /* correct: burn the code */
  delete db.otps[phone];
  saveOtps(db);

  const users = loadUsers();
  let user = users.users.find((u) => u.phone === phone);
  let created = false;

  if (!user) {
    user = {
      id: crypto.randomUUID(),
      phone,
      name: "",
      home: "",
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    users.users.push(user);
    created = true;
  } else {
    user.lastLoginAt = new Date().toISOString();
  }
  saveUsers(users);

  const token = signToken({
    sub: user.id,
    phone: user.phone,
    exp: Date.now() + TOKEN_TTL_MS,
    iat: Date.now(),
  });

  return {
    ok: true,
    created,
    token,
    expiresAt: Date.now() + TOKEN_TTL_MS,
    user: publicUser(user),
    needsProfile: !user.name || !user.home,
  };
}

/** Resolve a token to a user. Returns null for anything invalid. */
function userFromToken(token) {
  const p = verifyToken(token);
  if (!p) return null;
  const users = loadUsers();
  const u = users.users.find((x) => x.id === p.sub);
  if (!u) return null;
  /* the token must still match the account's number: if the number on the
     account changed, an old token must not keep working */
  if (u.phone !== p.phone) return null;
  return u;
}

/** Complete the profile. This is how a signup becomes a usable account. */
function setProfile(token, { name, home }) {
  const u = userFromToken(token);
  if (!u) return { ok: false, code: "not_signed_in", message: "Please sign in again." };

  const n = String(name || "").trim().slice(0, 60);
  const h = String(home || "").trim().slice(0, 60);

  if (n.length < 2) {
    return { ok: false, code: "bad_name", message: "Enter your name so the driver knows who to look for." };
  }
  if (h.length < 2) {
    return { ok: false, code: "bad_home", message: "Choose the town you travel from most." };
  }

  const users = loadUsers();
  const rec = users.users.find((x) => x.id === u.id);
  rec.name = n;
  rec.home = h;
  saveUsers(users);

  return { ok: true, user: publicUser(rec) };
}

module.exports = {
  config,
  devMode,
  normalisePhone,
  prettyPhone,
  requestCode,
  verifyCode,
  userFromToken,
  setProfile,
  publicUser,
  findUser,
  loadUsers,
  /* exposed for tests */
  _hashCode: hashCode,
  _signToken: signToken,
  _verifyToken: verifyToken,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
};
