/**
 * Unit tests for the LearnsetRepo intersection (BR-7) and learner-count reads.
 *
 * Runs in the Vitest **node** project against a fresh in-memory better-sqlite3
 * database (no fixture file, no migrations, no live PokeAPI, no LLM). Only the
 * `learnset` table is needed, so we create it inline and drive the repo through
 * a real Drizzle handle — the same handle type the runtime threads in.
 *
 * Since the @pkmn migration the learnset table is scoped by a `format`
 * discriminator (replacing the old per-version-group rows); both repo functions
 * take the active format and must never read across formats.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import type { PokebotDb } from "@/data/db";
import * as schema from "@/data/schema";
import { learnset } from "@/data/schema";

import { gen9LearnerCount, pokemonLearningAll } from "./learnset-repo";

const SV = "scarlet-violet";
const CH = "champions";

type Row = {
  pokemon_id: string;
  move_slug: string;
  format: string;
  method: string | null;
};

const SEED: Row[] = [
  // garchomp learns earthquake + dragon-claw + fire-blast (SV)
  { pokemon_id: "garchomp", move_slug: "earthquake", format: SV, method: "machine" },
  { pokemon_id: "garchomp", move_slug: "dragon-claw", format: SV, method: "level-up" },
  { pokemon_id: "garchomp", move_slug: "fire-blast", format: SV, method: "machine" },
  // tyranitar learns earthquake + dragon-claw (SV)
  { pokemon_id: "tyranitar", move_slug: "earthquake", format: SV, method: "machine" },
  { pokemon_id: "tyranitar", move_slug: "dragon-claw", format: SV, method: "tutor" },
  // gible learns earthquake only (SV)
  { pokemon_id: "gible", move_slug: "earthquake", format: SV, method: "level-up" },
  // champions-only mon learns earthquake ONLY in the champions format
  { pokemon_id: "champonly", move_slug: "earthquake", format: CH, method: "machine" },
  // will-o-wisp learners (SV)
  { pokemon_id: "rotom", move_slug: "will-o-wisp", format: SV, method: "machine" },
  { pokemon_id: "ninetales", move_slug: "will-o-wisp", format: SV, method: "level-up" },
];

function makeDb(): PokebotDb {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE learnset (
      pokemon_id TEXT NOT NULL,
      move_slug TEXT NOT NULL,
      format TEXT NOT NULL,
      method TEXT,
      PRIMARY KEY (pokemon_id, move_slug, format)
    );
  `);
  const db = drizzle(sqlite, { schema });
  db.insert(learnset).values(SEED).run();
  return db;
}

describe("pokemonLearningAll (BR-7 intersection)", () => {
  let db: PokebotDb;
  beforeEach(() => {
    db = makeDb();
  });

  it("returns only Pokémon that learn ALL requested moves", () => {
    expect(pokemonLearningAll(["earthquake", "dragon-claw"], SV, db)).toEqual([
      "garchomp",
      "tyranitar",
    ]);
  });

  it("returns all learners for a single move", () => {
    expect(pokemonLearningAll(["earthquake"], SV, db)).toEqual([
      "garchomp",
      "gible",
      "tyranitar",
    ]);
  });

  it("requires the FULL set — a mon missing one move is excluded", () => {
    // gible learns earthquake but not fire-blast, so the 3-move set yields only garchomp
    expect(
      pokemonLearningAll(["earthquake", "dragon-claw", "fire-blast"], SV, db),
    ).toEqual(["garchomp"]);
  });

  it("returns a sorted, deterministic list", () => {
    const result = pokemonLearningAll(["earthquake"], SV, db);
    expect(result).toEqual([...result].sort());
  });

  it("scopes by format — a champions-only learner is excluded for SV", () => {
    expect(pokemonLearningAll(["earthquake"], SV, db)).not.toContain("champonly");
  });

  it("returns only the requested format's learners", () => {
    // earthquake is learned by champonly (champions) and by three SV mons; the
    // champions query must see ONLY champonly.
    expect(pokemonLearningAll(["earthquake"], CH, db)).toEqual(["champonly"]);
  });

  it("de-duplicates requested moves so duplicates do not inflate N", () => {
    expect(
      pokemonLearningAll(["earthquake", "earthquake"], SV, db),
    ).toEqual(pokemonLearningAll(["earthquake"], SV, db));
  });

  it("returns [] for an empty move set (empty intersection)", () => {
    expect(pokemonLearningAll([], SV, db)).toEqual([]);
  });

  it("returns [] when no Pokémon learns the move", () => {
    expect(pokemonLearningAll(["does-not-exist"], SV, db)).toEqual([]);
  });

  it("returns [] when no Pokémon learns the full combination", () => {
    // gible only knows earthquake; pairing with will-o-wisp matches nobody
    expect(
      pokemonLearningAll(["earthquake", "will-o-wisp"], SV, db),
    ).toEqual([]);
  });
});

describe("gen9LearnerCount", () => {
  let db: PokebotDb;
  beforeEach(() => {
    db = makeDb();
  });

  it("counts distinct learners of a move within the format", () => {
    // rotom + ninetales (SV) => 2 distinct Pokémon
    expect(gen9LearnerCount("will-o-wisp", SV, db)).toBe(2);
  });

  it("counts every distinct learner of a move in the requested format", () => {
    // garchomp, tyranitar, gible (SV) => 3 (champonly is champions, excluded)
    expect(gen9LearnerCount("earthquake", SV, db)).toBe(3);
  });

  it("is scoped by format (champions earthquake learners = 1)", () => {
    expect(gen9LearnerCount("earthquake", CH, db)).toBe(1);
  });

  it("returns 0 for a move nobody learns", () => {
    expect(gen9LearnerCount("does-not-exist", SV, db)).toBe(0);
  });
});
