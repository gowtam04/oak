/**
 * DS-3 transform: build Gen-9 learnset rows from a PokeAPI /pokemon/{id}
 * resource.
 *
 * Design constraints (data-sources.md DS-3, overview.md D6, design.md BR-2):
 *   - For each Gen-9 Pokémon, read moves[].version_group_details, filter to
 *     the Gen-9 version group(s), and emit (pokemon_id, move_slug,
 *     version_group, method) rows.
 *   - Egg moves are EXCLUDED. A move learnable via egg AND a non-egg method
 *     survives via the non-egg method row only.
 *   - Moves present only in non-Gen-9 version groups are excluded entirely.
 *   - Each emitted row is unique per the composite PK
 *     (pokemon_id, move_slug, version_group); when multiple non-egg methods
 *     exist for the same (move, version_group), the highest-priority method
 *     wins (level-up > machine > tutor > other).
 */

import type { Json } from "@/data/pokeapi-client";

// ---------------------------------------------------------------------------
// Public interface — matches the `learnset` table columns in src/data/schema.ts
// ---------------------------------------------------------------------------

export interface LearnsetRow {
  /** FK → pokemon.id (the PokeAPI pokemon slug, e.g. "ninetales"). */
  pokemon_id: string;
  /** Canonical move slug, e.g. "will-o-wisp". */
  move_slug: string;
  /** Version-group slug, e.g. "scarlet-violet". */
  version_group: string;
  /** "level-up" | "machine" | "tutor". Never "egg" — egg rows are excluded. */
  method: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Priority order for method selection when a move is learnable via multiple
 * non-egg methods in the same version group. Lower number = higher priority.
 */
const METHOD_PRIORITY: Readonly<Record<string, number>> = {
  "level-up": 0,
  machine: 1,
  tutor: 2,
};

function methodPriority(method: string): number {
  return METHOD_PRIORITY[method] ?? 99;
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

/**
 * Given a raw PokeAPI `/pokemon/{id}` response, return one {@link LearnsetRow}
 * per (move_slug, version_group) pair that satisfies all of:
 *   1. The version_group is in `opts.gen9VersionGroups`, AND
 *   2. The move_learn_method is NOT `"egg"`.
 *
 * Rows are unique per (move_slug, version_group): when a move entry carries
 * multiple non-egg version_group_details for the same Gen-9 version group
 * (e.g. both `"egg"` and `"level-up"` for `scarlet-violet`), the non-egg
 * method survives; when two non-egg methods both appear (rare), the
 * highest-priority one (level-up > machine > tutor) is kept.
 *
 * @param pokemon         Raw PokeAPI `/pokemon/{id}` JSON value.
 * @param opts.gen9VersionGroups  Version-group slugs that constitute Gen 9,
 *                        e.g. `["scarlet-violet"]`. Additional DLC groups can
 *                        be added here (e.g. `"the-teal-mask"`).
 */
export function buildLearnsetRows(
  pokemon: Json,
  opts: { gen9VersionGroups: string[] },
): LearnsetRow[] {
  // Guard: must be a plain object.
  if (
    typeof pokemon !== "object" ||
    pokemon === null ||
    Array.isArray(pokemon)
  ) {
    return [];
  }

  const pokemonId = pokemon["name"];
  if (typeof pokemonId !== "string" || pokemonId === "") {
    return [];
  }

  const moves = pokemon["moves"];
  if (!Array.isArray(moves)) {
    return [];
  }

  const gen9Set = new Set(opts.gen9VersionGroups);
  const rows: LearnsetRow[] = [];

  for (const moveEntry of moves) {
    if (
      typeof moveEntry !== "object" ||
      moveEntry === null ||
      Array.isArray(moveEntry)
    ) {
      continue;
    }

    // Extract the move slug.
    const moveObj = moveEntry["move"];
    if (
      typeof moveObj !== "object" ||
      moveObj === null ||
      Array.isArray(moveObj)
    ) {
      continue;
    }
    const moveSlug = moveObj["name"];
    if (typeof moveSlug !== "string" || moveSlug === "") {
      continue;
    }

    // Walk the version_group_details array.
    const vgDetails = moveEntry["version_group_details"];
    if (!Array.isArray(vgDetails)) {
      continue;
    }

    // Accumulate the best (highest-priority) non-egg method per Gen-9 version
    // group for this move. Map key = version_group slug.
    const bestMethodByVg = new Map<string, string>();

    for (const vgd of vgDetails) {
      if (typeof vgd !== "object" || vgd === null || Array.isArray(vgd)) {
        continue;
      }

      // version_group check.
      const vgObj = vgd["version_group"];
      if (typeof vgObj !== "object" || vgObj === null || Array.isArray(vgObj)) {
        continue;
      }
      const vgName = vgObj["name"];
      if (typeof vgName !== "string" || !gen9Set.has(vgName)) {
        // Not a Gen-9 version group — skip.
        continue;
      }

      // move_learn_method check.
      const methodObj = vgd["move_learn_method"];
      if (
        typeof methodObj !== "object" ||
        methodObj === null ||
        Array.isArray(methodObj)
      ) {
        continue;
      }
      const methodName = methodObj["name"];
      if (typeof methodName !== "string") {
        continue;
      }
      // Exclude egg moves (DS-3 build rule D6 / BR-2).
      if (methodName === "egg") {
        continue;
      }

      // Keep the highest-priority method for this (move, version_group).
      const existing = bestMethodByVg.get(vgName);
      if (
        existing === undefined ||
        methodPriority(methodName) < methodPriority(existing)
      ) {
        bestMethodByVg.set(vgName, methodName);
      }
    }

    // Emit one row per surviving (move_slug, version_group).
    for (const [vgName, method] of bestMethodByVg) {
      rows.push({
        pokemon_id: pokemonId,
        move_slug: moveSlug,
        version_group: vgName,
        method,
      });
    }
  }

  return rows;
}
