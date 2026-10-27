# Progressive Seat Resale — design plan

**The idea:** a van leaves East London with 4 seats. A passenger hops off at Komani
(Queenstown). That vacated seat can be sold to someone standing in Komani who wants
to go onward to Mthatha. The driver earns on the same trip twice; the Komani
passenger gets a ride that did not exist for them an hour ago.

This is how every minibus taxi in South Africa already works. It is the most
natural revenue feature GOGO can build, and it is also the one most likely to go
badly wrong if the seat accounting is naive. So most of this plan is about
correctness, not screens.

---

## 1. The core insight: seats are not numbers, they are intervals

The current model has one integer per ride:

```js
seats: 4                     // seats the van has
taken = sum(bookings.seats)  // seats sold
if (taken + n > seats) reject
```

That is only correct when every passenger rides the **whole** route. The moment
someone gets off early, the integer is wrong in the expensive direction: it refuses
a booking that is physically possible (lost money), and if you "fix" it by simply
not decrementing, it double-sells a seat that is still occupied (a fight at the
side of the road).

**The correct model is occupancy per leg.** A ride is a list of ordered legs.
For every leg, count how many passengers are aboard:

```
Ride g1: East London → Komani → Butterworth → Idutywa → Mthatha
legs:        0          1          2            3         4

Passenger A: boards 0, alights 1   (EL → Komani)
Passenger B: boards 1, alights 4   (Komani → Mthatha)
```

| leg | aboard | seats free |
|-----|--------|-----------|
| 0 (EL→Komani) | A | 3 |
| 1 (Komani→Butterworth) | B | 3 |
| 2 (Butterworth→Idutywa) | B | 3 |
| 3 (Idutywa→Mthatha) | B | 3 |

A and B overlap in time but not in space, so both are valid. The check for a new
booking is therefore:

```
boardIndex = index of pickup stop
alightIndex = index of drop-off stop
for each leg in [boardIndex, alightIndex):
    if aboard[leg] + n > vehicleCapacity: reject
```

Capacity is checked on the **busiest leg the booking touches**, not on the ride as
a whole. That single change is the whole feature; everything else is UI.

**Terminology, because it prevents bugs:** a *seat* is a physical place, an
*interval* is a span of legs. Bookings consume intervals, not seats.

---

## 2. Two kinds of stop, and they must not be the same object

The plan needs to distinguish:

- **Scheduled stops** — towns the ride is committed to on its timetable
  (Komani, Butterworth, Idutywa, Mthatha). Known before departure, priced in `legs`.
- **Ad-hoc pickups** — a town the driver agrees to stop at *while en route*
  because a booking came in. Not on the timetable, approved live.

Keeping these in one array is how you end up showing "Komani" as a destination on
a ride that already passed it. They get separate fields:

```js
legs:        { Komani: 120, Butterworth: 170, Idutywa: 195, Mthatha: 240 }
extraStops:  [ { town: "Cathcart", afterLeg: "Komani", at: "07:40" } ]
```

An ad-hoc pickup inserts a leg into the sequence for occupancy purposes, but does
not alter the published timetable.

---

## 3. The state machine a ride needs

Right now a booking is `pending | cancelled`. This feature needs the ride itself to
know where it is, or the agent and the driver app will disagree about what is
sellable.

```
scheduled → boarding → departed → en_route → arriving → completed
                                    │
                                    └→ seat_freed (an event, not a state)
```

The only transition that matters for this feature: **`seat_freed`**. It fires when
a passenger alights, and it is what allows the leg ahead of them to be resold.

Critically, `seat_freed` is **projected, not awaited**. The booking for Komani →
Mthatha can be sold *before* the van reaches Komani, because the release is
scheduled, not speculative. It becomes a real seat at the moment of alighting, and
the booking carries `status: confirmed, notYetBoarded` until then.

**The risk this creates:** if passenger A does not get off at Komani (falls asleep,
changes plans), passenger B has a confirmed seat on a van with no seat. This is the
one failure mode that ends in a physical confrontation. The mitigations are in §6.

---

## 4. Pricing: the hard question

What does Komani → Mthatha cost?

**Option A — leg-price arithmetic.** `price(Komani→Mthatha) = 240 − 120 = 120`.
Simple, feels fair, and is wrong: it ignores that the van is already paid for up to
Komani, and it prices a 3-hour onward leg the same as a 1-hour first leg.

**Option B — published leg fares, independent.** Each stop has a fare *from the
origin*, as now. For a mid-route boarding, price from that stop's own distance to
the destination, using the same per-km rate implied by the full route.

**Option C — dynamic, discounted to fill.** The seat is otherwise empty for the rest
of the trip, so any revenue is profit. Discount it 10–20% to fill fast, which is
exactly what a taxi conductor does.

**Recommendation: B, with an optional C.** Compute a per-km rate from the ride's own
fares, price the partial leg from it, then apply a configurable
`midRouteDiscount` (default 10%) because the seat would otherwise earn nothing.
This is defensible to a rider, transparent to the driver, and every number comes
from data rather than a guess.

Never let the client compute it. The existing `priceSeat` already recomputes
server-side and rejects a mismatch; that pattern extends to leg pricing.

---

## 5. Who sees what

**The rider searching mid-journey** asks: *"I am in Komani, what is leaving soon
that passes Mthatha?"* This is a different query from "book a seat from East
London". The agent tool becomes:

