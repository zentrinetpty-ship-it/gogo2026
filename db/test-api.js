/* ═══════════════════════════════════════════════════════════════════════════
   The concurrency test.

   Two riders, one last seat, fired at exactly the same instant. Exactly one
   must win. If both succeed, the seat was double-sold and the store is broken.
   ═══════════════════════════════════════════════════════════════════════════ */

const http = require("http");
const crypto = require("crypto");

const HOST = "127.0.0.1", PORT = 3051;
const API = "/gogo/api";

function call(path, { method = "GET", body, token } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    const req = http.request({ host: HOST, port: PORT, path: API + path, method, headers },
      (r) => { let b = ""; r.on("data", c => b += c); r.on("end", () => {
        let j = {}; try { j = JSON.parse(b || "{}"); } catch (e) {}
        resolve({ status: r.statusCode, body: j });
      }); });
    req.on("error", (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) req.write(data);
    req.end();
  });
}

/* the client-side password derivation: PBKDF2 over the password with the
   salt the server hands out, so the plaintext never leaves here */
function derive(password, saltB64) {
  const salt = Buffer.from(saltB64, "base64");
  return crypto.pbkdf2Sync(password, salt, 150000, 32, "sha256").toString("base64");
}

async function signup(name, email, password) {
  const s = await call("/auth/salt", { method: "POST", body: { email } });
  const clientHash = derive(password, s.body.salt);
  const r = await call("/auth/signup", {
    method: "POST",
    body: { email, name, phone: "+27780000000", salt: s.body.salt, clientHash },
  });
  return r;
}

const line = (s) => console.log(s);

