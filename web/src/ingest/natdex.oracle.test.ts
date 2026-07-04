/**
 * Oracle-style DB test for the global natdex warehouse tables.
 *
 * Builds the REAL committed snapshots via the offline builders, writes them into
 * a real migrated-but-empty Postgres schema through `writeIndex` (the same
 * atomic write path ingest uses — here with EMPTY per-format arrays, so only the
 * global tables are exercised), then asserts known Pokédex facts back out via
 * SQL. This is the end-to-end proof that the snapshot → builder → schema → write
 * pipeline lands the right rows in the right columns.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import {
  classic_encounters,
  natdex_machines,
  natdex_moves,
  natdex_species,
  pmd_recruits,
} from "@/data/schema";

import { createPgSchema, type PgFixture } from "../../test/support/pg";
import {
  buildNatdexSpeciesRows,
  buildNatdexMoveRows,
} from "./build-natdex";
import { buildMachineRows } from "./build-machines";
import { buildClassicEncounterRows } from "./build-classic-encounters";
import { buildPmdRows } from "./build-pmd";
import { writeIndex, type IngestDb } from "./run";

let fix: PgFixture;
let db: IngestDb;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  db = fix.db;

  await writeIndex(
    db,
    {
      pokemon: [],
      learnsets: [],
      names: [],
      references: [],
      global: {
        natdexSpecies: buildNatdexSpeciesRows(),
        natdexMoves: buildNatdexMoveRows(),
        machines: buildMachineRows(),
        classicEncounters: buildClassicEncounterRows(),
        pmd: buildPmdRows(),
        wikiPages: [],
        wikiChunks: [],
      },
    },
    [],
    [], // no per-format work in this test — global tables only
    Date.now(),
  );
}, 120_000);

afterAll(async () => {
  await fix.cleanup();
});

describe("natdex_species", () => {
  it("stores Pikachu: natdex 25, yellow, capture_rate 190, evolves_from pichu", async () => {
    const [pika] = await db
      .select()
      .from(natdex_species)
      .where(eq(natdex_species.species, "pikachu"));
    expect(pika).toBeDefined();
    expect(pika!.national_dex_number).toBe(25);
    expect(pika!.color).toBe("yellow");
    expect(pika!.capture_rate).toBe(190);
    expect(pika!.base_stat_total).toBe(320);
    expect(pika!.type1).toBe("electric");
    expect(pika!.type2).toBeNull();
    expect(pika!.evolves_from).toBe("pichu");
  });
});

describe("natdex_machines", () => {
  it("stores Fly as HM02 in heartgold-soulsilver", async () => {
    const [fly] = await db
      .select()
      .from(natdex_machines)
      .where(
        and(
          eq(natdex_machines.version_group, "heartgold-soulsilver"),
          eq(natdex_machines.move_slug, "fly"),
        ),
      );
    expect(fly).toBeDefined();
    expect(fly!.machine).toBe("HM02");
    expect(fly!.item_slug).toBe("hm02");
  });
});

describe("natdex_moves", () => {
  it("stores Fire Fang as a Gen 4 move", async () => {
    const [ff] = await db
      .select()
      .from(natdex_moves)
      .where(eq(natdex_moves.move_slug, "fire-fang"));
    expect(ff).toBeDefined();
    expect(ff!.generation).toBe(4);
    expect(ff!.type).toBe("fire");
    expect(ff!.damage_class).toBe("physical");
  });
});

describe("classic_encounters", () => {
  it("has at least one Gen 2 route encounter row", async () => {
    const rows = await db
      .select()
      .from(classic_encounters)
      .where(eq(classic_encounters.version, "gold"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.location.includes("route"))).toBe(true);
  });
});

describe("pmd_recruits", () => {
  it("stores Bulbasaur's Rescue Team recruit rate", async () => {
    const [rt] = await db
      .select()
      .from(pmd_recruits)
      .where(
        and(
          eq(pmd_recruits.game, "red-blue-rescue-team"),
          eq(pmd_recruits.species, "bulbasaur"),
        ),
      );
    expect(rt).toBeDefined();
    expect(rt!.recruit_rate).toBe("12.5%");
    expect(rt!.friend_area).toBe("Beau Plains");
  });
});
