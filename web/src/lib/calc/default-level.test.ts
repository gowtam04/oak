/**
 * `defaultCalcLevel(format)` — format-aware calculator level default.
 *
 * Production module is not required to exist yet — a failed resolve is the
 * intended red (P2 TDD).
 *
 * Requirement refs: CALC-US-7, CALC-AC-7.1, CALC-BR-7. ADR-13.
 *
 * Architecture: Champions (the only VGC/doubles-style member of `FORMATS`)
 * defaults to 50; every other Oak format defaults to 100. Do not invent extra
 * 50s. The matrix is locked against `FORMATS` so a newly added format fails
 * here until the helper (and, if ADR-13 then applies, this test) is updated.
 */

import { describe, expect, it } from "vitest";

import { FORMATS, type Format } from "@/data/formats";

import { defaultCalcLevel } from "./default-level";

describe("defaultCalcLevel", () => {
  it("returns 50 for champions (CALC-AC-7.1, CALC-BR-7, ADR-13)", () => {
    expect(defaultCalcLevel("champions")).toBe(50);
  });

  it.each(FORMATS.filter((format) => format !== "champions"))(
    "returns 100 for %s (CALC-AC-7.1, CALC-BR-7 — only Champions is VGC/doubles-style)",
    (format) => {
      expect(defaultCalcLevel(format)).toBe(100);
    },
  );

  it("covers every FORMATS member so a new format fails until the helper is updated (ADR-13)", () => {
    const levels = Object.fromEntries(
      FORMATS.map((format) => [format, defaultCalcLevel(format)]),
    ) as Record<Format, number>;

    expect(Object.keys(levels).sort()).toEqual([...FORMATS].sort());
    expect(FORMATS).toContain("champions");
    expect(levels.champions).toBe(50);

    const nonChampions = FORMATS.filter((format) => format !== "champions");
    expect(nonChampions.length).toBe(FORMATS.length - 1);
    for (const format of nonChampions) {
      expect(levels[format], format).toBe(100);
    }
  });
});
