/**
 * Showdown sprite id → PokeAPI variety/form id for official-artwork filenames.
 *
 * Only Champions Regulation M-C megas that 404 on Showdown `ani/` (and also
 * `dex/`, `gen5ani/`, `home/`) as of 2026-09-10. Do not add ids that 200 on
 * Showdown `ani/` — those are real sprites, including the ~3KB static mega
 * GIFs. Keys are Showdown sprite ids (`toID(base)+'-'+toID(forme)` →
 * `garchomp-megaz`), not Oak slugs (`garchomp-mega-z`) or PokeAPI slugs.
 *
 * Used only by the sprite media proxy after a Showdown 404. Not a Dex column,
 * not ingest, not a public `/artwork/{id}` path (form ids are a different
 * namespace from national dex).
 */

const POKEAPI_FORM_ID_BY_SPRITE_ID: Readonly<Record<string, number>> = {
  "absol-megaz": 10307,
  "garchomp-megaz": 10309,
  "lucario-megaz": 10310,
  "golisopod-mega": 10316,
  "baxcalibur-mega": 10325,
};

/** PokeAPI variety id for a Showdown sprite id, or null if unmapped. */
export function pokeApiFormIdForSpriteId(id: string): number | null {
  return POKEAPI_FORM_ID_BY_SPRITE_ID[id] ?? null;
}
