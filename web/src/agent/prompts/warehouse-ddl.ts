/**
 * WAREHOUSE_DDL — the byte-stable schema reference the T18 `run_sql` tool needs.
 *
 * Frontier LLMs write correct SQL when handed the DDL + a few sample rows + the
 * quirks; this module is that briefing. It is a hand-curated CREATE TABLE dump
 * of exactly the tables the `oak_readonly` sandbox role exposes (see
 * src/data/sql-sandbox.ts and migration 0009), each with 2–3 realistic sample
 * rows and the usage notes a query author needs.
 *
 * It is NOT wired into the system prompt here — Oak v2 P3 (the prompt collapse)
 * injects it into the cached prefix. This module must simply exist and be
 * importable with ZERO side effects (no db/env/server-only imports) so P3 can
 * consume it and the drift test (warehouse-ddl.test.ts) can pin every table/
 * column name against the live Drizzle schema.
 *
 * The exported string is byte-stable: it goes into the prompt-cache prefix, so
 * do not reformat it casually. When the schema changes, update the DDL here in
 * lock-step (the drift test fails the build otherwise).
 */

/**
 * The tables the sandbox exposes, with their columns — the single structured
 * source the DDL text below is written against and the drift test checks. Keep
 * these in sync with the CREATE TABLE blocks in `WAREHOUSE_DDL` (the drift test
 * enforces that too).
 */
export const WAREHOUSE_ALLOWLIST = [
  "pokemon",
  "learnset",
  "reference_cache",
  "searchable_names",
  "ingest_meta",
  "champions_item_exclusion",
  "natdex_species",
  "natdex_machines",
  "natdex_moves",
  "classic_encounters",
  "pmd_recruits",
] as const;

export type WarehouseTable = (typeof WAREHOUSE_ALLOWLIST)[number];

