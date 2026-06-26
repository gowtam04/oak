/**
 * Tests for src/data/schema.ts — Phase 2 schema / migration unit tests.
 *
 * Success criteria (design.md Phase 2):
 *   1. The migration creates all 5 tables + all expected indexes on a fresh file.
 *   2. EXPLAIN QUERY PLAN confirms that stat/type/move-slug queries hit indexes
 *      (i.e. SQLite chooses "SEARCH … USING INDEX …" rather than "SCAN").
 *
 * Uses better-sqlite3 directly (synchronous, zero network calls).
 * Applies the committed migration files IN ORDER (0000 then 0001 — the latter
 * drops + recreates every table with the per-format `format` discriminator added
 * by the @pkmn migration) so the test exercises the exact deployed schema.
 */

import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The committed migrations, applied in order (0001 supersedes 0000's schema).
const MIGRATION_FILES = [
  "0000_medical_blur.sql",
  "0001_champions_format.sql",
] as const;

function migrationDir(): string {
  // __dirname equivalent in ESM
  const dir = fileURLToPath(new URL(".", import.meta.url));
  return join(dir, "../../drizzle");
}

/**
 * Parse the Drizzle migration SQL (which uses --> statement-breakpoint
 * as a separator) into individual statements.
 */
function parseMigration(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Apply the generated migration to an in-memory SQLite database and return
 * the open connection.
 */
function buildFreshDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  for (const file of MIGRATION_FILES) {
    const sql = readFileSync(join(migrationDir(), file), "utf8");
    for (const stmt of parseMigration(sql)) {
      db.exec(stmt);
    }
  }
  return db;
}

type SqliteMasterRow = { type: string; name: string; tbl_name: string };

function tableNames(db: Database.Database): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
}

function indexNames(db: Database.Database): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
}

/** Returns the EXPLAIN QUERY PLAN detail strings for a given SQL query. */
function explainPlan(db: Database.Database, sql: string): string[] {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as {
    id: number;
    parent: number;
    notused: number;
    detail: string;
  }[];
  return rows.map((r) => r.detail);
}

// ---------------------------------------------------------------------------
// Fixtures — a single Pokémon row and learnset rows used for index tests
// ---------------------------------------------------------------------------

