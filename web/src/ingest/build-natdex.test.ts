/**
 * Unit tests for buildNatdexSpeciesRows / buildNatdexMoveRows — exercise the
 * OFFLINE builders against the REAL committed snapshots (src/ingest/data/
 * natdex.json + natdex-moves.json). No DB / no network.
 */

import { describe, expect, it } from "vitest";

import {
  buildNatdexSpeciesRows,
  buildNatdexMoveRows,
} from "@/ingest/build-natdex";

describe("buildNatdexSpeciesRows", () => {
  const rows = buildNatdexSpeciesRows();
  const bySlug = new Map(rows.map((r) => [r.species, r]));

  it("covers the full national dex (>= 1000 species)", () => {
    expect(rows.length).toBeGreaterThanOrEqual(1000);
  });

  it("has Pikachu with natdex 25, yellow, capture_rate 190", () => {
    const pika = bySlug.get("pikachu");
    expect(pika).toBeDefined();
    expect(pika!.national_dex_number).toBe(25);
    expect(pika!.generation).toBe(1);
    expect(pika!.color).toBe("yellow");
    expect(pika!.capture_rate).toBe(190);
    expect(pika!.base_stat_total).toBe(320);
    expect(pika!.type1).toBe("electric");
    expect(pika!.type2).toBeNull();
    // Evolution parent resolves to a species slug.
    expect(pika!.evolves_from).toBe("pichu");
  });

  it("records a dual-type species' second type (Charizard: fire/flying)", () => {
    const char = bySlug.get("charizard");
    expect(char!.type1).toBe("fire");
    expect(char!.type2).toBe("flying");
    expect(char!.evolves_from).toBe("charmeleon");
  });

  it("leaves evolves_from null for a base-stage species (Bulbasaur)", () => {
    expect(bySlug.get("bulbasaur")!.evolves_from).toBeNull();
  });
});

describe("buildNatdexMoveRows", () => {
  const rows = buildNatdexMoveRows();
  const bySlug = new Map(rows.map((r) => [r.move_slug, r]));

  it("covers the Gen 1–4 gap: Fire Fang is a Gen 4 physical Fire move", () => {
    const ff = bySlug.get("fire-fang");
    expect(ff).toBeDefined();
    expect(ff!.generation).toBe(4);
    expect(ff!.type).toBe("fire");
    expect(ff!.damage_class).toBe("physical");
  });

  it("has a Gen 1 status move (Tackle is physical; Growl is status)", () => {
    expect(bySlug.get("tackle")!.generation).toBe(1);
    expect(bySlug.get("growl")!.damage_class).toBe("status");
  });
});
