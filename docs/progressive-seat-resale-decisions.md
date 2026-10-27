# Progressive Seat Resale — decisions locked (v2)

Supersedes `progressive-seat-resale-decisions.md`. Seven decisions now, and the
last four change the payment model enough that the earlier "R9.99 on accept" flow is
dead. Rewriting rather than appending, because a stale section that contradicts a
newer one is worse than no document.

---

## The flow, end to end

```
1. Rider standing in Komani searches for vans passing through toward Mthatha.
2. Sees a van that left East London at 06:30 and reaches Komani ~07:40.
3. Opens chat. They negotiate the fare between themselves.
4. Rider taps "REQUEST SEAT" on that van, naming the boarding point the driver set.
5. Rider pays a R50 no-show deposit and the R9.99 booking fee. Booking = PENDING.
6. Driver sees the request, sees the rider's number, and can call if needed.
7. Driver taps ACCEPT or DECLINE.
8. On ACCEPT -> booking becomes CONFIRMED. The agreed fare is paid to the DRIVER
   in cash or card at the point of boarding, not through GOGO.
9. Rider boards. At the town, the van stops at the driver's boarding point.
10. Fare settled. Deposit is returned (or applied to the fare, rider's choice).
```

**Nothing is sold until the driver accepts. Nothing is paid in full until boarding.**
The deposit is the only money that moves before the van arrives, and it exists solely
to make a request mean something.

---

## 1. Seats are intervals, not numbers

Unchanged from the original plan and still the foundation. Occupancy is computed per
leg, and a booking is checked only across the legs it touches.

```
Passenger A: East London → Komani   (legs 0)
Passenger B: Komani  → Mthatha      (legs 1,2,3)
```

Valid, because they overlap in time but not in space.

---

## 2. Price is negotiated in chat

The rider and driver agree a number. The platform does not price a mid-route seat.

- Stored as `agreedCents` with `fareSource: "negotiated"`, separate from any
  server-priced total. Two numbers, two provenances, or a dispute has no evidence.
- **The chat thread is the contract.** Server-stored, not deletable by either party.
- GOGO's fee is added **on top**, never deducted from the agreed price.

---

## 3. Sell before departure, as a request the driver controls

This is the decision that makes the whole thing safe, and it is better than the
previous version:

**The booking is PENDING until the driver accepts.** A rider can request a seat
before the van even leaves East London, but nothing is guaranteed and no seat is
withheld from the driver's own judgement until he says yes.

Why this is the right shape:

- The driver is the only person who knows if he can actually stop at that town today
  (roadworks, a full boot, running late). A pending request lets him decide with
  facts, not a system that sold a seat on his behalf.
- A pending request cannot be double-sold. The interval is *held* against the
  request, but the driver sees how many holds exist so he can decline ones he cannot
  serve.
- If he declines, the seat is free again and the rider is refunded automatically.

---

## 4. Payment: deposit now, fare at the town

**The people joining mid-route pay only after boarding confirmation.** So:

| what | when | how much | refundable |
|---|---|---|---|
| no-show deposit | on request | **R50** | yes, on decline/cancel |
| booking fee | on request | **R9.99** | yes if driver declines or cancels |
| agreed fare | at boarding, to the driver | negotiated | n/a, goes to driver |

**The fare never passes through GOGO.** The driver keeps it, as decided. GOGO takes
only the R9.99.

**What the R50 deposit is for:** it is not revenue. It exists so a request has a cost
and a rider cannot block a seat for free. It is returned in full unless the rider
no-shows.

**The refund matrix, which has to be explicit or support will not know:**

| who cancels | deposit R50 | fee R9.99 | seat |
|---|---|---|---|
| Driver declines | refunded | refunded | freed |
| Driver cancels after accepting | refunded | refunded | freed |
| Rider cancels before accept | refunded | refunded | freed |
| Rider cancels after accept, before boarding | refunded | **kept** | freed |
| Rider no-shows | **forfeited** | kept | freed |
| Van breaks down / ride cancelled | refunded | refunded | — |
| Rider boards normally | returned or applied to fare | charged | taken |

The asymmetry is deliberate: the deposit protects the *driver's* time, the fee
protects the *platform's*. A rider who cancels after acceptance has cost the driver a
seat he could have sold, so the fee stays. A rider who is simply declined has cost
nothing and gets everything back.

**R50 is held, not charged.** It is an authorisation, released on the outcome above.
If it were a charge, refunds would take days and the driver would look like the
villain while the money sat with GOGO.

---

## 5. The driver sees the rider's number

Once a rider requests a seat, the driver gets the number.

