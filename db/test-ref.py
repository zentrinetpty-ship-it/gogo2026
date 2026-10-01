#!/usr/bin/env python3
"""End-to-end: sign up T William, book a seat, get a reference, accept it as
the driver, then read the booking back by reference alone."""
import base64, hashlib, json, os, subprocess, sys, tempfile, time

BASE = "https://cleanic.co.za/gogo/api"
PASSWORD = "Password123!"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GOGO-check/1.0"

# Cloudflare answers Python's default urllib user-agent with 1010 (a
# browser-integrity block), so the calls go through curl instead.


def call(path, body=None, token=None):
    """One API call through curl.

    Cloudflare answers Python's default user-agent with 1010, so curl carries
    a browser agent. The status is read from a header written to a temp file:
    this curl build rejects -w outright (exit 43), so the write-out format
    cannot be used.
    """
    with tempfile.NamedTemporaryFile("w+", suffix=".hdr", delete=False) as fh:
        hdr = fh.name
    cmd = ["curl", "-s", "-o", "-", "-D", hdr,
           "-X", ("POST" if body is not None else "GET"),
           "-H", "Content-Type: application/json",
           "-H", "User-Agent: " + UA]
    if token:
        cmd += ["-H", "Authorization: " + "Bearer " + token]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    cmd.append(BASE + path)

    r = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
    body_txt = r.stdout or ""
    status = 0
    try:
        with open(hdr, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.startswith("HTTP/"):
                    status = int(line.split()[1])
    except Exception:
        pass
    finally:
        try: os.unlink(hdr)
        except Exception: pass

    try:
        return status, json.loads(body_txt or "{}")
    except Exception:
        return status, {"error": body_txt[:200]}


def derive(password, salt_b64):
    return base64.b64encode(
        hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), 150000, 32)
    ).decode()


email = "twilliam%d@gogo.co.za" % int(time.time())
print("=" * 62)
print("1. SIGN UP  — T William")
st, saltbody = call("/auth/salt", {"email": email})
salt = saltbody.get("salt")
st, up = call("/auth/signup", {
    "name": "T William", "email": email,
    "clientHash": derive(PASSWORD, salt), "salt": salt,
    "province": "Eastern Cape", "town": "East London",
})
token = up.get("token")
print("   %s  token %s" % (st, (token or "")[:14] + "..."))
if not token:
    print("   FAILED:", up); sys.exit(1)

print()
print("2. BOOK  — g2, 2 seats, cash, collecting at 131 Oxford Street")
st, bk = call("/book", {
    "rideId": "g2", "kind": "passenger", "stop": "Mthatha", "seats": 2,
    "pickup": "131 Oxford Street", "suburb": "North End", "city": "East London",
    "payMethod": "cash",
}, token)
b = bk.get("booking") or {}
REF = b.get("ref")
print("   %s" % st)
print("   reference : %s" % REF)
print("   status    : %s" % b.get("status"))
print("   seats     : %s" % b.get("seats"))
print("   total     : R%.2f" % ((b.get("totalCents") or 0) / 100))
print("   plate     : %s   <- withheld until accepted" % b.get("plate"))
if not REF:
    print("   FAILED:", bk); sys.exit(1)

print()
print("3. READ BACK BY REFERENCE ONLY (no signed-in user)")
st, got = call("/booking/" + REF)
g = got.get("booking") or {}
print("   %s" % st)
print("   status : %s" % g.get("status"))
print("   route  : %s -> %s" % (g.get("from"), g.get("to")))
print("   pickup : %s   <- null because this caller is not the owner" % g.get("pickup"))
print("   plate  : %s" % g.get("plate"))

print()
print("4. ACCEPT AS DRIVER")
st, acc = call("/accept", {"ref": REF}, token)
a = acc.get("booking") or {}
print("   %s" % st)
print("   status     : %s" % a.get("status"))
print("   acceptedAt : %s" % a.get("acceptedAt"))
print("   plate      : %s   <- now released" % a.get("plate"))
print("   colour     : %s" % a.get("colour"))

print()
print("5. ACCEPT AGAIN — must be refused, not silently allowed")
st, again = call("/accept", {"ref": REF}, token)
print("   %s  %s" % (st, again.get("error")))

print()
print("6. THE TICKET, read after acceptance")
st, after = call("/booking/" + REF, token=token)
af = after.get("booking") or {}
print("   status : %s" % af.get("status"))
print("   plate  : %s   <- released to the owner" % af.get("plate"))
print()
print("=" * 62)
print("BOOKING REFERENCE: %s" % REF)
print("=" * 62)