(async () => {
  line("");
  line("══ 1. ACCOUNTS ══════════════════════════════════════════════");

  const stamp = Date.now();
  const a = await signup("Rider A", "a" + stamp + "@test.local", "Password123!");
  const b = await signup("Rider B", "b" + stamp + "@test.local", "Password123!");
  line("   signup A: " + a.status + "  " + (a.body.user ? a.body.user.name : JSON.stringify(a.body)));
  line("   signup B: " + b.status + "  " + (b.body.user ? b.body.user.name : JSON.stringify(b.body)));
  const tokenA = a.body.token, tokenB = b.body.token;
  line("   tokens issued: " + (!!tokenA && !!tokenB));

  /* the same email again must be refused */
  const dup = await signup("Rider A", "a" + stamp + "@test.local", "Password123!");
  line("   duplicate email: " + dup.status + "  " + JSON.stringify(dup.body));

  line("");
  line("══ 2. LOGIN, AND WRONG PASSWORDS ════════════════════════════");
  const emailA = "a" + stamp + "@test.local";

  const s2 = await call("/auth/salt", { method: "POST", body: { email: emailA } });
  const good = await call("/auth/login", {
    method: "POST", body: { email: emailA, clientHash: derive("Password123!", s2.body.salt) },
  });
  line("   correct password: " + good.status + "  " + (good.body.token ? "token issued" : JSON.stringify(good.body)));

  const s3 = await call("/auth/salt", { method: "POST", body: { email: emailA } });
  const wrong = await call("/auth/login", {
    method: "POST", body: { email: emailA, clientHash: derive("WrongPassword!", s3.body.salt) },
  });
  line("   wrong password:   " + wrong.status + "  " + JSON.stringify(wrong.body));

  const noSuch = await call("/auth/salt", { method: "POST", body: { email: "nobody" + stamp + "@test.local" } });
  const ghost = await call("/auth/login", {
    method: "POST", body: { email: "nobody" + stamp + "@test.local", clientHash: derive("Password123!", noSuch.body.salt) },
  });
  line("   unknown account:  " + ghost.status + "  " + JSON.stringify(ghost.body));

  line("");
  line("══ 3. AUTH IS REQUIRED ══════════════════════════════════════");
  const anon = await call("/book", { method: "POST", body: { rideId: "g1", stop: "Mthatha", seats: 1 } });
  line("   booking with no token: " + anon.status + "  " + JSON.stringify(anon.body));
  const badTok = await call("/book", { method: "POST", token: "not-a-real-token-at-all-1234",
    body: { rideId: "g1", stop: "Mthatha", seats: 1 } });
  line("   booking with a fake token: " + badTok.status + "  " + JSON.stringify(badTok.body));

  line("");
  line("══ 4. PRICING, AND THE TAMPER GATE ══════════════════════════");
  const q = await call("/quote", { method: "POST", body: { rideId: "g1", stop: "Mthatha", seats: 1 } });
  line("   server quote: R" + (q.body.totalCents / 100).toFixed(2) +
       "  (fare " + (q.body.fareCents / 100).toFixed(2) +
       " + pickup " + (q.body.pickupCents / 100).toFixed(2) +
       " + platform " + (q.body.platformCents / 100).toFixed(2) + ")");
  const real = q.body.totalCents;

  const honest = await call("/book", { method: "POST", token: tokenA,
    body: { rideId: "g1", stop: "Mthatha", seats: 1, pickup: "131 Oxford Street",
            suburb: "North End", city: "East London", clientTotalCents: real } });
  line("   honest booking:   " + honest.status + "  " +
       (honest.status === 201 ? "BOOKED R" + (honest.body.booking.totalCents / 100).toFixed(2) : JSON.stringify(honest.body)));

  const tampered = await call("/book", { method: "POST", token: tokenB,
    body: { rideId: "g1", stop: "Mthatha", seats: 1, clientTotalCents: 0 } });
  line("   tampered to R0:   " + tampered.status + "  " + JSON.stringify(tampered.body));

  const fake = await call("/book", { method: "POST", token: tokenB,
    body: { rideId: "g1", stop: "FreeTown", seats: 1 } });
  line("   invented stop:    " + fake.status + "  " + JSON.stringify(fake.body));

  const many = await call("/book", { method: "POST", token: tokenB,
    body: { rideId: "g1", stop: "Mthatha", seats: 99 } });
  line("   99 seats:         " + many.status + "  " + JSON.stringify(many.body));

  line("");
  line("══ 5. THE LAST SEAT — TWO RIDERS AT ONCE ════════════════════");
  /* g2 has 3 seats. One is taken above? No — g1 was used. Book g2 down to its
     last seat, then fire two simultaneous claims at it. */
  const before = await call("/rides");
  const g2 = before.body.rides.find((r) => r.id === "g2");
  line("   g2: " + g2.seats + " seats, " + g2.taken + " taken, " + g2.left + " left");

  while (true) {
    const now = (await call("/rides")).body.rides.find((r) => r.id === "g2");
    if (now.left <= 1) break;
    const bk = await call("/book", { method: "POST", token: tokenA,
      body: { rideId: "g2", stop: "Mthatha", seats: 1 } });
    if (bk.status !== 201) { line("   could not fill: " + JSON.stringify(bk.body)); break; }
  }
  const state = (await call("/rides")).body.rides.find((r) => r.id === "g2");
  line("   now: " + state.left + " seat left — firing BOTH riders at it simultaneously");

  const [r1, r2] = await Promise.all([
    call("/book", { method: "POST", token: tokenA, body: { rideId: "g2", stop: "Mthatha", seats: 1 } }),
    call("/book", { method: "POST", token: tokenB, body: { rideId: "g2", stop: "Mthatha", seats: 1 } }),
  ]);
  const accepted = [r1, r2].filter((r) => r.status === 201).length;
  line("   rider A: " + r1.status + "   rider B: " + r2.status);
  line("   accepted: " + accepted + "  ->  " +
       (accepted === 1 ? "CORRECT. The last seat went to exactly one rider."
                       : "*** BROKEN: " + accepted + " bookings from 1 seat ***"));

  line("");
  line("══ 6. THE COMPANY'S OWN NUMBERS ═════════════════════════════");
  const mine = await call("/bookings", { token: tokenA });
  line("   rider A's bookings: " + mine.body.bookings.length);
  mine.body.bookings.slice(0, 3).forEach((bk) =>
    line("      " + bk.from + " → " + (bk.stop || bk.to) + "  R" + (bk.totalCents / 100).toFixed(2) +
         "  " + bk.status + "  plate=" + (bk.plate || "(withheld until accepted)")));

  const fin = await call("/health");
  line("");
  line("   store: " + JSON.stringify(fin.body));
  line("");
})();