function seedData(db: Database.Database): void {
  // Insert one Pokémon (Garchomp — used in eval cases G6/G15)
  db.prepare(`
    INSERT INTO pokemon
      (format, id, species_name, form_name, display_name, national_dex_number,
       type1, type2, ability_slot1, ability_slot2, ability_hidden,
       stat_hp, stat_attack, stat_defense,
       stat_special_attack, stat_special_defense, stat_speed,
       base_stat_total, sprite_url, artwork_url,
       generation, is_gen9_native, source_generation)
    VALUES
      ('scarlet-violet', 'garchomp', 'garchomp', NULL, 'Garchomp', 445,
       'dragon', 'ground', 'sand-veil', NULL, 'rough-skin',
       108, 130, 95, 80, 85, 102,
       600, 'https://sprites.example/445.png', 'https://art.example/445.png',
       'gen-9', 1, NULL)
  `).run();

  // Insert one learnset row for Garchomp
  db.prepare(`
    INSERT INTO learnset (pokemon_id, move_slug, format, method)
    VALUES ('garchomp', 'dragon-claw', 'scarlet-violet', 'machine')
  `).run();

  // Insert a second Pokémon (Tauros — mono-type for type2 index test)
  db.prepare(`
    INSERT INTO pokemon
      (format, id, species_name, form_name, display_name, national_dex_number,
       type1, type2, ability_slot1, ability_slot2, ability_hidden,
       stat_hp, stat_attack, stat_defense,
       stat_special_attack, stat_special_defense, stat_speed,
       base_stat_total, sprite_url, artwork_url,
       generation, is_gen9_native, source_generation)
    VALUES
      ('scarlet-violet', 'tauros', 'tauros', NULL, 'Tauros', 128,
       'normal', NULL, 'intimidate', 'anger-point', 'sheer-force',
       75, 100, 95, 40, 70, 110,
       490, 'https://sprites.example/128.png', 'https://art.example/128.png',
       'gen-9', 1, NULL)
  `).run();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Drizzle migration — table creation", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = buildFreshDb();
  });

  afterEach(() => {
    db.close();
  });

  it("creates all 5 tables", () => {
    const tables = tableNames(db);
    expect(tables).toEqual(
      expect.arrayContaining([
        "ingest_meta",
        "learnset",
        "pokemon",
        "reference_cache",
        "searchable_names",
      ]),
    );
    // Exactly 5 user tables (no extras)
    expect(tables.filter((n) => !n.startsWith("sqlite_"))).toHaveLength(5);
  });

  it("creates all expected indexes", () => {
    const indexes = indexNames(db);

    // pokemon — stat indexes
    const statIndexes = [
      "pokemon_stat_hp_idx",
      "pokemon_stat_attack_idx",
      "pokemon_stat_defense_idx",
      "pokemon_stat_special_attack_idx",
      "pokemon_stat_special_defense_idx",
      "pokemon_stat_speed_idx",
      "pokemon_base_stat_total_idx",
    ];

    // pokemon — other indexes
    const otherPokemonIndexes = [
      "pokemon_national_dex_number_idx",
      "pokemon_type1_idx",
      "pokemon_type2_idx",
    ];

    // learnset — explicit indexes
    const learnsetIndexes = [
      "learnset_move_slug_idx",
      "learnset_pokemon_id_idx",
    ];

    for (const idx of [
      ...statIndexes,
      ...otherPokemonIndexes,
      ...learnsetIndexes,
    ]) {
      expect(indexes, `Expected index "${idx}" to be present`).toContain(idx);
    }
  });

  it("pokemon table has the correct 23 columns (incl. format)", () => {
    const cols = (
      db.prepare("PRAGMA table_info(pokemon)").all() as {
        name: string;
        type: string;
        notnull: number;
      }[]
    ).map((c) => c.name);

    expect(cols).toEqual(
      expect.arrayContaining([
        "format",
        "id",
        "species_name",
        "form_name",
        "display_name",
        "national_dex_number",
        "type1",
        "type2",
        "ability_slot1",
        "ability_slot2",
        "ability_hidden",
        "stat_hp",
        "stat_attack",
        "stat_defense",
        "stat_special_attack",
        "stat_special_defense",
        "stat_speed",
        "base_stat_total",
        "sprite_url",
        "artwork_url",
        "generation",
        "is_gen9_native",
        "source_generation",
      ]),
    );
    expect(cols).toHaveLength(23);
  });

  it("pokemon table has composite PK on (format, id)", () => {
    const pkCols = (
      db.prepare("PRAGMA table_info(pokemon)").all() as {
        name: string;
        pk: number;
      }[]
    )
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);

    expect(pkCols).toEqual(["format", "id"]);
  });

  it("learnset table has composite PK on (pokemon_id, move_slug, format)", () => {
    const pkCols = (
      db.prepare("PRAGMA table_info(learnset)").all() as {
        name: string;
        pk: number;
      }[]
    )
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);

    expect(pkCols).toEqual(["pokemon_id", "move_slug", "format"]);
  });

  it("searchable_names table has composite PK on (format, kind, slug)", () => {
    const pkCols = (
      db.prepare("PRAGMA table_info(searchable_names)").all() as {
        name: string;
        pk: number;
      }[]
    )
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);

    expect(pkCols).toEqual(["format", "kind", "slug"]);
  });

  it("reference_cache table has the correct 6 columns (incl. format) and PK (format, resource_key)", () => {
    const info = db.prepare("PRAGMA table_info(reference_cache)").all() as {
      name: string;
      pk: number;
    }[];
    const cols = info.map((c) => c.name);

    expect(cols).toEqual(
      expect.arrayContaining([
        "format",
        "resource_key",
        "resource_kind",
        "payload",
        "endpoint_url",
        "fetched_at",
      ]),
    );
    expect(cols).toHaveLength(6);

    const pkCols = info
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);
    expect(pkCols).toEqual(["format", "resource_key"]);
  });

  it("ingest_meta table has the correct 6 columns, keyed by format", () => {
    const info = db.prepare("PRAGMA table_info(ingest_meta)").all() as {
      name: string;
      pk: number;
    }[];
    const cols = info.map((c) => c.name);

    expect(cols).toEqual(
      expect.arrayContaining([
        "format",
        "last_success_at",
        "pokemon_count",
        "learnset_count",
        "names_count",
        "schema_version",
      ]),
    );
    expect(cols).toHaveLength(6);

    const pkCols = info.filter((c) => c.pk > 0).map((c) => c.name);
    expect(pkCols).toEqual(["format"]);
  });
});

