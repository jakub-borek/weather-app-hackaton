#!/usr/bin/env bash
# Udostępnia lokalny Mercur przez tunel ngrok: API, panel admina (/dashboard) i panel
# sprzedawcy (/seller) pod jednym publicznym adresem HTTPS. Opis: docs/share-ngrok.md
#
#   ./scripts/share-marketplace.sh            tunel + build paneli pod publiczny URL + linki
#   ./scripts/share-marketplace.sh --rebuild  to samo, ale panele budowane od nowa
#   ./scripts/share-marketplace.sh --stop     zatrzymuje tunel i usuwa build paneli
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP="$ROOT/marketplace"
API_PORT=9000
API_LOCAL="http://localhost:$API_PORT"
NGROK_API="http://127.0.0.1:4040/api/tunnels"
NGROK_LOG="$ROOT/ngrok.log"   # ignorowany przez *.log w .gitignore
VITE_DEV_PORTS="7010 7001"    # admin, vendor (apps/*/package.json)
PANELS="admin vendor"

die() { echo "BŁĄD: $*" >&2; exit 1; }

# Publiczny URL tunelu na API_PORT albo pusty string, gdy tunel nie działa.
tunnel_url() {
  curl -s "$NGROK_API" 2>/dev/null | PORT="$API_PORT" node -e '
    let s = ""
    process.stdin.on("data", d => (s += d)).on("end", () => {
      try {
        const t = JSON.parse(s).tunnels.find(
          t => t.proto === "https" && t.config.addr.endsWith(":" + process.env.PORT))
        console.log(t ? t.public_url : "")
      } catch { console.log("") }
    })'
}

if [ "${1:-}" = "--stop" ]; then
  pkill -f "ngrok http $API_PORT" && echo "Tunel zatrzymany." || echo "Tunel nie działał."
  # Build ma wpisany adres martwego tunelu, więc lokalnie by nie działał.
  for app in $PANELS; do rm -rf "$MP/apps/$app/dist"; done
  echo "Build paneli usunięty. Lokalnie panele dają: cd marketplace && bun run dev"
  exit 0
fi
REBUILD=0; [ "${1:-}" = "--rebuild" ] && REBUILD=1

command -v ngrok >/dev/null || die "brak ngrok. brew install ngrok, potem: ngrok config add-authtoken <token> (https://dashboard.ngrok.com/get-started/your-authtoken)"
curl -sf "$API_LOCAL/health" >/dev/null || die "backend nie odpowiada na :$API_PORT. Odpal: cd marketplace/packages/api && bun run dev"

for p in $VITE_DEV_PORTS; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "UWAGA: na :$p działa serwer Vite (pełne 'bun run dev' z turbo). Backend proxuje wtedy panel do Vite"
    echo "       zamiast serwować build, a Vite przez ngrok blokuje obcy host i zjada limit requestów."
    echo "       Do udostępniania odpal sam backend: cd marketplace/packages/api && bun run dev"
  fi
done

URL="$(tunnel_url)"
if [ -z "$URL" ]; then
  echo "=== Startuję ngrok http $API_PORT (log: ngrok.log) ==="
  nohup ngrok http "$API_PORT" --log stdout --log-format logfmt > "$NGROK_LOG" 2>&1 &
  for _ in $(seq 1 30); do
    URL="$(tunnel_url)"; [ -n "$URL" ] && break; sleep 0.5
  done
  [ -n "$URL" ] || { tail -5 "$NGROK_LOG" >&2; die "ngrok nie wystartował, log wyżej (brak authtokena? limit 3 agentów?)"; }
else
  echo "=== Tunel już działa ==="
fi

# Panele mają adres backendu wpisany przy buildzie (__BACKEND_URL__ z MERCUR_BACKEND_URL),
# więc budujemy je pod publiczny URL. Backend serwuje apps/<panel>/dist, gdy Vite nie działa.
build_panel() {
  local app="$1"
  local stamp="$MP/apps/$app/dist/.backend-url"
  if [ "$REBUILD" = 0 ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$URL" ]; then
    echo "Panel $app już zbudowany pod $URL"
    return
  fi
  echo "=== Buduję panel $app pod $URL ==="
  (cd "$MP/apps/$app" && MERCUR_BACKEND_URL="$URL" "$MP/node_modules/.bin/vite" build --logLevel error)
  echo "$URL" > "$stamp"
}
pids=""
for app in $PANELS; do build_panel "$app" & pids="$pids $!"; done
for pid in $pids; do wait "$pid" || die "build panelu się nie udał, log wyżej"; done

# Klucz publiczny do Store API (nie jest tajny, i tak trafia do przeglądarki).
PK="$(API="$API_LOCAL" node -e '
  (async () => {
    const auth = await fetch(process.env.API + "/auth/user/emailpass", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "supersecret" }),
    }).then(r => r.json())
    const keys = await fetch(process.env.API + "/admin/api-keys?type=publishable&limit=1", {
      headers: { authorization: "Bearer " + auth.token },
    }).then(r => r.json())
    console.log(keys.api_keys?.[0]?.token ?? "")
  })().catch(() => console.log(""))')"

cat <<EOF

==================================================================
Mercur publicznie: $URL

  Panel admina:      $URL/dashboard   admin@example.com / supersecret
  Panel sprzedawcy:  $URL/seller      techhurt@example.com / supersecret
                                      (też laptopol@, istacja@example.com)
  Store API:         $URL/store/...   nagłówek x-publishable-api-key: ${PK:-<brak, sprawdź seed>}
  Vendor/Admin API:  $URL/vendor/...  $URL/admin/...

Pierwsze wejście w przeglądarce pokazuje ekran ngrok "You are about to visit": kliknij Visit.
Inspektor ruchu: http://127.0.0.1:4040    Stop: ./scripts/share-marketplace.sh --stop
==================================================================
EOF
