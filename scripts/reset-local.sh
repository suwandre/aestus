#!/usr/bin/env sh
# reset-local.sh — destroy all local Docker volumes for Aestus infra
#
# This script is DESTRUCTIVE. All database contents, Redis AOF, NATS streams,
# and ClickHouse data will be permanently deleted.
#
# Usage:
#   ./scripts/reset-local.sh --confirm
#
# The --confirm flag is required. Without it the script exits with an error.
# This prevents accidental data loss when called from Make or other scripts.

set -e

COMPOSE="docker compose -f infra/docker-compose.yml"

if [ "$1" != "--confirm" ]; then
  echo ""
  echo "ERROR: reset-local requires explicit confirmation."
  echo ""
  echo "  This will permanently delete all local Aestus data:"
  echo "    - Postgres database (aestus)"
  echo "    - Redis AOF data"
  echo "    - NATS JetStream streams and messages"
  echo "    - ClickHouse tables and data"
  echo ""
  echo "  To proceed, run:"
  echo "    ./scripts/reset-local.sh --confirm"
  echo ""
  exit 1
fi

echo "Stopping containers..."
$COMPOSE down --volumes --remove-orphans

echo ""
echo "Local volumes removed. Run 'make up' (or docker compose up -d) to start fresh."
