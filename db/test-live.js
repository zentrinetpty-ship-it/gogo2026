/* The same suite, but against the PUBLIC domain, to prove the whole path. */
const https = require("https");
const crypto = require("crypto");
const API = "/gogo/api";

function call(path, { method = "GET", body, token } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    const req = https.request({ host: "cleanic.co.za", path: API + path, method, headers },
      (r) => { let b = ""; r.on("data", c => b += c); r.on("end", () => {
        let j = {}; try { j = JSON.parse(b || "{}"); } catch (e) {}
        resolve({ status: r.statusCode, body: j });
      }); });
    req.on("error", (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) req.write(data);
    req.end();
  });
}
const derive = (pw, saltB64) =>
  crypto.pbkdf2Sync(pw, Buffer.from(saltB64, "base64"), 150000, 32, "sha256").toString("base64");

(async () => {
  const L = console.log;
  const stamp = Date.now();
  L("\n=== LIVE through https://cleanic.co.za ===\n");

  L("health:      " + JSON.stringify((await call("/health")).body));

  /* signup */
  const email = "live" + stamp + "@test.local";
  const s1 = await call("/auth/salt", { method: "POST", body: { email } });
  const reg = await call("/auth/signup", { method: "POST", body: {
    email, name: "Live Tester", salt: s1.body.salt,
    clientHash: derive("Password123!", s1.body.salt) } });
  L("signup:      " + reg.status + "  " + (reg.body.token ? "token issued" : JSON.stringify(reg.body)));
  const tok = reg.body.token;

  /* login */
  const s2 = await call("/auth/salt", { method: "POST", body: { email } });
  const li = await call("/auth/login", { method: "POST", body: {
    email, clientHash: derive("Password123!", s2.body.salt) } });
  L("login:       " + li.status + "  " + (li.body.token ? "token issued" : JSON.stringify(li.body)));

  /* wrong password */
  const s3 = await call("/auth/salt", { method: "POST", body: { email } });
  const bad = await call("/auth/login", { method: "POST", body: {
    email, clientHash: derive("Nope!", s3.body.salt) } });
  L("bad password:" + bad.status + "  " + JSON.stringify(bad.body));

  /* anonymous booking */
  const anon = await call("/book", { method: "POST", body: { rideId: "g1", stop: "Mthatha", seats: 1 } });
  L("no token:    " + anon.status + "  " + JSON.stringify(anon.body));

  /* quote */
  const q = await call("/quote", { method: "POST", body: { rideId: "g1", stop: "Butterworth", seats: 2 } });
  L("quote 2 seats: R" + (q.body.totalCents / 100).toFixed(2) + "  (rows: " +
    q.body.rows.map(r => r.label + " R" + (r.cents/100).toFixed(2)).join(", ") + ")");

  /* honest booking */
  const ok = await call("/book", { method: "POST", token: tok, body: {
    rideId: "g1", stop: "Butterworth", seats: 2, pickup: "131 Oxford Street",
    city: "East London", clientTotalCents: q.body.totalCents } });
  L("honest book: " + ok.status + "  " + (ok.status === 201
    ? "BOOKED R" + (ok.body.booking.totalCents / 100).toFixed(2) + "  plate not sent: " + (ok.body.booking.plate === undefined)
    : JSON.stringify(ok.body)));

  /* tampered */
  const tp = await call("/book", { method: "POST", token: tok, body: {
    rideId: "g1", stop: "Butterworth", seats: 2, clientTotalCents: 1 } });
  L("tampered:    " + tp.status + "  " + JSON.stringify(tp.body));

  /* my bookings show the real ones */
  const mine = await call("/bookings", { token: tok });
  L("my bookings: " + mine.body.bookings.length + "  (plate withheld: " +
    mine.body.bookings.every(b => b.plate === null || b.plate === undefined) + ")");
  L("");
})();
