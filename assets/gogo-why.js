/* =========================================================================
   GOGO — Why GOGO
   The landing band and the dedicated /why.html page. Everything here is about
   the two reasons people stay home instead of travelling: the walk and the
   wait, and the risk of standing around with your bags.
   ========================================================================= */

const GOGOWhy = (() => {
  const REASONS = [
    {
      key: "weather", icon: "🌦️", tone: "navy", title: "No more standing in the weather",
      line: "You wait at your own gate. Not in the rain, not in the sun, not in the wind at a rank.",
      long: [
        "Hiking usually starts with the worst part of the trip: standing outside with your bags, hoping a car comes before the weather turns.",
        "On GOGO the driver comes to the address you gave. You get a live arrival time, so you walk out when the van is at your gate, not forty minutes early to hold a spot.",
        "If it is pouring, you wait inside. If it is baking, you wait in the shade. Your seat is already yours either way.",
      ],
      proof: "Door collection on every ride, with a live arrival time",
    },
    {
      key: "safety", icon: "🛡️", tone: "lime", title: "No more robbery risk at the rank",
      line: "No cash waved around, no waiting on a dark corner, no climbing into a car nobody has checked.",
      long: [
        "The dangerous part of long-distance travel is rarely the road. It is the wait: cash in your hand, bags at your feet, a stranger's boot opening next to you.",
        "Every GOGO driver clears four checks before a seat can be sold: driver's licence, professional driving permit, criminal record clearance and a roadworthy certificate. When any one of them lapses, their rides disappear from the app automatically.",
        "Drivers and passengers both take a safety selfie for the duration of the ride, so the person in the van is the person on the booking. There is no cash out in the open unless you choose to pay cash in the car.",
      ],
      proof: "Licence, PDP, criminal clearance and roadworthy, all verified before listing",
    },
    {
      key: "nostray", icon: "🏠", tone: "gold", title: "If nobody is going your way, you stay home",
      line: "Search any route in all nine provinces. If there is no ride today, set an alert and we tell you the moment one appears.",
      long: [
        "The worst answer in travel is \"no cars going that way today\", usually shouted through a window after you already travelled to the rank.",
        "GOGO searches the whole country, town by town and province by province. Pick a town, or pick a province and see everything going there.",
        "If the route is quiet, you set an alert and stay home. The moment a driver lists that route, you know about it and can hold a seat.",
      ],
      proof: "9 provinces, 186 towns, alerts on routes that are quiet today",
    },
    {
      key: "bags", icon: "🧳", tone: "navy", title: "Heavy bags? We come to you",
      line: "Two suitcases, a mattress, a crate of groceries, a baby bag. You do not carry any of it to a rank.",
      long: [
        "Travelling with real luggage is the thing that breaks people. You cannot carry it far, you cannot leave it, and you cannot hold it on your lap for three hours.",
        "Tell the driver what you are bringing when you book. Vehicles are listed with their luggage space, boot space, trailers and roof racks, so you pick a ride that actually fits your load.",
        "The van arrives at your address, the bags go in the boot, and you get in. When you arrive, you get out at your stop, not at the far end of a taxi rank.",
      ],
      proof: "Luggage listed per vehicle: hand luggage, boot space or trailer",
    },
    {
      key: "night", icon: "🌙", tone: "navy", title: "Late night and early morning hikes",
      line: "The 4am hike to catch a clinic appointment, or the 9pm ride home after work. Both are covered.",
      long: [
        "Long-distance travel does not happen at convenient times. Buses are full, ranks are empty before dawn, and nobody wants to be the last person standing on a street at night.",
        "GOGO rides run from early morning to late night, and every one of them can be watched live. You do not have to hope. Your people can see the van moving.",
        "Booking in advance is the safest habit there is: your seat is held, your pickup is recorded, and your trip shows up in the app the moment the driver accepts.",
      ],
      proof: "Rides that depart from 04:00 through to late night, all trackable",
    },
    {
      key: "watch", icon: "📡", tone: "lime", title: "Your people watch you the whole way",
      line: "Share your live trip with up to 3 people on WhatsApp, SMS, Telegram or any app you use.",
      long: [
        "You should never have to send \"I am fine\" and hope your family believes you.",
        "Tap share and pick up to three people. Each gets their own link to a live map showing the van moving, your route, your stops, the estimated arrival, and whether you have confirmed that you are safe.",
        "They never see your phone number. You can revoke any link mid trip and see exactly who opened it and when. When you arrive you tap I am safe, and everyone watching sees it at the same moment.",
      ],
      proof: "Up to 3 watchers, each with a revocable link, no phone numbers exposed",
    },
    {
      key: "pay", icon: "💳", tone: "gold", title: "Pay by card or in cash",
      line: "Your choice, every booking. One small booking fee, no fare games.",
      long: [
        "Some people travel with a card, some travel with cash. Both work, and the fare is the fare.",
        "You pay per seat, not for the whole car, so a shared hike costs a fraction of a private shuttle or a chartered van.",
        "Card payments are held when you book and only released to the driver when the trip completes. Cancel more than two hours before departure and nothing is charged.",
      ],
      proof: "Fare + booking fee. Card is held at booking and captured on completion",
    },
    {
      key: "driver", icon: (window.GOGO && GOGO.van ? GOGO.van() : ''), tone: "gold", title: "Driving anyway? Sell the empty seats",
      line: "If you are already going, your empty seats pay for your fuel.",
      long: [
        "Thousands of bakkies, Quantums and sedans run the N2 corridor every day with three or four empty seats.",
        "List the trip, set your fare, choose your stops and how much luggage you can take. Passengers going your way request the seats, you accept the ones you want, and you collect them from their addresses in the order the app gives you.",
        "Listing is free and you keep the fare. A cash passenger hands you the booking fee with the fare, so you are never out of pocket. You carry that fee for the platform and it is recovered at settlement, or invoiced when the trip ends.",
      ],
      proof: "Free to list, riders cleared and verified before they can book",
    },
  ];

  const FAQ = [
    ["How much does GOGO cost me?", "The fare you see on the ride, plus a booking fee per passenger. Pay by card and it is charged in the app; pay cash and you hand it to the driver with your fare. There is no subscription and no hidden rank fee."],
    ["Is it safe to get into a stranger's car?", "GOGO is not a stranger's car. The driver's licence, professional driving permit, criminal record clearance and vehicle roadworthy certificate are checked before a single seat is sold, and the ride hides itself the day any one of those lapses. Both sides photograph themselves for the duration of the ride, and everything can be reported from inside the trip."],
    ["What happens if a driver does not show up?", "The ride is refunded in full, the driver is flagged for review and we help you find another seat on the same route. Cancellations inside two hours are counted against the driver's reliability record."],
    ["Can I travel with a big load?", "Yes. Every vehicle lists what it can carry, hand luggage, boot space or a trailer. Put your load in the booking note so the driver arrives ready."],
    ["What if there is no ride on my route?", "Set an alert on that route. You stay home and we tell you the moment a driver lists it."],
    ["Does sharing my trip cost anything?", "No. You can share with up to three people on any messaging app, each with their own link that you can revoke at any time."],
    ["What happens to my safety selfie?", "It is kept only for the duration of the ride and deleted 24 hours after the trip completes and you confirm that you are safe. You can delete it yourself, earlier, at any time."],
  ];

  const tone = t => "tone-" + t;

  /* ── landing band ─────────────────────────────────────────────────────── */
  function renderSection(host) {
    if (!host || document.getElementById("whyBand")) return;
    const band = document.createElement("div");
    band.id = "whyBand";
    band.className = "g-wrap g-section";
    band.innerHTML = `
      <div class="g-between g-anim">
        <div>
          <span class="g-label">Why GOGO</span>
          <h2 class="g-h2 g-mt-sm">The hard part of travelling is not the road</h2>
          <p class="g-s g-mt-sm" style="max-width:52em">It is the waiting, the weather, the bags and the walk to the rank. GOGO moves all of that out of your way.</p>
        </div>
        <a class="g-btn g-btn-ink" href="why"><span aria-hidden>📖</span> All the reasons</a>
      </div>

      <div class="g-grid g-mt-lg">
        ${REASONS.slice(0, 6).map((r, i) => `
          <div class="g-4 g-anim">
            <article class="g-why">
              <span class="g-ic g-why-ic ${r.tone === "lime" ? "g-ic-lime" : r.tone === "navy" ? "g-ic-ink" : ""}" aria-hidden>${r.icon}</span>
              <h3 class="g-h3 g-mt-sm">${r.title}</h3>
              <p class="g-s">${r.line}</p>
              <div class="g-why-proof"><span aria-hidden>✅</span> ${r.proof}</div>
            </article>
          </div>`).join("")}
      </div>

      <div class="g-card g-mt-lg g-anim" style="background:linear-gradient(135deg,rgba(163,230,53,.18),rgba(141,182,0,.10))">
        <div class="g-between">
          <div class="g-row">
            <span class="g-ic g-ic-lg" aria-hidden>📡</span>
            <div>
              <div class="g-t">Share your trip with up to 3 people</div>
              <div class="g-list-s">Live map, arrival time, and your I am safe at the end. They never see your number.</div>
            </div>
          </div>
          <a class="g-btn g-btn-outline" href="why.html#watch">How it works</a>
        </div>
      </div>`;
    host.appendChild(band);
  }

  /* ── dedicated page ───────────────────────────────────────────────────── */
  function pageWhy() {
    $('#main').innerHTML = `
    <div class="g-wrap g-section">
      <div class="g-anim">
        <span class="g-label">Why GOGO</span>
        <h1 class="g-h1 g-mt-sm" style="max-width:20em">Travel that starts at your gate, not at a rank</h1>
        <p class="g-s g-mt" style="max-width:60em;font-size:15.5px">Every reason people stay home instead of travelling has the same shape: the wait, the walk, the weather and the luggage. GOGO was built to remove all four, and to keep your family able to see you while you travel.</p>
        <div class="g-row g-mt-lg">
          <a class="g-btn g-btn-ink" href="index.html"><span aria-hidden>🔍</span> Find a ride</a>
          <a class="g-btn g-btn-outline" href="#reasons">Read the reasons</a>
        </div>
      </div>

      <div class="g-grid g-mt-lg" style="grid-template-columns:repeat(4,1fr);gap:12px">
        ${[["🪪", "4 checks", "before a seat is sold"], ["📡", "3 watchers", "on every trip"], ["🕕", "04:00 to late", "every day"], ["🔒", "24 hours", "then selfies delete"]].map(([e, a, b]) => `
          <div class="g-card g-anim"><span class="g-ic g-ic-sm g-ic-lime" aria-hidden>${e}</span>
            <div class="g-t g-mt-sm">${a}</div><div class="g-list-s">${b}</div></div>`).join("")}
      </div>

      <div class="g-card g-mt-lg g-anim">
        <div class="g-head"><span class="g-label">The old way vs GOGO</span><span class="g-s-sm">same trip, different day</span></div>
        <div class="g-vs g-mt">
          <div class="g-vs-col bad">
            <div class="g-vs-head"><span aria-hidden>🚕</span> Standing at the rank</div>
            <ul>
              <li>Leave home an hour early to hold a spot</li>
              <li>Wait in the rain, the sun or the wind</li>
              <li>Carry everything yourself, or pay someone to watch it</li>
              <li>Cash out in the open, with people watching</li>
              <li>No car going your way today, so you go home anyway</li>
              <li>Nobody knows where you are until you arrive</li>
              <li>Luggage on your lap for three hours</li>
            </ul>
          </div>
          <div class="g-vs-col good">
            <div class="g-vs-head"><span aria-hidden>${(window.GOGO && GOGO.van) ? GOGO.van() : ''}</span> Hiking with GOGO</div>
            <ul>
              <li>Wait at your gate, walk out when the van arrives</li>
              <li>Live arrival time, so you wait inside</li>
              <li>Driver collects you from your address</li>
              <li>Pay by card, or hand cash over in the car</li>
              <li>Set an alert and stay home until a ride appears</li>
              <li>Up to 3 people watch your trip live</li>
              <li>Bags in the boot, seat for you</li>
            </ul>
          </div>
        </div>
      </div>

      <div id="reasons" class="g-mt-lg">
        <span class="g-label">The reasons</span>
        <h2 class="g-h2 g-mt-sm">Eight problems GOGO takes off your plate</h2>
      </div>

      ${REASONS.map((r, i) => `
        <div class="g-card g-mt-lg g-anim" id="${r.key}">
          <div class="g-row">
            <span class="g-ic g-ic-lg ${r.tone === "lime" ? "g-ic-lime" : r.tone === "navy" ? "g-ic-ink" : ""}" aria-hidden>${r.icon}</span>
            <div style="min-width:0">
              <span class="g-label">Reason ${String(i + 1).padStart(2, "0")}</span>
              <h3 class="g-h3 g-mt-sm">${r.title}</h3>
            </div>
          </div>
          <p class="g-s g-mt" style="font-size:15px">${r.line}</p>
          <div class="g-mt">${r.long.map(p => `<p class="g-s g-mt-sm">${p}</p>`).join("")}</div>
          <div class="g-why-proof g-mt"><span aria-hidden>✅</span> ${r.proof}</div>
        </div>`).join("")}

      <div class="g-card g-mt-lg g-anim" id="watch">
        <div class="g-between">
          <div><span class="g-label">Live tracking</span><h3 class="g-h3 g-mt-sm">How the sharing actually works</h3></div>
          <span class="g-stamp g-stamp-full">up to 3 people</span>
        </div>
        <div class="g-grid g-mt">
          ${[["1", "You book and pick your watchers", "Add up to three names: Mom, your brother, your flatmate. One link each."],
             ["2", "They open a live map", "The van moving, your route, your stops, the estimated arrival time, and a heartbeat that proves it is current."],
             ["3", "You tap I am safe", "Everyone watching sees it at the same moment. The trip closes and your safety selfie starts its 24 hour deletion clock."]]
            .map(([n, t, s]) => `
              <div class="g-6"><div class="g-card"><div class="g-row"><span class="g-step-no" aria-hidden>${n}</span>
                <div><div class="g-t">${t}</div><div class="g-list-s">${s}</div></div></div></div></div>`).join("")}
        </div>
        <ul class="g-ticks g-mt">
          <li><span aria-hidden>✅</span> No phone numbers shown to anyone</li>
          <li><span aria-hidden>✅</span> Revoke any link mid trip</li>
          <li><span aria-hidden>✅</span> See who opened your link and when</li>
          <li><span aria-hidden>✅</span> Links expire when the trip closes</li>
        </ul>
      </div>

      <div class="g-card g-mt-lg g-anim">
        <span class="g-label">Safety, in plain terms</span>
        <h3 class="g-h3 g-mt-sm">What GOGO checks before you get in</h3>
        <div class="g-grid g-mt">
          ${[["🪪", "Driver's licence", "The right code for carrying passengers, verified against their ID."],
             ["🎫", "Professional driving permit", "The permit that makes carrying passengers for reward legal."],
             ["🔎", "Criminal record clearance", "Vetted before a seat is sold. We keep the result and its expiry, not the certificate."],
             ["🛠️", "Roadworthy certificate", "The vehicle is fit to carry people, and its plate matches the listing."],
             ["📸", "Safety selfie, both sides", "Held for the duration of the ride, then deleted 24 hours after you confirm you are safe."],
             ["🆘", "Support inside the trip", "Report from the ride chat or from a watcher's link. The trip is attached automatically."]]
            .map(([e, t, s]) => `
              <div class="g-6"><div class="g-card" style="height:100%">
                <span class="g-ic g-ic-sm" aria-hidden>${e}</span>
                <div class="g-t g-mt-sm">${t}</div><div class="g-list-s">${s}</div></div></div>`).join("")}
        </div>
        <a class="g-btn g-btn-outline g-mt" href="safety"><span aria-hidden>🛡️</span> Visit the safety centre</a>
      </div>

      <div class="g-mt-lg">
        <span class="g-label">Questions</span>
        <h2 class="g-h2 g-mt-sm">Straight answers</h2>
        <div class="g-faq g-mt">
          ${FAQ.map(([q, a]) => `
            <details class="g-faq-item">
              <summary><span>${q}</span><span class="g-faq-plus" aria-hidden>＋</span></summary>
              <p class="g-s">${a}</p>
            </details>`).join("")}
        </div>
      </div>

      <div class="g-card g-mt-lg g-anim" style="background:linear-gradient(135deg,rgba(163,230,53,.22),rgba(141,182,0,.12));text-align:center">
        <h2 class="g-h2">Your next hike starts at your gate</h2>
        <p class="g-s g-mt-sm" style="max-width:44em;margin-inline:auto">Pick your town, pick your seat, and let the people who love you watch you arrive.</p>
        <div class="g-row g-mt" style="justify-content:center">
          <a class="g-btn g-btn-ink" href="index.html"><span aria-hidden>🔍</span> Find a ride</a>
          <a class="g-btn g-btn-lime" href="auth"><span aria-hidden>💬</span> Start with your number</a>
        </div>
      </div>
    </div>`;
  }


  /* ── terms ────────────────────────────────────────────────────────────── */
  function pageTerms() {
    $('#main').innerHTML = `
    <div class="g-wrap g-section g-legal" style="max-width:900px">
      <span class="g-label">Legal</span>
      <h1 class="g-h1 g-mt-sm">Terms of use</h1>
      <p class="g-s g-mt-sm">Last updated 11 September 2026. These terms apply when you book a seat or list a ride on GOGO.</p>

      <h2 class="g-h3">1. What GOGO is</h2>
      <p class="g-s">GOGO is a platform that connects passengers who want a seat with drivers already travelling that way. GOGO is not a transport operator, does not own the vehicles and does not employ the drivers. The transport agreement is between the passenger and the driver. GOGO provides the matching, the payment rail, the safety checks and the live tracking.</p>

      <h2 class="g-h3">2. Booking a seat</h2>
      <ul class="g-s">
        <li>You must be 18 or older, or travelling with someone who is.</li>
        <li>You must give your real name, a working number and the address where you want to be collected.</li>
        <li>A booking is confirmed when the driver accepts your request. Until then the seat is not yours.</li>
        <li>You must take a safety selfie for the duration of the ride. It is deleted 24 hours after the trip completes and you confirm that you are safe.</li>
      </ul>

      <h2 class="g-h3">3. Fares and the booking fee</h2>
      <ul class="g-s">
        <li>Drivers set their own fares. GOGO shows the fare before you book, with per stop pricing where a ride has stops.</li>
        <li>A booking fee of R5 is charged per booking. It is the platform's only revenue on that booking.</li>
        <li>Card payments are authorised when you book and captured when the trip completes. Cancel more than 2 hours before departure and nothing is charged.</li>
        <li>On a cash seat you pay the driver the fare plus the booking fee on boarding. The driver carries that fee for the platform and it is recovered at settlement, so the fee is collected once and never twice.</li>
      </ul>

      <h2 class="g-h3">4. Cancellations and no shows</h2>
      <ul class="g-s">
        <li>Cancel more than 2 hours before departure at no cost.</li>
        <li>Inside 2 hours the fare and fee stand, because the seat was held and could not be resold.</li>
        <li>If a driver cancels, you are refunded in full and the cancellation counts against the driver's reliability record.</li>
        <li>If a passenger does not appear at the pickup point, the driver may mark a no show and the fare stands.</li>
      </ul>

      <h2 class="g-h3">5. Drivers</h2>
      <ul class="g-s">
        <li>Listing is free. You keep the fare. On a cash seat the passenger hands you the two fees with the fare, and they are recovered from your side at settlement, or invoiced when the trip ends.</li>
        <li>You must hold a valid driver's licence for carrying passengers, a professional driving permit, a criminal record clearance and a roadworthy certificate, and keep them current.</li>
        <li>Your rides hide automatically the day any required document expires. You must honour bookings already accepted where it is possible to do so.</li>
        <li>Payouts are settled on the cycle shown in your statement, with every ride, fee, refund and adjustment itemised.</li>
      </ul>

      <h2 class="g-h3">6. Conduct</h2>
      <ul class="g-s">
        <li>No alcohol or drugs in the vehicle, no smoking, and no weapons.</li>
        <li>Seat belts for every passenger. Luggage must be declared when booking.</li>
        <li>Abuse, harassment or discrimination ends the trip and the account.</li>
        <li>Report a problem from inside the trip or from a watcher's tracking link. The ride, the chat and the safety selfies are attached to the report automatically.</li>
      </ul>

      <h2 class="g-h3">7. Liability</h2>
      <p class="g-s">GOGO verifies documents and operates the safety features described in the privacy notice, but cannot guarantee the conduct of any person. To the extent the law allows, GOGO is not liable for loss, injury or delay arising from the transport itself. Nothing here removes rights you have under the Consumer Protection Act.</p>

      <h2 class="g-h3">8. Changes</h2>
      <p class="g-s">We will publish any change to these terms here with a new date, and tell you in the app before it takes effect.</p>

      <h2 class="g-h3">9. Map data</h2>
      <p class="g-s">Maps and place search in GOGO are drawn from OpenStreetMap contributors, whose data is made available under the Open Database Licence, and from Esri and CARTO basemaps used with their permission. Those contributors and providers own their data and imagery. Places come from GOGO's own list of South African towns, not from a third party directory.</p>

      <div class="g-card g-mt-lg">
        <div class="g-row"><span class="g-ic g-ic-sm" aria-hidden>✉️</span>
          <div><div class="g-t">Questions about these terms</div>
          <div class="g-list-s">Reach the platform team from the chat in the app, or call 078 047 2090.</div></div></div>
        <a class="g-btn g-btn-outline g-mt" href="messages"><span aria-hidden>💬</span> Open the chat</a>
      </div>
    </div>`;
  }

  /* ── privacy ──────────────────────────────────────────────────────────── */
  function pagePrivacy() {
    $('#main').innerHTML = `
    <div class="g-wrap g-section g-legal" style="max-width:900px">
      <span class="g-label">Legal</span>
      <h1 class="g-h1 g-mt-sm">Privacy and data</h1>
      <p class="g-s g-mt-sm">Last updated 11 September 2026. This notice explains what GOGO collects, why, how long it is kept and how to get it deleted. It follows the Protection of Personal Information Act (POPIA).</p>

      <h2 class="g-h3">What we collect, and why</h2>
      <ul class="g-s">
        <li><b>Your number</b>, verified by a one time code, so the person meeting you knows it is you.</li>
        <li><b>Your name and pickup address</b>, to place you on the route and in the run sheet.</li>
        <li><b>A safety selfie</b>, so driver and passenger can confirm they are the people on the booking.</li>
        <li><b>Your trip records</b>, so fares, fees, refunds and disputes can be answered.</li>
        <li><b>Payment references from the provider</b>, never your card number, which never reaches GOGO.</li>
        <li><b>Chat messages</b>, so a dispute can be resolved with the actual conversation.</li>
        <li><b>For drivers:</b> licence, professional driving permit, criminal record clearance, roadworthy certificate, ID, bank confirmation and vehicle details.</li>
      </ul>

      <h2 class="g-h3">Safety selfies: the 24 hour rule</h2>
      <p class="g-s">A safety selfie is kept only for the duration of the ride. It is deleted <b>24 hours after the trip is completed and the passenger confirms that they are safe</b>. You can also delete it yourself, immediately, from the safety centre. If a passenger never confirms, the ride escalates to a human reviewer rather than expiring silently.</p>
      <p class="g-s g-mt-sm">Selfies are visible only to the other person on that ride and to the platform team handling a report.</p>

      <h2 class="g-h3">Criminal record checks</h2>
      <p class="g-s">A criminal record is special personal information. We collect it with your explicit, separate consent, use it only to decide whether you may carry passengers, and keep the <b>result and its expiry date</b> rather than the certificate itself. Every view of that record is logged. Refusing the check means we cannot activate a driver account, because passenger safety depends on it.</p>

      <h2 class="g-h3">Live tracking links</h2>
      <p class="g-s">When you share a trip, each watcher gets their own link. They see the vehicle, the route, the stops, the estimated arrival and whether you confirmed you are safe. They never see your phone number, your payment details, or any address beyond the pickup street. Links expire when the trip closes and you can revoke any of them at any time. You can see who opened your link and when.</p>

      <h2 class="g-h3">Who we share with</h2>
      <ul class="g-s">
        <li><b>The other party on the ride</b>: your first name, your pickup point, your seat count and your safety selfie.</li>
        <li><b>Payment providers</b>, to take and settle payments. They see an amount and a reference, not your card details.</li>
        <li><b>Vetting partners</b>, for criminal record checks on drivers.</li>
        <li><b>Nobody else</b>, unless the law requires it or you ask us to.</li>
      </ul>

      <h2 class="g-h3">How long we keep things</h2>
      <ul class="g-s">
        <li><b>Safety selfies</b>: deleted 24 hours after completion plus the safe confirmation, or on your request.</li>
        <li><b>Trip and payment records</b>: kept while the account is active and for the period tax and consumer law require.</li>
        <li><b>Chat</b>: kept with the ride record while it may be needed for a dispute, then removed.</li>
        <li><b>Driver documents</b>: verification results kept while the driver is active and a defensible period after; uploaded files deleted once the decision is recorded.</li>
        <li><b>Tracking links</b>: expire when the trip closes.</li>
      </ul>

      <h2 class="g-h3">Your rights</h2>
      <p class="g-s">You may ask what we hold about you, ask for a copy, ask us to correct it, ask us to delete it, or object to a particular use. Ask from the chat in the app and we will respond within 30 days. If you are unhappy with the answer you may complain to the Information Regulator of South Africa.</p>

      <h2 class="g-h3">How it is protected</h2>
      <p class="g-s">Access to personal information is limited to the people who need it for a specific job, every access to sensitive records is logged, and money movements are recorded in an append-only ledger that cannot be quietly edited.</p>

      <div class="g-card g-mt-lg">
        <div class="g-row"><span class="g-ic g-ic-sm g-ic-lime" aria-hidden>🛡️</span>
          <div><div class="g-t">Manage your data in the app</div>
          <div class="g-list-s">Delete your safety selfie now, or ask us anything, from the safety centre.</div></div></div>
        <div class="g-row g-mt"><a class="g-btn g-btn-outline" href="safety"><span aria-hidden>🛡️</span> Safety centre</a>
        <a class="g-btn g-btn-ghost" href="messages">Ask a question</a></div>
      </div>
    </div>`;
  }

  /* ── 404 ──────────────────────────────────────────────────────────────── */
  function page404() {
    $('#main').innerHTML = `
    <div class="g-wrap g-section">
      <div class="g-card" style="max-width:620px;margin-inline:auto;text-align:center">
        <span class="g-ic g-ic-lg" aria-hidden>🧭</span>
        <h1 class="g-h2 g-mt-sm">This road does not exist</h1>
        <p class="g-s g-mt-sm">The page you were looking for is not here. It may have moved, or the link may be wrong.</p>
        <div class="g-row g-mt" style="justify-content:center">
          <a class="g-btn g-btn-ink" href="index.html"><span aria-hidden>🔍</span> Book a ride</a>
          <a class="g-btn g-btn-outline" href="why">Why GOGO</a>
        </div>
      </div>
    </div>`;
  }

  function boot() {
    const page = document.body.dataset.page;
    if (page === "why") { pageWhy(); return; }
    if (page === "terms") { pageTerms(); return; }
    if (page === "privacy") { pagePrivacy(); return; }
    if (page === "404") { page404(); return; }
    if (page === "home") {
      /* sit the band between the popular routes and the "how it works" section */
      const main = $('#main');
      const sections = main ? Array.from(main.children).filter(n => n.classList && n.classList.contains("g-wrap")) : [];
      renderSection(main || document.body);
      const band = document.getElementById("whyBand");
      if (band && sections[1]) main.insertBefore(band, sections[1]);
      else if (band && sections.length) main.insertBefore(band, sections[sections.length - 1]);
    }
  }

  return { boot, pageWhy, pageTerms, pagePrivacy, page404, renderSection, REASONS, FAQ };
})();

window.GOGOWhy = GOGOWhy;
document.addEventListener("DOMContentLoaded", () => { try { GOGOWhy.boot(); } catch (e) { console.error("GOGOWhy boot failed", e); } });