// ---------------------------------------------------------------------------
// EXPLAIN QUERY PLAN — index hit confirmation
// ---------------------------------------------------------------------------

describe("EXPLAIN QUERY PLAN — indexes are used", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = buildFreshDb();
    seedData(db);
  });

  afterEach(() => {
    db.close();
  });

  it("stat_attack > N hits pokemon_stat_attack_idx", () => {
    const plan = explainPlan(
      db,
      "SELECT id FROM pokemon WHERE stat_attack > 100",
    );
    const planStr = plan.join(" ");
    expect(planStr).toContain("pokemon_stat_attack_idx");
  });

  it("stat_speed > N hits pokemon_stat_speed_idx", () => {
    const plan = explainPlan(
      db,
      "SELECT id FROM pokemon WHERE stat_speed > 90",
    );
    const planStr = plan.join(" ");
    expect(planStr).toContain("pokemon_stat_speed_idx");
  });

  it("stat_hp <= N hits pokemon_stat_hp_idx", () => {
    const plan = explainPlan(
      db,
      "SELECT id FROM pokemon WHERE stat_hp <= 100",
    );
    const planStr = plan.join(" ");
    expect(planStr).toContain("pokemon_stat_hp_idx");
  });

  it("base_stat_total >= N hits pokemon_base_stat_total_idx", () => {
    const plan = explainPlan(
      db,
      "SELECT id FROM pokemon WHERE base_stat_total >= 600",
    );
    const planStr = plan.join(" ");
    expect(planStr).toContain("pokemon_base_stat_total_idx");
  });

  it("type1 = X hits pokemon_type1_idx", () => {
    const plan = explainPlan(
      db,
      "SELECT id FROM pokemon WHERE type1 = 'dragon'",
    );
    const planStr = plan.join(" ");
    expect(planStr).toContain("pokemon_type1_idx");
  });

  it("type2 = X hits pokemon_type2_idx", () => {
    const plan = explainPlan(
      db,
      "SELECT id FROM pokemon WHERE type2 = 'ground'",
    );
    const planStr = plan.join(" ");
    expect(planStr).toContain("pokemon_type2_idx");
  });

  it("learnset WHERE move_slug = X hits learnset_move_slug_idx", () => {
    const plan = explainPlan(
      db,
      "SELECT pokemon_id FROM learnset WHERE move_slug = 'dragon-claw'",
    );
    const planStr = plan.join(" ");
    expect(planStr).toContain("learnset_move_slug_idx");
  });

  it("learnset multi-move intersection (GROUP BY … HAVING) hits move_slug index", () => {
    // This mirrors the BR-7 pattern in learnset-repo.ts
    const plan = explainPlan(
      db,
      `SELECT pokemon_id
         FROM learnset
        WHERE move_slug IN ('dragon-claw', 'earthquake')
          AND format IN ('scarlet-violet')
        GROUP BY pokemon_id
       HAVING COUNT(DISTINCT move_slug) = 2`,
    );
    const planStr = plan.join(" ");
    expect(planStr).toContain("learnset_move_slug_idx");
  });

  it("stat filter queries use SEARCH not SCAN", () => {
    const plan = explainPlan(
      db,
      "SELECT id FROM pokemon WHERE stat_special_attack > 70",
    );
    const planStr = plan.join(" ");
    // SQLite 3 uses "SEARCH" when an index is used, "SCAN" when it's a full scan
    expect(planStr).toContain("SEARCH");
    expect(planStr).not.toContain("SCAN");
  });

  it("type filter queries use SEARCH not SCAN", () => {
    const plan = explainPlan(
      db,
      "SELECT id FROM pokemon WHERE type1 = 'fire'",
    );
    const planStr = plan.join(" ");
    expect(planStr).toContain("SEARCH");
    expect(planStr).not.toContain("SCAN");
  });
});