**Why this is right:** he is about to stop in a town for a stranger. He may need to
call: "I am at the Spar, where are you", "I am running 20 minutes late", "I cannot
get into that street, meet me at the corner". Without the number, every one of those
becomes a support ticket and a missed seat.

**What protects the rider:** the number is revealed only on *request*, tied to a real
booking, and it is not visible in search results or to other riders. The existing rule
of hiding numbers until a seat is confirmed needs updating explicitly, because a
request is not yet a confirmed seat. This decision overrides it for mid-route.

**Recommendation to build in from day one:** a masked relay number rather than the
raw one. Same experience for the driver, and the rider's real number is never handed
to someone who has not yet been through a completed ride.

---

## 6. Van breaks down: refund the rider, GOGO absorbs it

If the ride is cancelled entirely:

- R50 deposit refunded in full.
- R9.99 fee refunded in full.
- GOGO eats the R9.99. It is the cost of the failure, and charging a rider for a van
  that never came is indefensible.
- The rider is told immediately and offered the next van on the corridor, with the
  agent escalating rather than leaving them to search again.

---

## What this changes in the build

| # | Step | Note |
|---|------|------|
| 1 | Interval occupancy (`aboardPerLeg`, `canBook`) | Also fixes the live bug where cancelling enlarges the van |
| 2 | Boarding points per driver per town | Set once, reused, pinned to a landmark |
| 3 | Chat bound to (rideId, boardTown, rider), openable before a booking exists | The negotiation happens here |
| 4 | Request → pending → driver accept/decline | The only confirmation path |
| 5a | Provider interface + mock adapter + truthful UI | Ships now, no merchant account needed |
| 5b | Stripe adapter | One file, when the account is ready |
| 6 | Driver "not here, move on" | One tap, frees the seat, rider's deposit behaves as a no-show |

Steps 1–4 are the product and none of them need money to move. That is the point of
splitting 5: the request/accept habit forms, the occupancy logic is proven, and Stripe
plugs into a seam that already exists rather than being bolted onto booking code.

---

## Risks this model creates

**Deposits need a real payment provider, and there is not one yet. Stripe comes
later.** This was checked, not assumed:

```
gogo-pay.js:2   GOGO — Payments & settlement (Phase 0: mock provider, real arithmetic)
gogo-pay.js:8   No real card data is ever collected here: the provider is mocked.
gogo-pay.js:118 provider: "mock", intentId: "pi_mock_..."
```

There is no Stripe, PayFast, Yoco, Ozow or Paystack anywhere on the box, for either
site. GOGO's payment layer records *intent* and does settlement arithmetic against a
mock.

**Decision: Stripe is the provider, and it is deferred.** So the build must be shaped
to accept it without rework, and must not pretend it is already there.

What this means concretely:

- The deposit and fee logic is written against a small provider interface
  (`authorise`, `capture`, `release`, `refund`), not against Stripe's SDK. When
  Stripe is wired, one adapter file changes; the booking, refund and state logic does
  not.
- Until then the mock adapter records the same events in the ledger, so the arithmetic,
  the refund matrix and the UI states are all exercisable end to end without a card.
- **Every place a rider sees money must tell the truth.** While the provider is a mock,
  the R50 hold and R9.99 fee are shown as *due at boarding* (cash), not as charged. A
  UI that says "you have been charged" against a stub is a chargeback and a reputation
  problem, and worse than shipping later.
- Nothing hard-codes Stripe's shape today. No `pi_` ids in our own records, no Stripe
  currency units leaking into storage. The booking stores cents and a provider-neutral
  reference.

So step 5 splits into 5a (provider interface + mock adapter + truthful UI) and 5b
(Stripe adapter), and 5a can ship now without waiting for a merchant account.

This is a sequencing decision, not a technical risk.

**Held seats versus driver trust.** If pending requests hold intervals, a busy town
could show a van as full of *unconfirmed* riders. The driver needs to see
"2 requested, 1 confirmed" so he can decide, and the rider-facing count should show
confirmed seats, not requests.

**A declined rider has already paid a fee.** Even with an automatic refund, there is a
window where money moved and the seat did not happen. The copy has to be clear before
they request: "you will be charged R9.99 and a R50 hold, both returned if the driver
declines."

---

## One thing worth saying plainly

Five of these seven decisions make the product more trustworthy and also more
expensive to build: pending state, deposits, refunds, number sharing, breakdown
handling. All of that is the cost of selling a seat that does not exist yet.

If launch speed matters more than that, there is a smaller version: **requests only,
no money on the platform at all.** Rider requests, driver accepts, fare and any
deposit are settled face to face, GOGO earns nothing on mid-route but the feature
exists and the habit forms. That version is maybe a third of the work and validates
whether people use it before building a payments rail for it.
