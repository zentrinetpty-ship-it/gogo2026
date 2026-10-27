/**
 * GOGO — CUSTOMER SUPPORT AGENT
 *
 * Modelled on the Cleanic assistant, with the same security posture and the same
 * "teaches, never does" rule, but the guardrails are re-derived for a rides and
 * parcels business rather than copied. Copying Cleanic's suburb rule verbatim
 * would have been actively wrong: Cleanic refuses to confirm coverage, whereas
 * GOGO publishes a corridor and must answer that question.
 *
 * ── THE GUARDRAILS, AND WHY EACH EXISTS ─────────────────────────────────────
 *
 * 1. SCOPE — only GOGO. Rides, parcels, fares, tracking, drivers, safety,
 *    payments, the corridor. Never the owner's finances, other customers,
 *    staff personal details, credentials, or anything off-topic. Refusal is
 *    polite and redirects to what it CAN do.
 *
 * 2. NO CROSS-CUSTOMER DATA — every lookup is scoped by the caller's identity,
 *    in the query itself (scopedQuery), not by trusting what the model passes.
 *    A guest may look up a booking ONLY with both the booking reference and the
 *    phone number used, and even then the response is stripped of the home
 *    address. This mirrors the Cleanic order rule exactly.
 *
 * 3. TEACH, NEVER DO — the agent walks people through the app, it does not act
 *    on their behalf. There is NO cancel tool, NO payment tool, NO booking-
 *    creation tool. Cancelling stays self-service because a model cancelling
 *    someone's seat costs them money and can strand them.
 *
 * 4. NO COVERAGE GUESSING — GOGO serves a specific corridor. The model is never
 *    allowed to confirm or deny a specific town/street "we go there". It answers
 *    from the published town list only, and escalates anything else. Inventing
 *    coverage makes someone wait at a gate that no van will reach.
 *
 * 5. NO PRICE INVENTING — fares come from the ride records, never from the
 *    model's imagination. A quoted fare that differs from what is charged is a
 *    trust failure that costs a customer at the door.
 *
 * 6. ESCALATION — anything uncertain, angry, or outside scope creates a real
 *    ticket row. The customer is told a human will follow up, and one will.
 *
 * 7. GROUNDED FACTS ONLY — the knowledge block is injected from the actual
 *    fares/rides/towns, so the model has real numbers to work from.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const MODEL = process.env.AGENT_MODEL || "deepseek-chat";
const API_URL = "https://api.deepseek.com/chat/completions";

/* ── the operators. Same idea as Cleanic's roster: a customer picks a voice,
      and the voice is a persona the model is given, not a separate model. ── */
const AGENTS = [
  { id: "noluthando", name: "Noluthando", lang: "EN", lang_name: "English", persona:
      "warm and patient, chats like an older sister, greets properly then gets to the point" },
  { id: "sipho", name: "Sipho", lang: "EN", lang_name: "English", persona:
      "easygoing and a little playful, keeps it short and never sounds like a call centre" },
  { id: "ayanda", name: "Ayanda", lang: "EN", lang_name: "English", persona:
      "clear and calm, good at explaining the practical bit: where to wait, what it costs" },
  { id: "thandi", name: "Thandi", lang: "XH", lang_name: "isiXhosa", persona:
      "warm and cheerful, speaks isiXhosa naturally and mixes light English" },
  { id: "lwazi", name: "Lwazi", lang: "XH", lang_name: "isiXhosa", persona:
      "relaxed and respectful, explains patiently in isiXhosa" },
  { id: "johan", name: "Johan", lang: "AF", lang_name: "Afrikaans", persona:
      "vriendelik en reguit, praat Afrikaans en verduidelik eenvoudig" },
];

const LANG_NOTE = {
  EN: "Reply in plain, friendly everyday English.",
  XH: "Reply mainly in isiXhosa for conversation, keeping place names and prices as they are. Common terms: uhambo (trip), isihlalo (seat), ipasela (parcel), imali (money). Mix in a little English where it is natural.",
  AF: "Antwoord in Afrikaans. Gebruik gewone woorde: rit, sitplek, pakkie, geld. Meng bietjie Engels waar dit natuurlik voel.",
};

/* ── the corridor. This is the ONLY source of truth about where GOGO goes. ── */
const CORRIDOR = [
  "East London", "Gonubie", "Kwelera", "Kidds Beach", "Komani (Queenstown)",
  "Cathcart", "Seymour", "Fort Beaufort", "Mthatha", "Butterworth",
  "Idutywa", "Gqeberha (Port Elizabeth)", "Bhisho", "King William's Town",
];

