#!/bin/bash
# Dopisuje wpis do twojego journala: harness/journal/<twoj-git-user>.md
# Użycie: ./scripts/log.sh TAG "opis"
# Inna nazwa journala: HARNESS_USER=jakub ./scripts/log.sh TAG "opis"
set -euo pipefail

TAGS="START KROK DECYZJA BLOKER ODBLOK PROMPT DONE NOTE"
ROOT="$(git rev-parse --show-toplevel)"

TAG="$(printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]')"
shift || true
MSG="$*"

if [ -z "$TAG" ] || [ -z "$MSG" ]; then
  echo "Użycie: $0 TAG \"opis\"   (TAG: $TAGS)" >&2
  exit 1
fi
case " $TAGS " in
  *" $TAG "*) ;;
  *) echo "Nieznany TAG: $TAG (dozwolone: $TAGS)" >&2; exit 1 ;;
esac

NAME="${HARNESS_USER:-$(git config user.name || echo unknown)}"
ASCII="$(printf '%s' "$NAME" | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null)" || ASCII="$NAME"
SLUG="$(printf '%s' "$ASCII" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed -E 's/^-+//; s/-+$//')"
[ -n "$SLUG" ] || SLUG="unknown"

FILE="$ROOT/harness/journal/$SLUG.md"
mkdir -p "$(dirname "$FILE")"
[ -f "$FILE" ] || printf '# Journal: %s\n\n' "$NAME" > "$FILE"

COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo brak)"
BRANCH="$(git branch --show-current 2>/dev/null || echo '?')"
LINE="- $(date '+%Y-%m-%d %H:%M') [$TAG] $MSG _(${BRANCH}@${COMMIT})_"

printf '%s\n' "$LINE" >> "$FILE"
echo "Zapisano w ${FILE#"$ROOT"/}: $LINE"
