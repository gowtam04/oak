/**
 * Drizzle ORM table definitions for Pokebot's SQLite store.
 *
 * Five tables (design.md § Data Model). Since the @pkmn migration each data
 * table carries a `format` discriminator ("scarlet-violet" | "champions") so one
 * physical schema holds both the standard Gen-9 index and the Champions index;
 * repos filter by the active format (derived from the turn's mode). See
 * src/data/formats.ts.
 *
 *   pokemon          — DS-2 Pokédex index, one row per (format, battle form)
 *   learnset         — DS-3 learnset index, PK (pokemon_id, move_slug, format)
 *   reference_cache  — DS-4 reference detail (move/ability/type/evo/item), PK
 *                      (format, resource_key); pre-built per format at ingest
 *   searchable_names — backs resolve_entity (T1, BR-9), PK (format, kind, slug)
 *   ingest_meta      — pipeline bookkeeping, one row PER FORMAT
 *
 * Import only from here — never duplicate column defs elsewhere.
 */

import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// pokemon — DS-2 Pokédex index (one row per (format, battle-relevant form), D8)
// ---------------------------------------------------------------------------
export const pokemon = sqliteTable(
  "pokemon",
  {
    /** Data scope: "scarlet-violet" | "champions". Part of the composite PK. */
    format: text("format").notNull(),
    /** PokeAPI-style pokemon slug, e.g. "tauros-paldea-aqua". */
    id: text("id").notNull(),
    /** e.g. "tauros" */
    species_name: text("species_name").notNull(),
    /** e.g. "paldea-aqua"; null for the base form. */
    form_name: text("form_name"),
    /** Disambiguating human label, e.g. "Tauros (Paldean Aqua)". */
    display_name: text("display_name").notNull(),
    national_dex_number: integer("national_dex_number").notNull(),
    /** One of the 18 canonical type slugs. */
    type1: text("type1").notNull(),
    /** Null for mono-type Pokémon. */
    type2: text("type2"),
    ability_slot1: text("ability_slot1").notNull(),
    ability_slot2: text("ability_slot2"),
    ability_hidden: text("ability_hidden"),
    stat_hp: integer("stat_hp").notNull(),
    stat_attack: integer("stat_attack").notNull(),
    stat_defense: integer("stat_defense").notNull(),
    stat_special_attack: integer("stat_special_attack").notNull(),
    stat_special_defense: integer("stat_special_defense").notNull(),
    stat_speed: integer("stat_speed").notNull(),
    /** Precomputed sum of all six base stats (for BST sort/threshold queries). */
    base_stat_total: integer("base_stat_total").notNull(),
    sprite_url: text("sprite_url").notNull(),
    artwork_url: text("artwork_url").notNull(),
    /** e.g. "gen-9" (standard) / "champions". */
    generation: text("generation").notNull(),
    /**
     * 1 if native to this format's game, 0 if included as an earlier-gen
     * fallback (BR-1). In Champions every indexed row is legal ⇒ always 1.
     */
    is_gen9_native: integer("is_gen9_native").notNull(),
    /** Set when is_gen9_native = 0 (BR-1), e.g. "gen-8"; null otherwise. */
    source_generation: text("source_generation"),
  },
  (t) => ({
    // Same national-dex slug exists in both formats → format is part of the PK.
    pk: primaryKey({ columns: [t.format, t.id] }),
    // national dex sort / lookup
    idxNationalDex: index("pokemon_national_dex_number_idx").on(
      t.national_dex_number,
    ),
    // type filters (US-2)
    idxType1: index("pokemon_type1_idx").on(t.type1),
    idxType2: index("pokemon_type2_idx").on(t.type2),
    // individual stat threshold / superlative queries (AC-3.x)
    idxStatHp: index("pokemon_stat_hp_idx").on(t.stat_hp),
    idxStatAttack: index("pokemon_stat_attack_idx").on(t.stat_attack),
    idxStatDefense: index("pokemon_stat_defense_idx").on(t.stat_defense),
    idxStatSpecialAttack: index("pokemon_stat_special_attack_idx").on(
      t.stat_special_attack,
    ),
    idxStatSpecialDefense: index("pokemon_stat_special_defense_idx").on(
      t.stat_special_defense,
    ),
    idxStatSpeed: index("pokemon_stat_speed_idx").on(t.stat_speed),
    idxBaseStatTotal: index("pokemon_base_stat_total_idx").on(t.base_stat_total),
  }),
);

