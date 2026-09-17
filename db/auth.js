/* =========================================================================
   GOGO — AUTH

   Passwords never travel. That is the whole design.

   The client derives PBKDF2-SHA256 over the password with a per-user random
   salt, and sends only the derived hash. The server then derives AGAIN over
   that value with a server-side pepper before storing it. Two consequences:

     1. The plaintext password never crosses the network, so a TLS-terminating
        proxy or a logged request body does not expose it.
     2. A stolen database is not enough to log in: an attacker also needs the
        pepper, which lives in the environment and never in the database.

   The cost of sending a derived hash instead of the password is that the hash
   becomes the credential — so login must re-derive client-side with the SAME
   salt, which the server hands out per-account. See login() below.
   ========================================================================= */

const crypto = require("crypto");

const ITER = 150000;
const KEYLEN = 32;
const DIGEST = "sha256";

/* The pepper. Read from the environment; there is a generated fallback so a
   fresh install works, but production must set GOGO_PEPPER or every stored
   hash is weaker than it looks. */
const PEPPER = process.env.GOGO_PEPPER || (() => {
  const f = require("path").join(__dirname, "..", ".gogo-pepper");
  const fs = require("fs");
  try { return fs.readFileSync(f, "utf8").trim(); }
  catch (e) {
    const p = crypto.randomBytes(32).toString("hex");
    try { fs.writeFileSync(f, p, { mode: 0o600 }); } catch (e2) {}
    console.warn("[auth] generated a pepper at " + f + " — set GOGO_PEPPER in production");
    return p;
  }
})();

/* ── password ──────────────────────────────────────────────────────────── */

/* What the client sends: { salt, clientHash } where clientHash is base64 of
   PBKDF2(password, salt, 150000). We derive once more over that. */
function serverHash(clientHash, salt) {
  return crypto
    .pbkdf2Sync(String(clientHash) + PEPPER, Buffer.from(salt, "base64"), 100000, KEYLEN, DIGEST)
    .toString("base64");
}

function verify(clientHash, salt, storedHash) {
  const want = Buffer.from(storedHash, "base64");
  const got = Buffer.from(serverHash(clientHash, salt), "base64");
  /* constant time: a length-varying or early-exit compare leaks the hash byte
     by byte to anyone who can time the response */
  if (want.length !== got.length) return false;
  return crypto.timingSafeEqual(want, got);
}

/* A fresh salt for a new account. */
function newSalt() {
  return crypto.randomBytes(16).toString("base64");
}

/* ── sessions ──────────────────────────────────────────────────────────── */

const SESSION_DAYS = 30;

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/* Only the hash is stored, so a database leak yields no usable session. */
function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token) + PEPPER).digest("hex");
}

/* ── validation ────────────────────────────────────────────────────────── */

function goodEmail(v) {
  const s = String(v || "").trim();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function isBase64ish(v, minLen, maxLen) {
  const s = String(v || "");
  return s.length >= minLen && s.length <= maxLen && /^[A-Za-z0-9+/=_-]+$/.test(s);
}

/* Everything the client sends for signup is checked here. A tampered client
   can send anything, so nothing is assumed to be well-formed. */
function checkSignup(b) {
  if (!b || typeof b !== "object") return "bad request";
  if (!goodEmail(b.email)) return "a valid email is required";
  if (String(b.name || "").trim().length < 2) return "a name is required";
  if (!isBase64ish(b.salt, 16, 64)) return "bad salt";
  if (!isBase64ish(b.clientHash, 20, 200)) return "bad password hash";
  if (String(b.phone || "").replace(/[^\d+]/g, "").length < 9 && b.phone) return "bad phone";
  return null;
}

module.exports = {
  ITER, PEPPER,
  newSalt, serverHash, verify,
  newToken, tokenHash, SESSION_DAYS,
  goodEmail, checkSignup,
};
