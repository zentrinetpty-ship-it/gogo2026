-- ═══════════════════════════════════════════════════════════════════════════
-- GOGO — SCHEMA
--
-- Everything that must be trusted lives here. The browser is a view onto this
-- data, never a source of it: prices, seats, payments and accounts are all
-- decided server-side and written through the API.
--
-- Money is stored in INTEGER CENTS throughout. Floats and money do not mix —
-- 19.99 * 3 is 59.97000000000001 in binary floating point, and a cent that
-- drifts is a cent somebody argues about.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── people ─────────────────────────────────────────────────────────────────
-- One table for riders and drivers. A person can be both, which is the norm
-- for this kind of service, so `is_driver` is a flag rather than a separate
-- table. Role is what they are ACTING as on a given action.
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  name          TEXT NOT NULL DEFAULT '',

  -- The password never arrives here. The client derives PBKDF2-SHA256 with a
  -- per-user random salt, then the server derives AGAIN over that with its own
  -- pepper before storing. So a database leak alone does not expose passwords,
  -- and the plaintext never crosses the network. See auth.js.
  pw_salt       TEXT NOT NULL,
  pw_hash       TEXT NOT NULL,
  pw_iter       INTEGER NOT NULL DEFAULT 150000,

  is_driver     BOOLEAN NOT NULL DEFAULT FALSE,
  verified      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ,

  -- a driver's public-facing details, only meaningful when is_driver
  vehicle       TEXT,
  plate         TEXT,
  colour        TEXT,
  rating_sum    INTEGER NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone) WHERE phone IS NOT NULL;

-- ── sessions ───────────────────────────────────────────────────────────────
-- A session is a random token. The token itself is NEVER stored — only its
-- SHA-256. So a database leak cannot be replayed as a login.
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_live_idx ON sessions (token_hash) WHERE revoked_at IS NULL;

-- ── rides ──────────────────────────────────────────────────────────────────
-- A ride is a driver's published trip. The seeded sample rides live here too,
-- flagged so they can be told apart from real ones.
CREATE TABLE IF NOT EXISTS rides (
  id            TEXT PRIMARY KEY,             -- g1, g2, or a uuid for new ones
  driver_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  driver_name   TEXT NOT NULL DEFAULT 'Verified driver',
  origin        TEXT NOT NULL,
  destination   TEXT NOT NULL,
  depart_at     TIMESTAMPTZ,
  depart_label  TEXT,                          -- "06:30", for display
  vehicle       TEXT,
  plate         TEXT,
  colour        TEXT,
  seats_total   INTEGER NOT NULL CHECK (seats_total > 0),
  is_sample     BOOLEAN NOT NULL DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'full', 'departed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rides_open_idx ON rides (status, origin, destination);

-- ── fare legs ──────────────────────────────────────────────────────────────
-- Where a ride stops and what it costs to get off there. This is the ONLY
-- place a fare exists. The client may not send one.
CREATE TABLE IF NOT EXISTS ride_legs (
  ride_id   TEXT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  stop      TEXT NOT NULL,
  fare_cents INTEGER NOT NULL CHECK (fare_cents >= 0),
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ride_id, stop)
);

-- ── bookings ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id       TEXT NOT NULL REFERENCES rides(id) ON DELETE RESTRICT,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,

  kind          TEXT NOT NULL DEFAULT 'passenger'
                CHECK (kind IN ('passenger', 'parcel')),
  seat_count    INTEGER NOT NULL DEFAULT 0,
  stop          TEXT,
  kg            NUMERIC(6,2),

  pickup        TEXT NOT NULL DEFAULT '',
  suburb        TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',

  -- The server's own arithmetic, stored at the moment of booking. An old
  -- booking is never re-priced when fees change, which is what fee_version
  -- is for.
  fare_cents    INTEGER NOT NULL DEFAULT 0,
  pickup_cents  INTEGER NOT NULL DEFAULT 0,
  platform_cents INTEGER NOT NULL DEFAULT 0,
  total_cents   INTEGER NOT NULL DEFAULT 0,
  fee_version   INTEGER NOT NULL DEFAULT 1,

  pay_method    TEXT NOT NULL DEFAULT 'card' CHECK (pay_method IN ('card', 'cash')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined',
                                  'completed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_ride_idx ON bookings (ride_id, status);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, created_at DESC);

-- ── payments ───────────────────────────────────────────────────────────────
-- One row per money movement. Never edited — a correction is a new row, so the
-- history stays intact and a tampered client cannot erase a debt.
CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID REFERENCES bookings(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  method        TEXT NOT NULL CHECK (method IN ('card', 'cash')),
  kind          TEXT NOT NULL,   -- fare, pickup_fee, platform_fee, refund, cash_held
  amount_cents  INTEGER NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_booking_idx ON payments (booking_id);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id, created_at DESC);

-- ── messages ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    TEXT REFERENCES rides(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_ride_idx ON messages (ride_id, created_at);

-- ── safety reports ─────────────────────────────────────────────────────────
-- Evidence. Write-only from the client's point of view: a report cannot be
-- edited or deleted by the person who filed it.
CREATE TABLE IF NOT EXISTS reports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    TEXT,
  reporter   UUID REFERENCES users(id) ON DELETE SET NULL,
  about_user UUID REFERENCES users(id) ON DELETE SET NULL,
  reason     TEXT NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── audit ──────────────────────────────────────────────────────────────────
-- Every refusal worth knowing about: a tampered price, a forged session, a
-- seat grab. This is how you find out someone is probing the system.
CREATE TABLE IF NOT EXISTS audit (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind        TEXT NOT NULL,
  user_id     UUID,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS audit_kind_idx ON audit (kind, at DESC);