```
find_rides(from, to, { nowDeparting: true })
```

which returns only rides where:
- the ride has not yet passed `from`
- `to` appears after `from` in the sequence
- there is at least one free interval on every leg between them
- `departFrom` (the time the van reaches their town) is soon, so it is genuinely
  "now"

The response must lead with **the time the van reaches their town**, not the ride's
origin departure time. Telling a Komani passenger "06:30" when that is when the van
left East London is useless.

**The driver** sees, before departure and en route:
- who is aboard, and where each person alights
- how many intervals are free on each leg
- incoming mid-route bookings, with the town and headcount
- a one-tap "confirm stop" so the pickup is agreed, not assumed

**The rider already aboard** should not see other people's names or seats. They see
"2 more joining at Komani" at most.

---

## 6. The failure modes, ranked by how badly they end

| # | Failure | Consequence | Mitigation |
|---|---------|-------------|------------|
| 1 | Passenger does not alight as booked | Confirmed seat, no seat. Physical conflict. | Re-confirm alighting 20 min out ("still getting off at Komani?"). If no answer, hold the onward booking as `pending`, do not confirm. Driver sees both and decides. |
| 2 | Van is full when the release was expected | Same as above | The seat is only *released* on alight. Bookings ahead of a release are capped at `capacity − aboard`, never at the projected number. |
| 3 | Ad-hoc stop is not drivable / unsafe | Driver detours into a place he should not be | Curated per-town boarding points. **The driver never goes to a house** — he stops at a named rank or petrol station he already passes. |
| 4 | Late booking after the van passed the town | Refund, angry rider | Hard cutoff: no sale once `departFrom` has passed, enforced server-side on the ride's clock, not the phone's. |
| 5 | Driver "adds a stop" that is far off-route | Everyone aboard is delayed | Ad-hoc stops limited to towns on the corridor list, within a max detour (say 10 min), and only before the van reaches the preceding leg. |
| 6 | Price undercuts a rider who booked the full route | Trust damage | Mid-route fares never go below the marginal cost of the remaining legs, and the discount is capped. |

**The one to solve first is #1.** Everything else is an inconvenience; #1 is a
safety incident. The rule I would adopt: **a seat is never sold on the strength of a
promise to get off.** It becomes sellable when the passenger confirms, or when they
physically alight. The UI can still offer it ("1 seat opening at Komani") but the
booking sits as `pending` until the release is real.

---

## 7. What this needs on the server

```js
// occupancy, derived — never stored as a mutable number
function aboardPerLeg(rideId, bookings) { ... }   // returns [n0, n1, n2, ...]

// the one gate
function canBook(rideId, fromIdx, toIdx, seats) {
  const aboard = aboardPerLeg(...);
  for (let i = fromIdx; i < toIdx; i++)
    if (aboard[i] + seats > capacity) return { ok:false, onLeg:i };
  return { ok:true };
}
```

Rules:
- **Occupancy is always derived** from bookings. A stored counter will drift the
  moment a booking is cancelled and someone forgets to decrement.
- **Cancelling re-derives**, which already works because `taken` is a reduce.
- **`RIDES[id].seats` mutation must go.** Line 522 does `RIDES[b.rideId].seats +=`
  on cancel. This is already a live bug, not just a problem for this feature:

  ```
  capacity after one cancel:   6  (was 4)
  capacity after a second cancel: 8  (was 4)
  ```

  A double tap on cancel, or a retry, permanently enlarges the van. Two cancels
  and a 4-seat Quantum accepts 8 bookings. Capacity must be a constant read from
  the ride definition; the bookings are the only mutable thing.
- Every booking stores `boardIdx` and `alightIdx` so occupancy can be rebuilt after
  a restart. Today a booking stores only `stop` (the alighting town), which is not
  enough to know which legs it occupied.

---

## 8. Build order (each step shippable)

1. **Interval occupancy** — `aboardPerLeg`, `canBook`, bookings carry
   `boardIdx`/`alightIdx`. No UI change. Ship behind the existing book flow; it is
   strictly more permissive only where it is correct.
2. **Mid-route fare** — `priceLeg(rideId, fromIdx, toIdx)` on the server, exposed via
   `/quote`. The agent uses it for "how much from Komani".
3. **Agent: `find_rides({nowDeparting})`** — the search an en-route rider makes. No
   new storage, reuses the ride finder.
4. **Driver board** — a screen showing aboard-by-leg and incoming pickups. Confirm
   stop = one tap.
5. **Alight confirmation** — the 20-minute re-confirm that makes §6 #1 safe. This
   must land **before** any seat is sold ahead of a release.
6. **Ad-hoc stops** — curated boarding points per town, max-detour rule.

Steps 1–3 alone deliver the money: a Komani rider can find and book an onward seat
on a van already moving. Step 5 is what makes it safe to sell that seat *before* it
frees.

---

## 9. Open questions for you

1. **Price the onward leg how?** Cheapest defensible is per-km from the ride's own
   fares, minus a 10% fill discount. Or do you want a flat rate per town pair?
2. **Sell before or after the alight?** Selling before makes more money and needs
   strict re-confirmation. Selling after is simpler and safer. My recommendation:
   offer, but confirm on release.
3. **Boarding points** — do you want to name one per town (a rank or petrol station
   the driver already passes), or let the driver set them?
4. **Does the driver keep the extra, or is it split?** Affects whether this is
   framed as driver income or platform revenue.