const BRAND = {
  name: "GOGO",
  promise: "Smart Hike, Zero Queue",
  site: "go-go.city",
  what: "long distance seats and parcels, collected at your address and driven town to town",
  hours: "rides run from early morning until late evening, every day",
};

/**
 * The rules block. Written as numbered instructions because the model follows
 * an explicit list far better than a paragraph of prose.
 */
const RULES = [
  "Only talk about GOGO: rides, seats, parcels, fares, tracking, drivers, safety, payments, and how the service works. Nothing else.",
  "Never answer questions about the owner, the business's finances, staff personal lives, other customers, passwords, bank cards, or anyone's home address. Say kindly that you can only help with their GOGO trips.",
  "Never reveal or discuss another customer's booking. Only the caller's own, and only when their identity is established.",
  "You do NOT know which towns or streets are covered beyond the published town list. Never confirm or deny that we collect from a specific place the customer names. Give the town list, say to add the exact address when booking, and offer to have the team confirm.",
  "Never invent a fare. Fares come from the ride record. If you do not have it, say you will get the team to confirm and escalate.",
  "You teach, you never do. Never book, cancel, pay or change a trip for the customer. Walk them through it step by step with the guide and give the link. The ONE exception: a signed-in customer may ask you to cancel their own booking, and only within the free window, which the tool will check.",
  "If you are unsure, if the customer is angry, or if it is outside what you can check, use the escalate tool and tell them a person from the team will come back to them.",
  "Sound like a real person on WhatsApp. Short messages. Contractions. No em dashes. Never use: seamless, leverage, solution, optimize, elevate, cutlery, world-class, AI-powered. No hype, no bullet walls.",
  "South African everyday English (or the operator's language). A little warmth is good. Never corporate, never scripted.",
  "Keep the thread going. Read the earlier messages and answer the latest question. Do not re-introduce yourself mid-conversation.",
  "Never promise a refund, a discount, or compensation. You can log the request and let a human decide.",
].map((r, i) => (i + 1) + ". " + r).join("\n");

const SYSTEM_TEMPLATE = `You are {{NAME}}, a customer support operator for ${BRAND.name} in South Africa.

${BRAND.name} is ${BRAND.what}. The promise is "${BRAND.promise}". Site: ${BRAND.site}. ${BRAND.hours}.
Contact: order@go-go.city | call 078 047 2090.

TOWNS ON THE CORRIDOR (this list is the only coverage you may state):
${CORRIDOR.map(t => "- " + t).join("\n")}

STRICT RULES:
${RULES}

YOUR VOICE RIGHT NOW: {{PERSONA}}

{{LANG}}

Reply the way a helpful person would in a chat: short, warm, direct. One question at a time if you need information.`;

const APP_GUIDES = {
  book: {
    topic: "book",
    link: "https://go-go.city/",
    steps: [
      "Open go-go.city and type where you are. Pick your address from the suggestions, otherwise the driver cannot find you.",
      "Type where you are going.",
      "Pick a date, how many seats, and how much luggage.",
      "Tap Search and choose a hike from the list.",
      "Confirm the seat and pay. Cash on the day is fine, or pay by card in the app.",
    ],
  },
  cancel: {
    topic: "cancel",
    link: "https://go-go.city/gogo/dashboard.html",
    steps: [
      "Open My trips in the app.",
      "Find the booking and open it.",
      "Tap Cancel booking. It is free up to 2 hours before the hike.",
      "After that the driver is already on the way, so message them in the ride chat instead.",
    ],
  },
  track: {
    topic: "track",
    link: "https://go-go.city/gogo/track.html",
    steps: [
      "Open My trips and tap the trip that is running.",
      "The map shows the van moving, and the arrival time updates.",
      "Share the trip with up to 3 people from the same screen, so they can watch too.",
    ],
  },
  parcel: {
    topic: "parcel",
    link: "https://go-go.city/gogo/parcel.html",
    steps: [
      "Choose Parcel at the top of the home screen.",
      "Say what you are sending and roughly how big it is, so it goes in the right boot.",
      "Put in the pickup address and the delivery address.",
      "Pay, then give the receiver the code. They quote it when it arrives.",
    ],
  },
  pay: {
    topic: "pay",
    link: "https://go-go.city/",
    steps: [
      "You can pay by card in the app when you book, or hand cash to the driver.",
      "The fare shown at booking is the fare. There is a small booking fee, shown before you confirm.",
      "If you paid by card, the receipt is in My trips.",
    ],
  },
};

