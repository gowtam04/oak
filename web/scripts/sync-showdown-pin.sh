#!/usr/bin/env bash
# Fetch the Showdown data files Oak ingest needs for one git SHA.
# Ingest and tests never hit the network — this script is the only fetch.
set -euo pipefail

SHA="${1:-}"
if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: $0 <40-char-sha>" >&2
  echo "example: $0 524413e8415fe179781e9bbcc7c79a85543b3409" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/pokemon-showdown"
BASE="https://raw.githubusercontent.com/smogon/pokemon-showdown/${SHA}"

FILES=(
  LICENSE
  data/pokedex.ts
  data/abilities.ts
  data/items.ts
  data/moves.ts
  data/text/abilities.ts
  data/text/moves.ts
  data/text/items.ts
  data/mods/champions/abilities.ts
  data/mods/champions/conditions.ts
  data/mods/champions/formats-data.ts
  data/mods/champions/items.ts
  data/mods/champions/learnsets.ts
  data/mods/champions/moves.ts
)

mkdir -p "$DEST"
for rel in "${FILES[@]}"; do
  out="$DEST/$rel"
  mkdir -p "$(dirname "$out")"
  echo "fetch $rel"
  curl -fsSL "$BASE/$rel" -o "$out"
done

printf '%s\n' "$SHA" > "$DEST/SHA"
echo "pinned $SHA → $DEST"
