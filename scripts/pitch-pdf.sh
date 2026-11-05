#!/bin/bash
# Generuje pitch/pitch.pdf z pitch/index.html (Chrome headless, 1 slajd = 1 strona 1600x900).
# Użycie: ./scripts/pitch-pdf.sh
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Nie ma Chrome w $CHROME (ustaw CHROME=...)" >&2; exit 1; }
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$ROOT/pitch/pitch.pdf" "file://$ROOT/pitch/index.html" 2>/dev/null
echo "Zapisano $ROOT/pitch/pitch.pdf"
