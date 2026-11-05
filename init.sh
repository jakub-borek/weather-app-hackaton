#!/bin/bash
# Szybka weryfikacja środowiska i repo. Uruchamiaj na starcie sesji i przed każdym push.
# Testów automatycznych nie uruchamiamy (hackathon). Tu są tylko szybkie checki.
set -e
cd "$(dirname "$0")"

echo "=== Harness: init ==="

# 1. Narzędzia
for tool in git node; do
  command -v "$tool" >/dev/null 2>&1 || { echo "BŁĄD: brak $tool"; exit 1; }
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "BŁĄD: potrzebny Node >= 20 (masz $(node -v))"
  exit 1
fi
echo "OK narzędzia: git, node $(node -v)"

# 2. feature_list.json: statusy, zależności, owner przy in-progress, evidence przy done
node -e '
const features = require("./feature_list.json").features;
const ids = features.map((f) => f.id);
const known = new Set(ids);
const statuses = ["not-started", "in-progress", "blocked", "done"];
const errors = [
  ...(known.size !== ids.length ? ["zduplikowane id feature"] : []),
  ...features.flatMap((f) => [
    ...(statuses.includes(f.status) ? [] : [`${f.id}: nieznany status "${f.status}"`]),
    ...(f.dependencies || []).filter((d) => !known.has(d)).map((d) => `${f.id}: nieznana zależność ${d}`),
    ...(f.status === "done" && !f.evidence ? [`${f.id}: status done bez evidence`] : []),
    ...(f.status === "in-progress" && !f.owner ? [`${f.id}: in-progress bez ownera`] : []),
  ]),
];
const inProgress = features.filter((f) => f.status === "in-progress" && f.owner);
for (const owner of new Set(inProgress.map((f) => f.owner))) {
  const mine = inProgress.filter((f) => f.owner === owner).map((f) => f.id);
  if (mine.length > 1) console.log(`UWAGA: ${owner} ma kilka feature w toku: ${mine.join(", ")} (one feature at a time)`);
}
if (errors.length) {
  console.error("BŁĄD feature_list.json:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`OK feature_list.json (${features.length} feature)`);
'

# 3. Sekrety: żaden .env nie może trafić do repo (.env.example i .env.template są OK)
LEAKED="$(git ls-files | grep -E '(^|/)\.env(\..+)?$' | grep -vE '\.env\.(example|template)$' || true)"
if [ -n "$LEAKED" ]; then
  echo "BŁĄD: pliki .env w repo: $LEAKED"
  exit 1
fi
echo "OK brak .env w repo"

# 4. Szybkie checki aplikacji: lint / typecheck. Uzupełnia właściciel F01 po postawieniu Mercura.
# Tryb hackathonu: całość do ok. minuty. Bez testów (jest, test:*), bez `medusa build`, bez docker build.
# Przykład: QUICK_CHECKS=("cd marketplace/apps/storefront && bun run lint")
QUICK_CHECKS=()
if [ ${#QUICK_CHECKS[@]} -eq 0 ]; then
  echo "INFO: QUICK_CHECKS puste (uzupełnia właściciel F01)"
else
  for check in "${QUICK_CHECKS[@]}"; do
    echo "--- $check"
    (eval "$check")
  done
fi

echo "=== Weryfikacja OK ==="
echo

# 5. Stan zespołu
./scripts/status.sh

echo
echo "Next steps: weź feature ze swojego strumienia w feature_list.json, potem ./scripts/log.sh START \"F..: ...\""
