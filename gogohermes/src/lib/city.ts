"use client";

/* =========================================================================
   Two different "cities", and keeping them apart.

   A rider has a HOME city — where they signed up, where they usually travel
   from. They also have a BOOKING city — the town of whatever pick-up address
   they just typed. These are not the same value and must never overwrite each
   other by accident.

     homeCity     changes only when the rider changes it (signup, or Settings)
     bookingCity  changes every time a different pick-up address resolves

   The failure this prevents: someone signs up in East London, books a one-off
   trip from Mthatha to visit family, and comes home to find the whole app has
   silently decided they live in Mthatha. The landing page follows the booking
   city for that session; the home city stays put until they say otherwise.

   Stored separately for exactly that reason — one key would let a booking
   overwrite a home, and there would be no way to tell which one you were
   reading.
   ========================================================================= */

export type CityState = {
  homeCity: string | null;
  bookingCity: string | null;
};

const HOME_KEY = "gogo_home_city";
const BOOKING_KEY = "gogo_booking_city";
const CHANGE_EVENT = "gogo-city-change";

function read(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* a blocked store just means the choice is not remembered — not an error */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function getHomeCity(): string | null {
  return read(HOME_KEY);
}

export function getBookingCity(): string | null {
  return read(BOOKING_KEY);
}

/** Set at signup from the address the rider registered with. */
export function setHomeCity(city: string | null) {
  write(HOME_KEY, city);
}

/**
 * Set whenever a pick-up address resolves to a town.
 *
 * Deliberately does NOT touch homeCity. A booking is a journey, not a move —
 * and if the rider really has moved, that is a decision they make in Settings,
 * not something the app infers from one trip.
 */
export function setBookingCity(city: string | null) {
  write(BOOKING_KEY, city);
}

/**
 * The city the landing page should show.
 *
 * Booking city wins for the session, because it is the most recent thing the
 * rider told us and it is what the next search will use. Home city is the
 * fallback — a returning rider with no address typed yet still sees their own
 * town rather than a national list.
 */
export function getActiveCity(): string | null {
  return getBookingCity() || getHomeCity();
}

/** Subscribe to changes, so a page can re-read without polling. */
export function onCityChange(fn: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, fn);
  window.addEventListener("storage", fn); // fires across tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

/**
 * "Has this rider effectively moved?" — used to OFFER a home-city change, never
 * to make one. If they book from a new town repeatedly this returns true and
 * the UI can ask; it must not act on its own.
 */
export function shouldOfferHomeCityChange(bookingCity: string | null): boolean {
  const home = getHomeCity();
  return Boolean(bookingCity && home && bookingCity !== home);
}
