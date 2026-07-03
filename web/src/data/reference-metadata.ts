/**
 * src/data/reference-metadata.ts — PURE title/description builders for the
 * programmatic reference pages.
 *
 * Split out of `reference-pages.ts` (which is `server-only` + DB-bound) so these
 * string builders are unit-testable with no database and no `server-only`
 * import — a page's `generateMetadata` calls the DB loader for the view-model,
 * then hands the plain object to these functions.
 *
 * Titles return the part BEFORE the root layout's `%s | Oak` template suffix
 * (the layout appends " | Oak"), e.g. `buildPokemonTitle` returns
 * "Garchomp — Stats, Moveset & Champions Usage" → rendered "…Usage | Oak".
 * Descriptions are built from real data and clamped to ~155 characters.
 *
 * Pure module: imports ONLY the client-safe view-model types. No DB, no repos,
 * no `server-only`, no React/Node.
 */

import type {
  AbilityPageData,
  ItemPageData,
  MovePageData,
  PokemonPageData,
} from "@/lib/reference-pages-types";

/** Meta-description target length (Google truncates ~155–160 chars). */
const DESCRIPTION_MAX = 158;

/** Title-case a slug ("rough-skin" → "Rough Skin", "ground" → "Ground"). */
function titleCase(slug: string): string {
  return slug
    .split(/[-\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Join type slugs as "Dragon/Ground" (title-cased). */
function typeLine(types: string[]): string {
  return types.map(titleCase).join("/");
}

/**
 * Clamp a description to {@link DESCRIPTION_MAX} chars on a word boundary,
 * appending an ellipsis when truncated. Short strings pass through unchanged.
 */
export function clampDescription(text: string, max = DESCRIPTION_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const base = (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).replace(
    /[\s.,;:]+$/,
    "",
  );
  return `${base}…`;
}

// ---------------------------------------------------------------------------
// Pokémon
// ---------------------------------------------------------------------------

/** True when this Pokémon carries the Champions-usage segment. */
function hasChampions(availability: { includes: (f: "champions") => boolean }) {
  return availability.includes("champions");
}

export function buildPokemonTitle(data: PokemonPageData): string {
  const suffix = hasChampions(data.availability)
    ? "Stats, Moveset & Champions Usage"
    : "Stats, Abilities & Movepool";
  return `${data.displayName} — ${suffix}`;
}

export function buildPokemonDescription(data: PokemonPageData): string {
  const types = typeLine(data.types);
  const usage = hasChampions(data.availability)
    ? ", and live Champions usage"
    : "";
  return clampDescription(
    `${data.displayName} (${types}) — base stats (${data.baseStatTotal} BST), ` +
      `abilities, full learnset, type matchups${usage}. Ask Oak anything about ${data.displayName}.`,
  );
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

export function buildMoveTitle(data: MovePageData): string {
  return `${data.displayName} — ${titleCase(data.type)}-type ${data.damageClass} Move`;
}

export function buildMoveDescription(data: MovePageData): string {
  const power =
    data.damageClass === "status" || data.power == null
      ? "a status move"
      : `${data.power} power`;
  const acc = data.accuracy == null ? "" : `, ${data.accuracy}% accuracy`;
  const learners =
    data.learnerCount > 0
      ? ` See all ${data.learnerCount} Pokémon that can learn it.`
      : "";
  return clampDescription(
    `${data.displayName} is a ${titleCase(data.type)}-type ${data.damageClass} move ` +
      `(${power}${acc}).${learners}`,
  );
}

// ---------------------------------------------------------------------------
// Ability
// ---------------------------------------------------------------------------

export function buildAbilityTitle(data: AbilityPageData): string {
  return `${data.displayName} — Ability Effect & Pokémon`;
}

export function buildAbilityDescription(data: AbilityPageData): string {
  const count = data.learnedBy.length;
  const holders =
    count > 0
      ? ` ${count} Pokémon can have ${data.displayName}.`
      : "";
  return clampDescription(`${data.effectShort}${holders}`);
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

export function buildItemTitle(data: ItemPageData): string {
  return `${data.displayName} — Held Item Effect`;
}

export function buildItemDescription(data: ItemPageData): string {
  const requiredBy =
    data.requiredBy.length > 0
      ? ` Required by ${data.requiredBy.map((r) => r.displayName).join(", ")}.`
      : "";
  return clampDescription(`${data.effectShort}${requiredBy}`);
}
