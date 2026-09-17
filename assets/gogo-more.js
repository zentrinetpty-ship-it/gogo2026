/* =========================================================================
   GOGO — MORE
   The one place for everything that is not booking: how the service works,
   what it costs, safety, driving, the legal pages and support. Every block is
   an accordion, so the page stays short until someone wants the detail.

   Reuses the app's existing accordion pattern (.g-faq / .g-faq-item) and the
   g-label section heading, so it needs no new CSS beyond a few helpers.
   ========================================================================= */

function pageMore() {
  const fee = typeof FEE_CONFIG !== "undefined" ? FEE_CONFIG : { pickup: 19.99, platform: 9.99 };
  const R = n => "R" + Number(n).toFixed(2);

  /* ── the sections, each a group of accordions ─────────────────────────── */
  const SECTIONS = [
    {
      key: "how", icon: "🚐", title: "How GOGO works",
      sub: "Door collection, live tracking, no rank",
      items: [
        ["What is a hike?", "A hike is a long-distance trip with empty seats. A driver already going your way lists it, you book a seat, and they collect you at your address instead of you waiting at a rank."],
        ["How do I book a seat?", "Enter your pickup address and where you are going. GOGO shows every hike leaving your area, with the time, the vehicle and the price per seat. Send a request and the driver accepts. Nothing is confirmed until they do."],
        ["Can I hop off before the end?", "Yes. Every stop on the route is listed with its own fare, so you can take the ride only as far as you need and pay for that leg alone."],
        ["What can I send instead of a person?", "A parcel. It travels in the boot of a hike that is already going that way. You agree the rate per kilogram with the driver, then the parcel booking fee applies."],
        ["Do you come to my street?", "Yes, that is the whole point. Your pickup address is recorded on the booking and the driver collects you there, with a live arrival time."],
      ],
    },
    {
      key: "cost", icon: "💳", title: "What it costs",
      sub: `Fare, plus ${R(fee.pickup)} pickup and ${R(fee.platform)} platform fee per passenger`,
      items: [
        ["How is the price worked out?", `<p>You pay the fare for your seat, plus a ${R(fee.pickup)} pickup fee and a ${R(fee.platform)} platform fee. The two fees are charged <b>per passenger</b>, so three seats means three fares, three pickup fees and three platform fees.</p><p>There is no subscription and no hidden rank fee.</p>`],
        ["Card or cash?", `<p>Both work. By card, the whole amount is charged in the app when the trip completes. By cash, you hand the driver the fare plus both fees on boarding.</p><p>On a cash seat the driver carries those two fees for the platform, and they are recovered from the driver's side when the trip settles. You never pay the fees twice.</p>`],
        ["Do I pay less if I hop off early?", "Yes. The fare is set per stop, so hopping off at Komani instead of Mthatha costs only the Komani leg. The two fees stay the same either way."],
        ["When is my card actually charged?", "Your card is held when you book and only charged when the trip completes. Cancel more than two hours before departure and nothing is charged."],
        ["What if the trip is cancelled?", "You are refunded in full, including both fees."],
      ],
    },
    {
      key: "safety", icon: "🛡️", title: "Safety",
      sub: "Four checks before a seat is ever sold",
      items: [
        ["What does GOGO check on a driver?", "Four things before a seat can be sold: a valid driver's licence, a professional driving permit, a criminal record clearance and a roadworthy certificate. When any one lapses, that driver's hikes disappear from the app automatically."],
        ["What is the safety selfie?", "Both sides take one before the trip. It is kept for that ride only and deleted 24 hours after it ends."],
        ["Who can see my trip?", "You can add up to three people to watch your trip. Each gets their own link and can follow the route live. They never see your payment details."],
        ["Is my phone number shared?", "Not until the driver accepts, and the driver's number is not shown to you until then either. GOGO hides numbers on both sides until the booking is agreed."],
        ["What if something goes wrong on the road?", "Use the in-app alert so the trip is flagged with its location and the people watching you are notified, then contact the driver through the app."],
      ],
    },
    {
      key: "drive", icon: "🧭", title: "Drive with GOGO",
      sub: "Sell the seats you are driving past anyway",
      items: [
        ["Does it cost anything to list?", "No. Listing is free. You keep the fare."],
        ["How do I get paid?", "Card fares are paid out to you on your settlement cycle, itemised ride by ride. Cash fares you already hold, and the two fees are recovered from your side at settlement or invoiced at the end of the trip."],
        ["What must I have?", "A valid driver's licence for carrying passengers, a professional driving permit, a criminal record clearance and a roadworthy certificate, all current."],
        ["When does my hike go live?", "As soon as you list it and your documents are valid. It hides itself automatically the day any document expires."],
      ],
    },
    {
      key: "account", icon: "⚙️", title: "Account and app",
      sub: "Your details, parcels and messages",
      items: [
        /* Settings is reached from here now that the dock leads to More */
        ["Where are my settings?", `<p>Your profile, phone number, payment method and notification choices live in <a href="rider">Settings</a>.</p>`],
        ["How do I change my details?", `<p>Open <a href="rider">Settings</a> to edit your name, phone number and payment method.</p>`],
        ["Where are my parcels?", "Parcels you have sent or are receiving appear alongside your trips, with the same live tracking as a seat."],
        ["How do I cancel?", "Open the booking and cancel. More than two hours before departure costs nothing."],
      ],
    },
    {
      key: "legal", icon: "📄", title: "Legal",
      sub: "The pages that spell it out in full",
      items: [
        ["Terms of service", `<p>The full agreement covering bookings, cancellations, conduct and liability.</p><p><a class="g-btn g-btn-ghost g-btn-sm" href="terms">Read the terms</a></p>`],
        ["Privacy policy", `<p>What we collect, why we collect it, how long we keep it and how to have it deleted.</p><p><a class="g-btn g-btn-ghost g-btn-sm" href="privacy">Read the privacy policy</a></p>`],
        ["Safety centre", `<p>Everything GOGO checks before you get in, and what to do if something goes wrong.</p><p><a class="g-btn g-btn-ghost g-btn-sm" href="safety">Open the safety centre</a></p>`],
        ["Why GOGO", `<p>The longer read on what GOGO is for and why door collection matters.</p><p><a class="g-btn g-btn-ghost g-btn-sm" href="why">Read why GOGO</a></p>`],
      ],
    },
    {
      key: "help", icon: "💬", title: "Get help",
      sub: "Talk to a person",
      items: [
        ["Message us", `<p>Open a chat in the app and we will answer on the same thread as your booking.</p><p><a class="g-btn g-btn-ink g-btn-sm" href="messages"><span aria-hidden>💬</span> Open messages</a></p>`],
        ["Phone or WhatsApp", `<p><a href="https://wa.me/27780472090">078 047 2090</a> on WhatsApp, or call the same number.</p>`],
        ["Email", `<p><a href="mailto:order@cleanic.co.za">order@cleanic.co.za</a></p>`],
      ],
    },
  ];

  const accordion = (([q, a]) => `
    <details class="g-faq-item">
      <summary><span>${q}</span><span class="g-faq-plus" aria-hidden>＋</span></summary>
      <div class="g-s">${a}</div>
    </details>`);

  $('#main').innerHTML = `
  <div class="g-wrap g-section">
    <div class="g-more-head g-anim">
      <span class="g-label">Everything else</span>
      <h1 class="g-h2 g-mt-sm">More</h1>
      <p class="g-s">How GOGO works, what it costs, safety, driving, the legal pages and how to reach us.${""}</p>
    </div>

    <div class="g-more-grid">
      ${SECTIONS.map(sec => `
        <section class="g-card g-more-sec g-anim">
          <div class="g-more-sec-h">
            <span class="g-more-sec-ic" aria-hidden>${sec.icon}</span>
            <span class="g-more-sec-t">
              <b>${sec.title}</b>
              <span>${sec.sub}</span>
            </span>
          </div>
          <div class="g-faq g-mt">${sec.items.map(accordion).join("")}</div>
        </section>`).join("")}
    </div>

    <div class="g-card g-mt-lg g-anim" style="text-align:center">
      <h2 class="g-h3">Ready to hike?</h2>
      <p class="g-s g-mt-sm">Find a seat on a ride leaving your street.</p>
      <a class="g-btn g-btn-ink g-mt" href="rides"><span aria-hidden>🔍</span> Find a ride</a>
    </div>
  </div>`;
}