// ---------------------------------------------------------------------------
// learnset — DS-3 learnset index (D6, BR-2)
// ---------------------------------------------------------------------------
export const learnset = sqliteTable(
  "learnset",
  {
    /** FK → pokemon.id (within the same format). */
    pokemon_id: text("pokemon_id").notNull(),
    /** Canonical move slug, e.g. "will-o-wisp". */
    move_slug: text("move_slug").notNull(),
    /** Data scope: "scarlet-violet" | "champions". Part of the composite PK. */
    format: text("format").notNull(),
    /** "level-up" | "machine" | "tutor". Egg moves excluded (out of scope). */
    method: text("method"),
  },
  (t) => ({
    // Composite PK — (pokemon_id, move_slug, format)
    pk: primaryKey({ columns: [t.pokemon_id, t.move_slug, t.format] }),
    // "what Pokémon learn move X?" — move_slug not the leftmost PK prefix
    idxMoveSlug: index("learnset_move_slug_idx").on(t.move_slug),
    // lookup all moves for a given pokemon — redundant with PK prefix but
    // provides an explicit fast path and makes intent clear
    idxPokemonId: index("learnset_pokemon_id_idx").on(t.pokemon_id),
  }),
);

// ---------------------------------------------------------------------------
// reference_cache — DS-4 reference detail (pre-built per format at ingest)
// ---------------------------------------------------------------------------
export const reference_cache = sqliteTable(
  "reference_cache",
  {
    /** Data scope: "scarlet-violet" | "champions". Part of the composite PK. */
    format: text("format").notNull(),
    /** e.g. "move/fake-out", "ability/armor-tail", "type/ground". */
    resource_key: text("resource_key").notNull(),
    /** "move" | "ability" | "type" | "evolution" | "item". */
    resource_kind: text("resource_kind").notNull(),
    /** Normalized detail shape the tool returns (not raw source JSON). */
    payload: text("payload").notNull(),
    /** Source label for citations (e.g. "@pkmn/dex (Pokémon Showdown)"). */
    endpoint_url: text("endpoint_url").notNull(),
    /** Epoch milliseconds the row was built (informational; no TTL anymore). */
    fetched_at: integer("fetched_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.format, t.resource_key] }),
  }),
);

// ---------------------------------------------------------------------------
// searchable_names — backs resolve_entity (T1, BR-9)
// ---------------------------------------------------------------------------
export const searchable_names = sqliteTable(
  "searchable_names",
  {
    /** Data scope: "scarlet-violet" | "champions". Part of the composite PK. */
    format: text("format").notNull(),
    /** "pokemon" | "move" | "ability" | "type" | "item". */
    kind: text("kind").notNull(),
    /** Canonical slug. */
    slug: text("slug").notNull(),
    display_name: text("display_name").notNull(),
  },
  (t) => ({
    // Composite PK — (format, kind, slug)
    pk: primaryKey({ columns: [t.format, t.kind, t.slug] }),
  }),
);

// ---------------------------------------------------------------------------
// ingest_meta — pipeline bookkeeping (one row per format)
// ---------------------------------------------------------------------------
export const ingest_meta = sqliteTable("ingest_meta", {
  /** Data scope this row describes ("scarlet-violet" | "champions"). PK. */
  format: text("format").primaryKey(),
  /** Epoch ms of the last successful ingest run for this format. */
  last_success_at: integer("last_success_at").notNull(),
  /** Number of rows in the pokemon table for this format after ingest. */
  pokemon_count: integer("pokemon_count").notNull(),
  /** Number of rows in the learnset table for this format after ingest. */
  learnset_count: integer("learnset_count").notNull(),
  /** Number of rows in searchable_names for this format after ingest. */
  names_count: integer("names_count").notNull(),
  /**
   * Bumped when the physical schema changes; the app checks this at startup
   * to detect a stale/empty index and return index_unavailable gracefully.
   */
  schema_version: text("schema_version").notNull(),
});
