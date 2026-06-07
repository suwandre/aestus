#!/usr/bin/env sh
# infra-health.sh — check connectivity to all local infra dependencies
# Usage: ./scripts/infra-health.sh
# Exits 0 only when all four services respond.

set -e

PASS="[PASS]"
FAIL="[FAIL]"

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-aestus}"
POSTGRES_DB="${POSTGRES_DB:-aestus}"

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

CLICKHOUSE_HOST="${CLICKHOUSE_HOST:-localhost}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-8123}"

NATS_HOST="${NATS_HOST:-localhost}"
NATS_MONITOR_PORT="${NATS_MONITOR_PORT:-8222}"

all_pass=true

# ── NATS ──────────────────────────────────────────────────────────────────────
if wget -qO- "http://$NATS_HOST:$NATS_MONITOR_PORT/healthz" 2>/dev/null | grep -q "ok"; then
  echo "$PASS NATS JetStream  http://$NATS_HOST:$NATS_MONITOR_PORT/healthz"
else
  echo "$FAIL NATS JetStream  http://$NATS_HOST:$NATS_MONITOR_PORT/healthz (not reachable)"
  all_pass=false
fi

# ── Redis ─────────────────────────────────────────────────────────────────────
if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q "PONG"; then
  echo "$PASS Redis           $REDIS_HOST:$REDIS_PORT"
else
  echo "$FAIL Redis           $REDIS_HOST:$REDIS_PORT (not reachable or redis-cli not installed)"
  all_pass=false
fi

# ── Postgres ──────────────────────────────────────────────────────────────────
if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q 2>/dev/null; then
  echo "$PASS Postgres        $POSTGRES_HOST:$POSTGRES_PORT db=$POSTGRES_DB user=$POSTGRES_USER"
else
  echo "$FAIL Postgres        $POSTGRES_HOST:$POSTGRES_PORT (not reachable or pg_isready not installed)"
  all_pass=false
fi

# ── ClickHouse ────────────────────────────────────────────────────────────────
if wget -qO- "http://$CLICKHOUSE_HOST:$CLICKHOUSE_PORT/ping" 2>/dev/null | grep -q "Ok"; then
  echo "$PASS ClickHouse      http://$CLICKHOUSE_HOST:$CLICKHOUSE_PORT/ping"
else
  echo "$FAIL ClickHouse      http://$CLICKHOUSE_HOST:$CLICKHOUSE_PORT/ping (not reachable)"
  all_pass=false
fi

echo ""
if $all_pass; then
  echo "All dependencies healthy."
  exit 0
else
  echo "One or more dependencies are not reachable. Run: docker compose -f infra/docker-compose.yml up -d"
  exit 1
fi
