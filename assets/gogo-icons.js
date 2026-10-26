/* ── GOGO line icons ──────────────────────────────────────────────────────
   One place for the icon set, matching the React landing's lucide icons: same
   24 viewBox, same 1.75 stroke, round caps, currentColor so they inherit text
   colour. Emoji were rendering as full-colour glyphs that clashed with the
   lime-on-charcoal palette and looked different on every phone.

   Usage in a template literal:  ${GICON("van")}
   Sized by CSS (.g-ic svg, .g-btn svg), so markup stays colour-free. */
(function () {
  const P = {
    van: '<path d="M3 16.5V8.2a1.6 1.6 0 0 1 1.6-1.6h8.6l4.6 3.9h2.6a1.6 1.6 0 0 1 1.6 1.6v4.4"/><path d="M3 16.5h1.6"/><path d="M9.4 16.5h5.2"/><path d="M18.6 16.5H21"/><circle cx="7" cy="17.4" r="1.9"/><circle cx="16.6" cy="17.4" r="1.9"/><path d="M4.6 11.6h5.4"/>',
    parcel: '<path d="M20.4 8.6v6.8a1.4 1.4 0 0 1-.74 1.24l-7 3.5a1.5 1.5 0 0 1-1.32 0l-7-3.5A1.4 1.4 0 0 1 3.6 15.4V8.6"/><path d="M3.9 8.1 12 3.9l8.1 4.2-8.1 4.1Z"/><path d="M12 12.2V20"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.6 15.6 4.4 4.4"/>',
    pin: '<path d="M12 21s6.6-6.2 6.6-11a6.6 6.6 0 1 0-13.2 0c0 4.8 6.6 11 6.6 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    route: '<circle cx="5.6" cy="18.4" r="2.1"/><circle cx="18.4" cy="5.6" r="2.1"/><path d="M8 18.4h5.2a3.2 3.2 0 0 0 0-6.4h-2.4a3.2 3.2 0 0 1 0-6.4H16"/>',
    shield: '<path d="M12 3.2 5 6v5.8c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6Z"/><path d="m9 12 2.2 2.2L15.4 10"/>',
    lock: '<rect x="4.6" y="10.6" width="14.8" height="9.4" rx="2.2"/><path d="M8.2 10.6V7.8a3.8 3.8 0 0 1 7.6 0v2.8"/>',
    key: '<circle cx="8.4" cy="15.6" r="3.6"/><path d="m11.2 12.8 8-8"/><path d="m16.4 7.6 2 2"/><path d="m14.4 9.6 2 2"/>',
    chat: '<path d="M20.5 12a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.4-.65L4 21l1.2-4.2A8.5 8.5 0 1 1 20.5 12Z"/>',
    receipt: '<path d="M6 3.6h12v16.8l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4Z"/><path d="M9 8.4h6"/><path d="M9 12h6"/>',
    seat: '<path d="M7.4 4.4v8.2a2 2 0 0 0 2 2h4.2"/><path d="M5.6 14.6h9.8a1.6 1.6 0 0 1 1.6 1.6v3.4"/><path d="M17 19.6H9.2"/>',
    compass: '<circle cx="12" cy="12" r="8.4"/><path d="m15.2 8.8-1.8 4.6-4.6 1.8 1.8-4.6Z"/>',
    phone: '<path d="M6.4 3.8h3l1.4 3.6-2 1.4a11 11 0 0 0 5.4 5.4l1.4-2 3.6 1.4v3a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.4 6a2 2 0 0 1 2-2.2Z"/>',
    ticket: '<path d="M4 8.4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.4a2.2 2.2 0 0 0 0 4.4v1.4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.4a2.2 2.2 0 0 0 0-4.4Z"/><path d="M13.4 8.4v7.2"/>',
    clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/>',
    check: '<path d="m5 12.6 4.6 4.6L19 6.8"/>',
    cross: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    send: '<path d="M20.6 3.4 3.8 9.8l6.2 2.4 2.4 6.2Z"/><path d="M20.6 3.4 10 12.2"/>',
    trash: '<path d="M4.6 7h14.8"/><path d="M9.2 7V4.8h5.6V7"/><path d="M6.6 7l.9 12.2h9l.9-12.2"/>',
    flag: '<path d="M6 21V4.2"/><path d="M6 4.8h10.4l-1.7 3.4 1.7 3.4H6"/>',
    card: '<rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2.4"/><path d="M3.4 9.8h17.2"/><path d="M7 14.4h3.4"/>',
    mobile: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.4"/><path d="M11 18.2h2"/>',
    label: '<path d="M4 6.4A2.4 2.4 0 0 1 6.4 4h6.2l7.4 7.4a1.6 1.6 0 0 1 0 2.3l-5.3 5.3a1.6 1.6 0 0 1-2.3 0L4 11.6Z"/><circle cx="8.6" cy="8.6" r="1.3"/>',
    luggage: '<rect x="5.4" y="7.6" width="13.2" height="11.4" rx="2.2"/><path d="M9.4 7.6V5.4a2 2 0 0 1 2-2h1.2a2 2 0 0 1 2 2v2.2"/><path d="M9.6 19v1.8"/><path d="M14.4 19v1.8"/>',
    person: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
    stop: '<circle cx="12" cy="12" r="8.4"/><rect x="9.4" y="9.4" width="5.2" height="5.2" rx="1"/>',
    calc: '<rect x="5" y="3.4" width="14" height="17.2" rx="2.2"/><path d="M8.6 7.4h6.8"/><path d="M8.6 12h.01"/><path d="M12 12h.01"/><path d="M15.4 12h.01"/><path d="M8.6 15.8h.01"/><path d="M12 15.8h.01"/><path d="M15.4 15.8h.01"/>',
    speaker: '<path d="M4.4 9.4h3l4.4-3.6v12.4l-4.4-3.6h-3Z"/><path d="M16 9.2a4 4 0 0 1 0 5.6"/>',
  };
  window.GICON = function (name, cls) {
    const body = P[name];
    if (!body) return "";
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  };
})();
