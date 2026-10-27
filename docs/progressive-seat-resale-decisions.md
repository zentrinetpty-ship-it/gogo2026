# Progressive Seat Resale — decisions locked

Supersedes the open questions in `progressive-seat-resale.md`. Four answers given by
the owner, and each one changes the design in a way worth writing down, because two
of them remove complexity and two add real risk that has to be engineered around.

---

## 1. Price is negotiated in chat, not computed

**Decision:** the passenger and driver agree the price between themselves for a
mid-route pickup.

**What this removes:** the whole per-km pricing model. No `priceLeg()`, no fill
discount, no defensible-rate argument. That was the most fiddly part of the plan and
it is gone.

**What it adds:** the price becomes a *negotiated value stored on the booking*, and
the platform can no longer claim the fare is its own. Three consequences:

- The booking needs `fareSource: "negotiated"` and `agreedCents`, distinct from the
  server-priced `totalCents`. They are different numbers with different provenance
  and must not be stored in one field, or a dispute has no evidence.
- The service fee is added **on top of the agreed price**, not taken out of it. The
  driver agreed a number with the rider; silently deducting the fee from it would
  break that agreement.
- The chat record is the contract. If a rider says "you said R150" and the driver
  says "R200", the thread is the evidence. It must be server-stored and not
  deletable by either party.

**The risk this creates:** negotiating off-platform then disputing. Mitigated by
storing the agreed figure on the booking at the moment both sides accept, not by
trusting the conversation alone.

---

## 2. Sell before departure — with agreement, not assumption

**Decision:** sell mid-route seats *before* the ride leaves, and let passenger and
driver agree in chat beforehand.

This is the money-making choice and it is the right one, but it makes the dangerous
case from the original plan (§6 #1) the *normal* path rather than an edge case. Every
mid-route seat is now sold on a promise.

**Therefore the chat is not a convenience feature, it is the control.** The sequence
has to be:

```
rider finds a van passing their town
  → opens chat with that driver
  → they agree a price and a boarding point
  → driver taps ACCEPT on that specific booking
  → booking becomes confirmed, fee is charged
```

Nothing is confirmed until the driver explicitly accepts **that** booking. A general
"yes I'll stop" in chat is not an acceptance, because it does not bind to a seat.
The accept button carries the booking id.

**What happens if the rider is not there.** The plan's alight-reconfirmation idea
inverts: now the risk is a *boarding* no-show, so the driver needs a one-tap "not
here, move on" that cancels without penalty and frees the seat for anyone else on
the route. That must be as easy as accepting, or drivers will just stop using it.

**Deposit question (see open items).** Selling before departure means a no-show costs
the driver real money in an empty seat. Whether to hold a deposit is the one thing
still undecided.

---

## 3. The driver sets the boarding point

**Decision:** driver defines where in each town he picks up.

**Why this is the right call:** the driver knows which corners a Quantum can reach
and where it is safe to stop. A platform-chosen point on a street he cannot enter is
worse than no point at all.

**What it needs to be safe:**

- Set **once per town**, saved on the driver's profile, reused on every trip. Not
  re-entered per booking, or he will type "town" and the rider is stranded.
- Shown to the rider **with a map pin and a landmark** ("opposite Spar, Cathcart
  Road"), not just a street name.
- Editable, with the old value kept if a trip already sold against it, so an edit
  does not retroactively move a booking that has already been agreed.
- Confirmed in chat as part of acceptance, so the rider has the point in writing.

---

## 4. Driver keeps the fare; GOGO takes R9.99

**Decision:** the negotiated price is the driver's. GOGO charges a flat **R9.99
booking fee**.

**This is a clean model and it is worth stating precisely** because the fee has to be
charged exactly once and attributed correctly:

| party | gets | from |
|---|---|---|
| driver | the full agreed price | rider, cash or card |
| GOGO | R9.99 per mid-route seat | rider, at acceptance |

Rules that follow:

- **R9.99 is charged on acceptance, and refunded if the driver cancels** the stop.
  A driver who accepts then changes his mind must not cost the rider money.
- If the **rider** no-shows after accepting, the fee is **not** refunded. That is
  what makes the accept button meaningful; otherwise a rider can block a seat for
  free.
- The fee is a **constant**, not a percentage of the negotiated fare, so it cannot be
  gamed by inflating the agreed price.
- It is **separate from** the existing platform fee on full-route bookings. Those are
  server-priced and unchanged; this is the mid-route product.

**Why a flat R9.99 is better than a percentage here:** the fare is negotiated, so a
percentage would let two parties agree a huge number and split it while the platform
carries the risk. A flat fee is honest, predictable, and easy to explain to a driver.

---

## What this changes in the build order

The original six steps were priced around computing fares. They become:

1. **Interval occupancy** (`aboardPerLeg`, `canBook`) — unchanged, still first, and
   still fixes the live capacity bug where cancelling enlarges the van.
2. **Negotiated booking record** — `agreedCents`, `fareSource`, `boardPoint`,
   `driverAcceptedAt`. No pricing maths.
3. **Driver ↔ rider chat bound to a booking** — reuses the existing ride chat, but
   the thread must be openable *before* a booking exists, keyed to
   (rideId, boardTown, riderSession).
4. **Accept / decline on the booking** — the only thing that confirms. Charge R9.99
   on accept.
5. **Boarding points per driver per town** — set once, editable, pinned to a landmark.
6. **Driver "not here, move on"** — one tap, cancels without penalty, frees the seat.

Steps 1–4 are the product. 5 and 6 are what stop it from being a support burden.

---

## Still open

1. **Deposit or no deposit.** Selling before departure means a rider no-show leaves
   the driver with an empty seat he turned nobody else away for. Options: no deposit
   (trust, simplest), a small refundable hold, or the R9.99 acts as the only stake
   (my recommendation: start here, add a hold only if no-shows are common).
2. **Does the driver see the rider's phone number** once accepted? The existing model
   hides numbers until a seat is confirmed. Mid-route is a confirmed seat, so the
   current rule would reveal them. Worth an explicit decision rather than inheriting
   it.
3. **What happens to the R9.99 if the ride is cancelled entirely** (van breaks down)?
   Refund to the rider, and GOGO absorbs it.