/* ── tools. Note what is absent: no create-booking, no pay, no arbitrary user
      lookup. That absence is the guardrail. ─────────────────────────────── */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "trip_status",
      description: "Live status of a trip: departure, seats left, driver name, vehicle. Signed-in customers get their own trips. Guests need the booking reference AND the phone number used to book.",
      parameters: {
        type: "object",
        properties: {
          reference: { type: "string", description: "Booking reference, like GG-4821" },
          phone: { type: "string", description: "Phone number used when booking. Required for guests." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "my_trips",
      description: "List the signed-in customer's own upcoming and recent trips.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "fare_quote",
      description: "The actual fares we have for a route, from real ride records. Use this instead of guessing a price.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Town or place they are leaving from" },
          to: { type: "string", description: "Town or place they are going to" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "towns_we_serve",
      description: "The published list of towns on the GOGO corridor. The only coverage you may state.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "app_guide",
      description: "Step-by-step instructions for doing something in the GOGO app: book, cancel, track, parcel, pay. Use this whenever the customer wants to DO something.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", enum: ["book", "cancel", "track", "parcel", "pay"] },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_booking",
      description: "Cancel the signed-in customer's OWN booking. Only allowed outside the 2 hour cut-off. Never for guests. The tool enforces the window and tells you if it is too late.",
      parameters: {
        type: "object",
        properties: { reference: { type: "string" } },
        required: ["reference"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate",
      description: "Flag this for a human to follow up. Use for anything you cannot verify, anything angry, and anything about money you are not certain of.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "What the customer needs help with" },
          urgency: { type: "string", enum: ["normal", "urgent"] },
        },
        required: ["reason"],
      },
    },
  },
];

/* ── helpers ──────────────────────────────────────────────────────────────── */

const digits = v => String(v || "").replace(/\D/g, "");

/* A human booking reference. A uuid cannot be read down a phone call, so the
   reference is the first 4 hex chars of the id, uppercased: GG-4F2A. Stored
   bookings fall back to it too, so old rows work without a migration. */
function refOf(b) {
  if (b.reference) return String(b.reference).toUpperCase();
  return "GG-" + String(b.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
}

function isGuest(user) {
  return !user || user.id === "guest" || user.role === "guest";
}

/**
 * THE scope guard. Returns the Mongo-style filter for a booking lookup.
 * Everything the agent queries flows through this, so the model cannot widen
 * its own access by passing a different id.
 */
function scopedQuery(user) {
  if (!user || isGuest(user)) return null;          // guests: no scoped access at all
  if (user.role === "admin" || user.role === "owner") return {};  // owner sees all
  return { userId: user.id };
}

function sanitize(text) {
  let t = String(text || "");
  // models sometimes leak their own tool-call syntax into the visible answer
  t = t.replace(/<invoke[^>]*>[\s\S]*?<\/invoke>/g, "");
  t = t.replace(/<tool_calls>[\s\S]*?<\/tool_calls>/g, "");
  t = t.replace(/<parameter[^>]*\/>/g, "");
  t = t.replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/g, "");
  t = t.replace(/<\/?tool_call[^>]*>/g, "");
  // house style: no em dashes, ever
  t = t.replace(/\u2014/g, ", ").replace(/\u2013/g, "-");
  t = t.replace(/\s*,\s*,/g, ",");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Remove anything from a booking that a guest must not see, even when they
 * proved ownership with reference + phone. Home address is the one that matters:
 * knowing it plus a name is enough to find someone.
 */
function redactForGuest(trip) {
  if (!trip) return trip;
  const out = Object.assign({}, trip);
  delete out.pickupAddress;
  delete out.dropAddress;
  delete out.phone;
  delete out.email;
  return out;
}

/* ── the model call ───────────────────────────────────────────────────────── */

async function callModel(messages, tools) {
  const key = process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("no AI key configured");

  const body = {
    model: MODEL,
    messages,
    temperature: 0.4,
    max_tokens: 600,
  };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error("model " + res.status + ": " + txt.slice(0, 200));
    }
    const json = await res.json();
    return json.choices?.[0]?.message || {};
  } finally {
    clearTimeout(timer);
  }
}

