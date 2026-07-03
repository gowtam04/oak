/**
 * Unit test for buildPmdRows — exercises the OFFLINE builder against the REAL
 * committed snapshot (src/ingest/data/pmd.json). No DB / no network.
 */

import { describe, expect, it } from "vitest";

import { buildPmdRows } from "@/ingest/build-pmd";

describe("buildPmdRows", () => {
  const rows = buildPmdRows();

  it("covers both PMD games", () => {
    const games = new Set(rows.map((r) => r.game));
    expect(games.has("red-blue-rescue-team")).toBe(true);
    expect(games.has("explorers-of-sky")).toBe(true);
  });

  it("keys recruits by the canonical species slug (Bulbasaur)", () => {
    const bulba = rows.filter((r) => r.species === "bulbasaur");
    expect(bulba.length).toBeGreaterThan(0);
    const rt = bulba.find((r) => r.game === "red-blue-rescue-team");
    expect(rt).toBeDefined();
    expect(rt!.location).toContain("Starter");
    expect(rt!.recruit_rate).toBe("12.5%");
    expect(rt!.friend_area).toBe("Beau Plains");
  });
});
