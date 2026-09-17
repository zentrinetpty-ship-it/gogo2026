#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# GOGO — database setup
#
# Creates the gogo role and database, then loads the schema. Safe to re-run:
# the schema is all CREATE IF NOT EXISTS, and the role is created only if
# missing.
#
# Run inside WSL:   wsl -d Ubuntu -u root -- bash /mnt/c/Users/Administrator/gogo/db/setup.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

service postgresql start >/dev/null 2>&1 || true
sleep 2

DB_NAME="gogo"
DB_USER="gogo"
DB_PASS="gogo"

# ── the role ───────────────────────────────────────────────────────────────
su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | grep -q 1 \
  || su postgres -c "psql -c \"CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}'\""
echo "[db] role ${DB_USER} ready"

# ── the database ───────────────────────────────────────────────────────────
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1 \
  || su postgres -c "createdb -O ${DB_USER} ${DB_NAME}"
echo "[db] database ${DB_NAME} ready"

# gen_random_uuid() lives in pgcrypto on older builds; it is built in on 13+,
# but the extension is cheap and makes the schema portable.
su postgres -c "psql -d ${DB_NAME} -q -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto'"

# ── the schema ─────────────────────────────────────────────────────────────
SCHEMA="$(dirname "$0")/schema.sql"
su postgres -c "psql -d ${DB_NAME} -q -f ${SCHEMA}"
echo "[db] schema loaded"

# ── show what we have ──────────────────────────────────────────────────────
su postgres -c "psql -d ${DB_NAME} -c '\dt'" | head -20

# listen on all interfaces so the Windows-side Node process can reach it.
# WSL2 forwards localhost, but only if postgres is not bound to the unix
# socket alone.
PG_CONF="/etc/postgresql/18/main/postgresql.conf"
if ! grep -qE "^listen_addresses\s*=\s*'\*'" "$PG_CONF"; then
  sed -i "s/^#\?listen_addresses.*/listen_addresses = '*'/" "$PG_CONF"
  echo "[db] listen_addresses set to *"
fi

HBA="/etc/postgresql/18/main/pg_hba.conf"
if ! grep -q "host all all 0.0.0.0/0 md5" "$HBA"; then
  echo "host all all 0.0.0.0/0 md5" >> "$HBA"
  echo "[db] granted password auth from the host"
fi

service postgresql restart >/dev/null 2>&1 || true
sleep 2
echo "[db] restarted and ready on 5432"