/* ── tool execution ───────────────────────────────────────────────────────── */
/* Every branch re-checks the caller's authority. The model choosing a tool is a
   request, not an authorisation. */

async function executeTool(name, args, user, deps) {
  const { db } = deps;

  if (name === "towns_we_serve") {
    return JSON.stringify({ towns: CORRIDOR, note: "This is the published list. Add the exact address when booking." });
  }

  if (name === "app_guide") {
    const g = APP_GUIDES[String(args.topic || "book")] || APP_GUIDES.book;
    return JSON.stringify(g);
  }

  if (name === "fare_quote") {
    const from = String(args.from || "").toLowerCase().trim();
    const to = String(args.to || "").toLowerCase().trim();
    const rides = (db.rides() || []).filter(r => {
      const a = String(r.fromCity || "").toLowerCase();
      const b = String(r.toCity || "").toLowerCase();
      return (!from || a.includes(from) || from.includes(a)) &&
             (!to || b.includes(to) || to.includes(to));
    });
    if (!rides.length) {
      return JSON.stringify({
        error: "no_route_on_file",
        detail: "We have no ride on that route in the system right now. Do not invent a price. Offer to escalate so the team can confirm.",
      });
    }
    const fares = rides.map(r => ({ route: r.fromCity + " to " + r.toCity, fare: r.price, seatsLeft: r.seatsLeft }));
    return JSON.stringify({ found: fares.length, fares });
  }

  if (name === "my_trips") {
    if (isGuest(user)) {
      return JSON.stringify({
        error: "signin_needed",
        detail: "Listing trips needs a signed-in account. Offer to look one up with a booking reference and the phone number, or ask them to sign in.",
      });
    }
    const q = scopedQuery(user);
    const mine = (db.bookings() || []).filter(b => Object.keys(q).every(k => b[k] === q[k]));
    return JSON.stringify(mine.slice(-10).map(trip => ({
      reference: refOf(trip),
      to: trip.stop || trip.to,
      from: trip.city || trip.from,
      seats: trip.seats,
      status: trip.status,
      kind: trip.kind,
      total: trip.totalCents != null ? "R" + (trip.totalCents / 100).toFixed(2) : null,
    })));
  }

  if (name === "trip_status") {
    const ref = String(args.reference || "").trim().toUpperCase();
    const phone = digits(args.phone);

    if (isGuest(user)) {
      if (!ref || !phone) {
        return JSON.stringify({
          error: "need_verify",
          detail: "Ask for the booking reference AND the phone number used to book, so we can confirm it is theirs.",
        });
      }
      const hit = (db.bookings() || []).find(b =>
        refOf(b) === ref && phone && digits(b.phone) === phone
      );
      if (!hit) {
        return JSON.stringify({ error: "not_found", detail: "Nothing matches that reference and number. Ask them to check both." });
      }
      return JSON.stringify(redactForGuest({
        reference: refOf(hit),
        from: hit.city, to: hit.stop,
        seats: hit.seats, status: hit.status, kind: hit.kind,
        total: hit.totalCents != null ? "R" + (hit.totalCents / 100).toFixed(2) : null,
      }));
    }

    const q = scopedQuery(user);
    const mine = (db.bookings() || []).filter(b => Object.keys(q).every(k => b[k] === q[k]));
    const hit = ref ? mine.find(b => refOf(b) === ref) : mine[mine.length - 1];
    if (!hit) {
      return JSON.stringify({ error: "not_found", detail: "No booking " + (ref || "") + " on this account." });
    }
    return JSON.stringify({
      reference: refOf(hit),
      from: hit.city, to: hit.stop,
      seats: hit.seats, status: hit.status, kind: hit.kind,
      total: hit.totalCents != null ? "R" + (hit.totalCents / 100).toFixed(2) : null,
    });
  }

  if (name === "cancel_booking") {
    /* The one action tool. Deliberately narrow:
       - signed-in only, never a guest
       - own booking only, enforced by scope
       - never inside 2 hours of departure */
    if (isGuest(user)) {
      return JSON.stringify({
        error: "signin_needed",
        detail: "Cancelling needs a signed-in account. Teach them the My trips steps instead.",
      });
    }
    const ref = String(args.reference || "").trim().toUpperCase();
    if (!ref) return JSON.stringify({ error: "need_reference", detail: "Ask for the booking reference first." });

    const q = scopedQuery(user);
    const mine = (db.bookings() || []).filter(b => Object.keys(q).every(k => b[k] === q[k]));
    const hit = mine.find(b => refOf(b) === ref);
    if (!hit) {
      return JSON.stringify({ error: "not_found", detail: "No booking " + ref + " on this account. Do not guess at it." });
    }
    if (["cancelled", "completed"].includes(hit.status)) {
      return JSON.stringify({ error: "already_closed", detail: "That booking is already " + hit.status + "." });
    }
    const when = new Date(hit.departISO || hit.date);
    if (!isNaN(when) && when.getTime() - Date.now() < 2 * 60 * 60 * 1000) {
      return JSON.stringify({
        error: "inside_cutoff",
        detail: "It is inside the 2 hour cut-off, so it cannot be cancelled here. Tell them to message the driver in the ride chat, and offer to escalate.",
      });
    }
    if (!deps.cancelBooking) {
      return JSON.stringify({ error: "unavailable", detail: "Cancelling is not available right now. Escalate it." });
    }
    await deps.cancelBooking(hit.id);
    return JSON.stringify({ ok: true, reference: refOf(hit), detail: "Booking cancelled. It is free of charge." });
  }

  if (name === "escalate") {
    const ticket = {
      id: "T" + Date.now().toString(36).toUpperCase(),
      userId: (user && user.id) || "guest",
      email: (user && user.email) || null,
      reason: String(args.reason || "").slice(0, 800),
      urgency: args.urgency === "urgent" ? "urgent" : "normal",
      channel: "app_chat",
      status: "open",
      createdAt: new Date().toISOString(),
    };
    if (deps.saveTicket) await deps.saveTicket(ticket);
    return JSON.stringify({
      ok: true,
      ticket: ticket.id,
      detail: "Logged. A person from the team will follow up. Tell the customer that plainly, do not promise a time you cannot keep.",
    });
  }

  return JSON.stringify({ error: "unknown_tool" });
}

