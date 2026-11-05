#!/usr/bin/env bash
# F02: czysta baza + seed RFQ jedną komendą. SZKIC przed F01.
# Po F01 skopiuj do marketplace/packages/api/scripts/db-reset.sh i dodaj w jego package.json:
#   "seed:rfq": "medusa exec ./src/scripts/seed-rfq.ts",
#   "db:reset": "bash ./scripts/db-reset.sh"
# Uwaga: kasuje bazę z DATABASE_URL. Tylko lokalnie.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Brak .env w $(pwd). Skopiuj .env.template i ustaw DATABASE_URL." >&2
  exit 1
fi
set -a; . ./.env; set +a
: "${DATABASE_URL:?DATABASE_URL nie ustawiony w .env}"

case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "DATABASE_URL nie wskazuje na localhost, przerywam." >&2; exit 1 ;;
esac

DB_NAME="${DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
SERVER_URL="${DATABASE_URL%/*}/postgres"

DROP_SQL="DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);"
echo "Kasuję bazę \"$DB_NAME\"..."
if command -v psql >/dev/null 2>&1; then
  psql "$SERVER_URL" -v ON_ERROR_STOP=1 -c "$DROP_SQL"
else
  # Bez psql na hoście: przez kontener z docker-compose.yml w roocie repo.
  docker exec rfq-postgres psql -U postgres -v ON_ERROR_STOP=1 -c "$DROP_SQL"
fi

echo "Tworzę bazę i migracje..."
npx medusa db:setup --db "$DB_NAME"

echo "Seed RFQ..."
npx medusa exec ./src/scripts/seed-rfq.ts

echo "Admin: admin@example.com / supersecret"
npx medusa user -e admin@example.com -p supersecret
