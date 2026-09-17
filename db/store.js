/* =========================================================================
   GOGO — STORE

   File-backed storage in the same shape as the HQ mailer's, which is the
   pattern that actually runs reliably on this machine: no database server,
   no WSL, no port forward, no network hop. The Node process owns the files.

   Two things this gets right that a naive JSON store does not:

   1. ATOMIC WRITES. Every save goes to a temp file and is then renamed over
      the target. rename() is atomic on both Windows and Linux, so a crash or
      a power cut can never leave a half-written file — you get either the old
      contents or the new ones, never a truncated mess.

   2. SERIALISED MUTATIONS. Any operation that reads-then-writes (claiming a
      seat, creating a booking) runs inside mutate(), which is synchronous
      from read to write. Node is single-threaded, so no second request can
      interleave inside that block. That is what stops two riders taking the
      same last seat — the equivalent of Postgres' SELECT ... FOR UPDATE.

   Writes are queued and flushed shortly after a change rather than on every
   single mutation, so a busy moment does not hammer the disk.
   ========================================================================= */

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data");
const FILES = {
  users:     path.join(DIR, "users.json"),
  sessions:  path.join(DIR, "sessions.json"),
  rides:     path.join(DIR, "rides.json"),
  bookings:  path.join(DIR, "bookings.json"),
  payments:  path.join(DIR, "payments.json"),
  messages:  path.join(DIR, "messages.json"),
  reports:   path.join(DIR, "reports.json"),
  audit:     path.join(DIR, "audit.json"),
};

/* ── the in-memory copy ─────────────────────────────────────────────────── */
/* Loaded once at boot and treated as the truth. The files are the durable
   copy of it, not something we re-read on every request. */
const db = {
  users: [], sessions: [], rides: [], bookings: [],
  payments: [], messages: [], reports: [], audit: [],
};

function ensureDir() {
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {}
}

function load() {
  ensureDir();
  for (const key of Object.keys(FILES)) {
    try {
      const raw = fs.readFileSync(FILES[key], "utf8");
      const parsed = JSON.parse(raw || "[]");
      db[key] = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      db[key] = [];      /* missing or unreadable: start empty, never throw */
    }
  }
  /* expired sessions are dropped at boot so the file cannot grow forever */
  const now = Date.now();
  db.sessions = db.sessions.filter((s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now);
}

/* ── durable writes ─────────────────────────────────────────────────────── */
let dirty = new Set();
let flushTimer = null;

function flushNow() {
  for (const key of dirty) {
    const tmp = FILES[key] + ".tmp";
    try {
      fs.writeFileSync(tmp, JSON.stringify(db[key], null, 2));
      fs.renameSync(tmp, FILES[key]);        /* atomic */
    } catch (e) {
      console.error("[store] could not write " + key + ":", e.message);
    }
  }
  dirty = new Set();
  flushTimer = null;
}

/* Mark a collection changed. The write lands within 250ms, and always at
   process exit, so a clean shutdown never loses anything. */
function touch(key) {
  dirty.add(key);
  if (!flushTimer) flushTimer = setTimeout(flushNow, 250);
}

process.on("exit", () => { try { flushNow(); } catch (e) {} });
process.on("SIGINT", () => { flushNow(); process.exit(0); });
process.on("SIGTERM", () => { flushNow(); process.exit(0); });

/* ── the serialised mutation ────────────────────────────────────────────── */
/* fn runs to completion with no await inside it, so no other request can
   observe a half-applied change. It returns fn's return value, or throws
   with { code, message } to signal a refusal. */
function mutate(collections, fn) {
  const result = fn();          /* synchronous by contract */
  for (const c of collections) touch(c);
  return result;
}

/* ── ids ────────────────────────────────────────────────────────────────── */
const crypto = require("crypto");
const uuid = () => crypto.randomUUID();
const shortId = (prefix, n) => prefix + crypto.randomBytes(n || 6).toString("hex");

module.exports = { db, load, touch, flushNow, mutate, uuid, shortId, DIR, FILES };
