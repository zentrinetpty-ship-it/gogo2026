/* =========================================================================
   GOGO — BOOKING GATE (client side)

   The browser no longer decides what a seat costs. It asks the server, shows
   what the server says, and books through the server. If the server refuses,
   the booking does not happen — there is no local fallback that would let a
   tampered price through.

   Offline is handled honestly: if the booking server cannot be reached, the
   request is NOT silently written locally as if it succeeded. The rider is
   told the booking did not go through, because a booking that exists only in
   the browser is not a booking.
   ========================================================================= */

window.GOGOBook = (function () {
  const API = "/api";
  const TIMEOUT = 9000;

  /* the last catalogue we were given, so the UI can render without inventing */
  let catalogue = null;

  function ask(path, body) {
    return new Promise((resolve) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), TIMEOUT);
      fetch(API + path, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      })
        .then((r) => r.json().then((j) => ({ status: r.status, body: j })))
        .then((out) => { clearTimeout(t); resolve(out); })
        .catch(() => { clearTimeout(t); resolve({ status: 0, body: { error: "unreachable" } }); });
    });
  }

  /* ── the catalogue: real rides, with the fares the server will charge ──── */
  function rides() {
    return ask("/rides").then((out) => {
      if (out.status === 200 && out.body.rides) {
        catalogue = out.body.rides;
        return catalogue;
      }
      return null;
    });
  }

  /* ── what the server would charge. The UI must show THIS, not its own
     arithmetic, or the rider sees one price and is charged another. ─────── */
  function quote(opts) {
    return ask("/quote", opts).then((out) => {
      if (out.status === 200) return out.body;
      return { error: (out.body && out.body.error) || "quote failed" };
    });
  }

  /* ── book. The server prices it and decides. The returned booking carries
     the server's total, which is the only total that counts. ───────────── */
  function book(opts) {
    return ask("/book", opts).then((out) => {
      if (out.status === 201 && out.body.booking) {
        return { ok: true, booking: out.body.booking };
      }
      /* a mismatch means the page and the server disagreed. Surface the
         server's number so the rider is never left with a stale price. */
      return {
        ok: false,
        error: (out.body && out.body.error) || "booking failed",
        serverTotalCents: out.body && out.body.serverTotalCents,
        unreachable: out.status === 0,
      };
    });
  }

  function myBookings() {
    return ask("/bookings").then((out) => {
      if (out.status === 200 && out.body.bookings) return out.body.bookings;
      return [];
    });
  }

  return { rides, quote, book, myBookings, catalogue: () => catalogue };
})();