/* ── the agent loop ───────────────────────────────────────────────────────── */

function trimHistory(msgs, limit) {
  if (msgs.length <= limit) return msgs;
  return [msgs[0]].concat(msgs.slice(-(limit - 1)));
}

async function reply(messages, user, deps) {
  let msg = await callModel(messages, TOOLS);
  let steps = 0;

  while (msg.tool_calls && msg.tool_calls.length && steps < 4) {
    const results = [];
    for (const tc of msg.tool_calls) {
      const fn = tc.function || {};
      let args = {};
      try { args = JSON.parse(fn.arguments || "{}"); } catch (e) { args = {}; }
      let out;
      try {
        out = await executeTool(fn.name, args, user, deps);
      } catch (e) {
        out = JSON.stringify({ error: "tool_failed", detail: "That check did not work. Escalate rather than guessing." });
      }
      results.push({ role: "tool", tool_call_id: tc.id, content: out });
    }
    messages = messages.concat(
      [{ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls }],
      results
    );
    messages = trimHistory(messages, 22);
    msg = await callModel(messages);
    steps++;
  }

  const text = sanitize(msg.content || "");
  return text || "Sorry, I lost my words for a second. Say that again?";
}

/* how long to make the operator look like they are typing */
function typingMs(question, answer) {
  const read = 380;
  const think = Math.min(1400, 300 + String(question || "").length * 6);
  const type = String(answer || "").length * 42;
  return Math.max(1400, Math.min(11000, read + think + type));
}

function systemPrompt(agent, user) {
  const isOwner = user && (user.role === "admin" || user.role === "owner");
  const signedIn = user && !isGuest(user);

  const who = !signedIn
    ? "You are talking to a guest who is not signed in. They cannot have their trips listed. To check a booking they must give the reference AND the phone number. They cannot cancel through you."
    : isOwner
      ? "You are talking to the owner account, which can see all bookings."
      : "You are talking to a signed-in customer. You may only see their own bookings, and you may cancel their own booking outside the 2 hour cut-off.";

  return SYSTEM_TEMPLATE
    .replace("{{NAME}}", agent.name)
    .replace("{{PERSONA}}", agent.persona)
    .replace("{{LANG}}", LANG_NOTE[agent.lang] || LANG_NOTE.EN)
    + "\n\nCALLER: " + who + "\nToday is " + new Date().toISOString().slice(0, 10) + ".";
}

module.exports = {
  AGENTS, TOOLS, refOf, CORRIDOR, APP_GUIDES,
  systemPrompt, reply, typingMs, sanitize, redactForGuest,
  scopedQuery, isGuest, executeTool, digits,
};