export const WAREHOUSE_DDL = `-- Oak offline warehouse — READ-ONLY schema reference for run_sql.
--
-- USAGE NOTES
--   * These are the ONLY tables run_sql can read. Any other table (accounts,
--     auth, conversations, teams, usage) is blocked.
--   * Queries are read-only, a SINGLE statement, and capped at 200 rows.
--   * Slugs are PokeAPI-style lowercase-with-hyphens: "great-tusk",
--     "will-o-wisp", "choice-scarf", "johto-route-29". Join on slugs.
--   * The 'format' column on the format-partitioned tables (pokemon, learnset,
--     reference_cache, searchable_names, ingest_meta) is one of the six Oak
--     scopes: 'scarlet-violet', 'champions', 'gen-5', 'gen-6', 'gen-7',
--     'gen-8'. ALWAYS filter by a single format or you will get duplicate rows
--     across scopes. For whole-Pokedex facts prefer the natdex_* tables.
--   * The natdex_* tables, classic_encounters, pmd_recruits, and
--     champions_item_exclusion are GLOBAL (no 'format' column) — one row per
--     species / version-group / move / etc., covering the whole National Dex.
--   * classic_encounters covers Gens 1–7 ONLY and is best-effort (PokeAPI has
--     no Gen 8–9 encounter data and known holes) — flag any answer from it as
--     partial/incomplete.
--   * reference_cache.payload is a JSON string (move/ability/type/evolution/
--     item detail), not columns — treat it as text.

CREATE TABLE pokemon (
  format text,
  id text,
  species_name text,
  form_name text,
  display_name text,
  national_dex_number integer,
  type1 text,
  type2 text,
  ability_slot1 text,
  ability_slot2 text,
  ability_hidden text,
  stat_hp integer,
  stat_attack integer,
  stat_defense integer,
  stat_special_attack integer,
  stat_special_defense integer,
  stat_speed integer,
  base_stat_total integer,
  sprite_url text,
  artwork_url text,
  required_item text,
  generation text,
  is_gen9_native integer,
  source_generation text
);
-- PK (format, id). One row per (format, battle-relevant form). type2/form_name
-- are NULL for mono-type / base forms. is_gen9_native is 0/1.
-- sample rows:
--   ('scarlet-violet','great-tusk','great-tusk',NULL,'Great Tusk',984,'ground','fighting','protosynthesis',NULL,NULL,115,131,131,53,53,87,570,'…','…',NULL,'gen-9',1,NULL)
--   ('champions','flutter-mane','flutter-mane',NULL,'Flutter Mane',987,'ghost','fairy','protosynthesis',NULL,NULL,55,55,55,135,135,135,570,'…','…',NULL,'champions',1,NULL)
--   ('gen-7','garchomp','garchomp',NULL,'Garchomp',445,'dragon','ground','sand-veil',NULL,'rough-skin',108,130,95,80,85,102,600,'…','…',NULL,'gen-7',1,NULL)

CREATE TABLE learnset (
  pokemon_id text,
  move_slug text,
  format text,
  method text
);
-- PK (pokemon_id, move_slug, format). method is 'level-up'|'machine'|'tutor'.
-- Join pokemon_id -> pokemon.id within the SAME format.
-- sample rows:
--   ('great-tusk','headlong-rush','scarlet-violet','level-up')
--   ('great-tusk','earthquake','scarlet-violet','machine')
--   ('garchomp','fire-fang','scarlet-violet','level-up')

CREATE TABLE reference_cache (
  format text,
  resource_key text,
  resource_kind text,
  payload text,
  endpoint_url text,
  fetched_at bigint
);
-- PK (format, resource_key). resource_key e.g. 'move/fake-out',
-- 'ability/armor-tail', 'type/ground'. resource_kind is
-- 'move'|'ability'|'type'|'evolution'|'item'. payload is a JSON string.
-- sample rows:
--   ('scarlet-violet','move/fake-out','move','{"power":40,...}','@pkmn/dex',1783000000000)
--   ('scarlet-violet','ability/levitate','ability','{"desc":"…"}','@pkmn/dex',1783000000000)

CREATE TABLE searchable_names (
  format text,
  kind text,
  slug text,
  display_name text
);
-- PK (format, kind, slug). kind is 'pokemon'|'move'|'ability'|'type'|'item'.
-- The name<->slug lookup that backs entity resolution.
-- sample rows:
--   ('champions','pokemon','flutter-mane','Flutter Mane')
--   ('champions','item','choice-scarf','Choice Scarf')

CREATE TABLE ingest_meta (
  format text,
  last_success_at bigint,
  pokemon_count integer,
  learnset_count integer,
  names_count integer,
  schema_version text
);
-- PK (format). One bookkeeping row per format (row counts after ingest).
-- sample rows:
--   ('champions',1783115623129,412,9800,1500,'9')
--   ('scarlet-violet',1783115623129,1050,42000,4200,'9')

CREATE TABLE champions_item_exclusion (
  slug text,
  excluded_at bigint,
  excluded_by text
);
-- PK (slug). Items the operator has marked NOT-yet-available in Champions;
-- the effective Champions item pool is (all champions items) MINUS these.
-- Usually empty. slug matches searchable_names.slug (kind='item').
-- sample rows:
--   ('booster-energy',1783000000000,'admin@oak')

CREATE TABLE natdex_species (
  species text,
  national_dex_number integer,
  generation integer,
  color text,
  shape text,
  capture_rate integer,
  base_stat_total integer,
  evolves_from text,
  type1 text,
  type2 text
);
-- PK (species). GLOBAL — one row per National Dex species (default form).
-- generation is 1–9. capture_rate is 0–255 (higher = easier to catch).
-- evolves_from is the pre-evolution species slug (self-join), NULL if none.
-- type2 NULL for mono-type. This is the table for whole-Pokedex facts:
-- colors, shapes, catch rates, dex numbers, evolution parents, type combos.
-- sample rows:
--   ('bulbasaur',1,1,'green','quadruped',45,318,NULL,'grass','poison')
--   ('ivysaur',2,1,'green','quadruped',45,405,'bulbasaur','grass','poison')
--   ('pikachu',25,1,'yellow','quadruped',190,320,'pichu','electric',NULL)

CREATE TABLE natdex_machines (
  version_group text,
  machine text,
  move_slug text,
  item_slug text
);
-- PK (version_group, machine). GLOBAL. machine e.g. 'TM24','HM02','TR50';
-- version_group e.g. 'heartgold-soulsilver'. Which TM/HM/TR teaches a move.
-- sample rows:
--   ('heartgold-soulsilver','HM02','fly','hm02')
--   ('sword-shield','TM24','snarl','tm24')

CREATE TABLE natdex_moves (
  move_slug text,
  generation integer,
  type text,
  damage_class text
);
-- PK (move_slug). GLOBAL. generation the move was introduced (1–9). This is
-- the ONLY move-generation source that covers Gens 1–4 (the @pkmn per-format
-- index only covers Gens 5–9). damage_class is 'physical'|'special'|'status'.
-- sample rows:
--   ('fire-fang',4,'fire','physical')
--   ('will-o-wisp',3,'fire','status')
--   ('tackle',1,'normal','physical')

CREATE TABLE classic_encounters (
  id integer,
  version text,
  location text,
  area text,
  method text,
  species text,
  rarity integer,
  min_level integer,
  max_level integer
);
-- PK (id, synthetic). GLOBAL, Gens 1–7 ONLY, best-effort with known holes —
-- flag answers as partial. version e.g. 'gold'; location e.g.
-- 'johto-route-29'; method e.g. 'walk'|'surf'|'old-rod'. rarity is the
-- encounter-slot weight (higher = more common); NULLs where unknown.
-- sample rows:
--   (1,'gold','johto-route-29',NULL,'walk','pidgey',30,2,4)
--   (2,'red','kanto-route-1',NULL,'walk','rattata',45,2,4)

CREATE TABLE pmd_recruits (
  game text,
  species text,
  location text,
  recruit_rate text,
  friend_area text
);
-- PK (game, species). GLOBAL. Pokemon Mystery Dungeon recruit data. game is
-- 'red-blue-rescue-team'|'explorers-of-sky'. recruit_rate is a display string
-- e.g. '12.5%' (may be NULL). friend_area is the Rescue Team mechanic (NULL in
-- Explorers).
-- sample rows:
--   ('red-blue-rescue-team','bulbasaur','Route via recruitment','8.2%','Overgrown Forest')
--   ('explorers-of-sky','riolu','Craggy Coast','6.3%',NULL)
`;