// ---------------------------------------------------------------------------
// Idempotency — re-running migration does not break the database
// ---------------------------------------------------------------------------

describe("Schema idempotency and constraints", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = buildFreshDb();
  });

  afterEach(() => {
    db.close();
  });

  it("learnset composite PK rejects duplicate (pokemon_id, move_slug, format)", () => {
    db.prepare(
      "INSERT INTO learnset (pokemon_id, move_slug, format, method) VALUES ('bulbasaur', 'tackle', 'scarlet-violet', 'level-up')",
    ).run();

    expect(() => {
      db.prepare(
        "INSERT INTO learnset (pokemon_id, move_slug, format, method) VALUES ('bulbasaur', 'tackle', 'scarlet-violet', 'machine')",
      ).run();
    }).toThrow();
  });

  it("learnset allows the same (pokemon_id, move_slug) across two formats", () => {
    db.prepare(
      "INSERT INTO learnset (pokemon_id, move_slug, format, method) VALUES ('bulbasaur', 'tackle', 'scarlet-violet', 'level-up')",
    ).run();
    expect(() => {
      db.prepare(
        "INSERT INTO learnset (pokemon_id, move_slug, format, method) VALUES ('bulbasaur', 'tackle', 'champions', 'level-up')",
      ).run();
    }).not.toThrow();
  });

  it("searchable_names composite PK rejects duplicate (format, kind, slug)", () => {
    db.prepare(
      "INSERT INTO searchable_names (format, kind, slug, display_name) VALUES ('scarlet-violet', 'pokemon', 'bulbasaur', 'Bulbasaur')",
    ).run();

    expect(() => {
      db.prepare(
        "INSERT INTO searchable_names (format, kind, slug, display_name) VALUES ('scarlet-violet', 'pokemon', 'bulbasaur', 'Bulbasaur Again')",
      ).run();
    }).toThrow();
  });

  it("reference_cache (format, resource_key) PK rejects duplicate keys", () => {
    db.prepare(
      "INSERT INTO reference_cache (format, resource_key, resource_kind, payload, endpoint_url, fetched_at) VALUES ('scarlet-violet', 'move/tackle', 'move', '{}', 'src', 1700000000000)",
    ).run();

    expect(() => {
      db.prepare(
        "INSERT INTO reference_cache (format, resource_key, resource_kind, payload, endpoint_url, fetched_at) VALUES ('scarlet-violet', 'move/tackle', 'move', '{}', 'src', 1700000000001)",
      ).run();
    }).toThrow();
  });

  it("ingest_meta per-format row can be UPSERTED without error", () => {
    db.prepare(`
      INSERT INTO ingest_meta
        (format, last_success_at, pokemon_count, learnset_count, names_count, schema_version)
      VALUES
        ('scarlet-violet', 1700000000000, 1300, 50000, 3000, '2')
      ON CONFLICT(format) DO UPDATE SET
        last_success_at = excluded.last_success_at,
        pokemon_count   = excluded.pokemon_count,
        learnset_count  = excluded.learnset_count,
        names_count     = excluded.names_count,
        schema_version  = excluded.schema_version
    `).run();

    db.prepare(`
      INSERT INTO ingest_meta
        (format, last_success_at, pokemon_count, learnset_count, names_count, schema_version)
      VALUES
        ('scarlet-violet', 1700001000000, 1302, 50100, 3001, '2')
      ON CONFLICT(format) DO UPDATE SET
        last_success_at = excluded.last_success_at,
        pokemon_count   = excluded.pokemon_count,
        learnset_count  = excluded.learnset_count,
        names_count     = excluded.names_count,
        schema_version  = excluded.schema_version
    `).run();

    const row = db
      .prepare("SELECT * FROM ingest_meta WHERE format = 'scarlet-violet'")
      .get() as { pokemon_count: number; last_success_at: number } | undefined;

    expect(row).toBeDefined();
    expect(row!.pokemon_count).toBe(1302);
    expect(row!.last_success_at).toBe(1700001000000);
  });
});
