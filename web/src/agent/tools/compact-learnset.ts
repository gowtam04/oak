/**
 * Compact learnset picker for T22 `lookup_box` (BOX-AD-6, BOX-AC-3.4).
 *
 * Deterministic STAB / coverage / status heuristic: at most 16 moves so a
 * box-build does not ingest a full movepool. `get_learnset` remains the
 * complete legal list (BOX-BR-7).
 */

export interface CompactMove {
  slug: string;
  method: string | null;
  type: string | null;
  category: "physical" | "special" | "status" | null;
  power: number | null;
}

/** Preferred status (and pivot) slugs, in fill order, for the status bucket. */
const PREFERRED_STATUS = [
  "protect",
  "substitute",
  "recover",
  "wish",
  "stealth-rock",
  "spikes",
  "defog",
  "u-turn",
  "volt-switch",
] as const;

const STAB_DAMAGING_CAP = 6;
const OTHER_DAMAGING_CAP = 6;
const STATUS_CAP = 4;
const COMPACT_CAP = 16;

function isDamaging(move: CompactMove): boolean {
  return move.category === "physical" || move.category === "special";
}

function isStatus(move: CompactMove): boolean {
  return move.category === "status";
}

/** Null power sorts below any numbered power. */
function powerKey(power: number | null): number {
  return power ?? Number.NEGATIVE_INFINITY;
}

/** Keep the higher-power copy when the same slug appears twice in one bucket. */
function dedupeKeepHigherPower(moves: CompactMove[]): CompactMove[] {
  const best = new Map<string, CompactMove>();
  for (const move of moves) {
    const existing = best.get(move.slug);
    if (!existing || powerKey(move.power) > powerKey(existing.power)) {
      best.set(move.slug, move);
    }
  }
  return [...best.values()];
}

function sortDamaging(moves: CompactMove[]): CompactMove[] {
  return [...moves].sort((a, b) => {
    const byPower = powerKey(b.power) - powerKey(a.power);
    if (byPower !== 0) return byPower;
    return a.slug.localeCompare(b.slug);
  });
}

function sortStatus(moves: CompactMove[]): CompactMove[] {
  const bySlug = new Map(moves.map((m) => [m.slug, m]));
  const preferred: CompactMove[] = [];
  for (const slug of PREFERRED_STATUS) {
    const hit = bySlug.get(slug);
    if (hit) preferred.push(hit);
  }
  const preferredSet = new Set(preferred.map((m) => m.slug));
  const rest = moves
    .filter((m) => !preferredSet.has(m.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  return [...preferred, ...rest];
}

/**
 * Pick ≤16 compact moves: up to 6 STAB damaging (highest power), up to 6 other
 * damaging (highest power), up to 4 status (preferred slugs, else slug order).
 * Dedupes by slug. Null-category moves are neither STAB nor status; they fill
 * remaining slots after the three buckets.
 */
export function compactMoves(
  moves: CompactMove[],
  speciesTypes: string[],
): CompactMove[] {
  const typeSet = new Set(speciesTypes);
  const stab: CompactMove[] = [];
  const other: CompactMove[] = [];
  const status: CompactMove[] = [];
  const unclassified: CompactMove[] = [];

  for (const move of moves) {
    if (isDamaging(move)) {
      if (move.type !== null && typeSet.has(move.type)) {
        stab.push(move);
      } else {
        other.push(move);
      }
    } else if (isStatus(move)) {
      status.push(move);
    } else {
      unclassified.push(move);
    }
  }

  const out: CompactMove[] = [];
  const seen = new Set<string>();

  function take(bucket: CompactMove[], limit: number): void {
    for (const move of bucket) {
      if (out.length >= COMPACT_CAP || limit <= 0) return;
      if (seen.has(move.slug)) continue;
      seen.add(move.slug);
      out.push(move);
      limit -= 1;
    }
  }

  take(sortDamaging(dedupeKeepHigherPower(stab)), STAB_DAMAGING_CAP);
  take(sortDamaging(dedupeKeepHigherPower(other)), OTHER_DAMAGING_CAP);
  take(sortStatus(dedupeKeepHigherPower(status)), STATUS_CAP);
  take(
    dedupeKeepHigherPower(unclassified).sort((a, b) =>
      a.slug.localeCompare(b.slug),
    ),
    COMPACT_CAP - out.length,
  );

  return out;
}
