/**
 * Unit test for buildMachineRows — exercises the OFFLINE builder against the
 * REAL committed snapshot (src/ingest/data/machines.json). No DB / no network.
 */

import { describe, expect, it } from "vitest";

import { buildMachineRows } from "@/ingest/build-machines";

describe("buildMachineRows", () => {
  const rows = buildMachineRows();

  it("builds a non-trivial set of machines", () => {
    expect(rows.length).toBeGreaterThan(1000);
  });

  it("has Fly as HM02 in the heartgold-soulsilver version group", () => {
    const fly = rows.find(
      (r) =>
        r.version_group === "heartgold-soulsilver" && r.move_slug === "fly",
    );
    expect(fly).toBeDefined();
    expect(fly!.machine).toBe("HM02");
    expect(fly!.item_slug).toBe("hm02");
  });

  it("uses uppercased machine labels (TM/HM/TR)", () => {
    expect(
      rows.every((r) => /^(TM|HM|TR)\d+$/.test(r.machine)),
    ).toBe(true);
  });
});
