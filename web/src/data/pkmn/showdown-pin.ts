/**
 * Champions regulation clock — a pinned Pokémon Showdown git SHA.
 *
 * The bytes for Champions legality / species / abilities / items / moves /
 * learnsets come from `web/vendor/pokemon-showdown/` at this SHA, not from
 * npm `@pkmn/mods`. `@pkmn/dex` is only the overlay engine (`Dex.mod`).
 *
 * Cutover: docs/features/champions-first/regulation-cutover.md
 */

export const SHOWDOWN_PIN = {
  sha: "524413e8415fe179781e9bbcc7c79a85543b3409",
  dateUtc: "2026-09-10T20:11:44Z",
  regulation: "Regulation M-C",
  reason:
    "Showdown master at M-C. Includes Mega Baxcalibur Ice Body drop (490b7fb8) and Mega Salamence OU→Uber (VGC legality is still falsy FormatsData.isNonstandard).",
} as const;

export type ShowdownPin = typeof SHOWDOWN_PIN;
