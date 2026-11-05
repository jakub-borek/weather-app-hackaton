#!/bin/bash
# Stawia marketplace od zera: Postgres + Redis, .env, zależności, migracje, seed i konto admina.
# Użycie: ./scripts/setup-marketplace.sh [--reset]
#   --reset  kasuje dane w lokalnym Postgresie z docker-compose.yml i seeduje od nowa
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
API="$ROOT/marketplace/packages/api"
DB_URL="postgres://postgres:postgres@localhost:5432/mercur"

cd "$ROOT"
if [ "${1:-}" = "--reset" ]; then
  echo "=== Reset: kasuję lokalną bazę (docker compose down -v) ==="
  docker compose down -v
fi

echo "=== Postgres i Redis ==="
docker compose up -d --wait

if [ ! -f "$API/.env" ]; then
  echo "=== Tworzę packages/api/.env z .env.template ==="
  sed "s#^DATABASE_URL=.*#DATABASE_URL=$DB_URL#" "$API/.env.template" > "$API/.env"
fi

if [ ! -d "$ROOT/marketplace/node_modules" ]; then
  echo "=== bun install ==="
  (cd "$ROOT/marketplace" && bun install)
fi

cd "$API"
echo "=== Migracje ==="
bunx medusa db:migrate
echo "=== Seed: elektronika, sprzedawcy, oferty ==="
bun run seed
echo "=== Seed: konta Grok Botów (negocjator@example.com / supersecret) ==="
bun run seed:agents
echo "=== Admin: admin@example.com / supersecret ==="
bunx medusa user -e admin@example.com -p supersecret || echo "Admin już istnieje, pomijam."

echo
echo "Gotowe. Start: cd marketplace && bun run dev"
echo "API :9000, panel admina :9000/dashboard, panel sprzedawcy :9000/seller"
