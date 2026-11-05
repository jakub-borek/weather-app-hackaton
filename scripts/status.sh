#!/bin/bash
# Stan zespołu: feature'y, ostatnie commity, wpisy z journali, decyzje i blokery.
# Tylko odczyt. Uruchamiany przez hook SessionStart w Claude Code i przez ./init.sh.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 0
JOURNAL_DIR="harness/journal"

journal_files() {
  for file in "$JOURNAL_DIR"/*.md; do
    [ -e "$file" ] || continue
    [ "$(basename "$file")" = "README.md" ] && continue
    echo "$file"
  done
}

# Wpisy z danym tagiem ze wszystkich journali, posortowane po czasie: "<osoba> <data> <godzina> [TAG] ..."
tagged_entries() {
  local pattern="$1" limit="$2" files
  files="$(journal_files)"
  [ -n "$files" ] || return 0
  # shellcheck disable=SC2086 # nazwy plików to slugi bez spacji
  grep -HE "$pattern" $files 2>/dev/null \
    | sed -E 's#^.*/([^/]+)\.md:- #\1 #' \
    | sort -k2,3 \
    | tail -n "$limit"
}

echo "=== Stan zespołu ($(date '+%H:%M')) ==="

echo
echo "--- Feature'y ---"
if command -v node >/dev/null 2>&1 && [ -f feature_list.json ]; then
  node -e '
const features = require("./feature_list.json").features;
const byId = Object.fromEntries(features.map((f) => [f.id, f]));
const order = { "in-progress": 0, blocked: 1, "not-started": 2, done: 3 };
const sorted = [...features].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
for (const f of sorted) {
  console.log([f.id.padEnd(4), f.status.padEnd(12), (f.owner || "-").padEnd(12), (f.stream || "").padEnd(3), (f.priority || "").padEnd(7), f.name].join(" "));
}
const done = features.filter((f) => f.status === "done").length;
const ready = features.filter((f) => f.status === "not-started" && (f.dependencies || []).every((d) => byId[d]?.status === "done"));
console.log(`\nGotowe: ${done}/${features.length}. Można brać teraz: ${ready.map((f) => f.id).join(", ") || "-"}`);
' || echo "(nie udało się odczytać feature_list.json)"
else
  echo "(brak node albo feature_list.json)"
fi

echo
echo "--- Ostatnie commity ---"
git log -n 10 --date=format:%H:%M --pretty='%h %ad %<(14,trunc)%an %s' 2>/dev/null || echo "(brak commitów)"

echo
echo "--- Ostatnie wpisy w journalach ---"
FILES="$(journal_files)"
if [ -z "$FILES" ]; then
  echo "(jeszcze nikt nic nie zapisał)"
else
  for file in $FILES; do
    echo "[$(basename "$file" .md)]"
    grep -E '^- ' "$file" | tail -n 3
  done
fi

echo
echo "--- Decyzje (ostatnie 8) ---"
tagged_entries '\[DECYZJA\]' 8

echo
echo "--- Blokery i odblokowania (ostatnie 6) ---"
tagged_entries '\[(BLOKER|ODBLOK)\]' 6

echo
echo "--- Niezacommitowane zmiany lokalnie ---"
CHANGES="$(git status --short 2>/dev/null | head -n 10)"
echo "${CHANGES:-(brak)}"

echo
echo "Pamiętaj: git pull --rebase przed pracą. Zapis do journala: ./scripts/log.sh TAG \"opis\""
exit 0
