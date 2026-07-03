/**
 * Unit test for buildClassicEncounterRows — exercises the OFFLINE builder
 * against the REAL committed gzipped snapshot
 * (src/ingest/data/classic-encounters.json.gz). No DB / no network.
 */

import { describe, expect, it } from "vitest";

import { buildClassicEncounterRows } from "@/ingest/build-classic-encounters";

describe("buildClassicEncounterRows", () => {
  const rows = buildClassicEncounterRows();

  it("builds a large, Gens 1–7 encounter table", () => {
    expect(rows.length).toBeGreaterThan(10000);
  });

  it("assigns unique sequential ids (a valid synthetic PK)", () => {
    expect(rows[0]!.id).toBe(0);
    expect(rows[rows.length - 1]!.id).toBe(rows.length - 1);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it("has at least one Gen 2 route encounter (gold/silver/crystal)", () => {
    const gen2 = rows.filter(
      (r) =>
        (r.version === "gold" ||
          r.version === "silver" ||
          r.version === "crystal") &&
        r.location.includes("route"),
    );
    expect(gen2.length).toBeGreaterThan(0);
    // Rows carry a species slug and a method.
    expect(gen2[0]!.species).toBeTruthy();
    expect(gen2[0]!.method).toBeTruthy();
  });
});
