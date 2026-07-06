/**
 * Unit tests for the pure format↔mode mappings (generation-scope GS-D1/GS-D2,
 * widened by the National Dex scope feature to 11 formats).
 *
 * `formats.ts` is a client-safe portable module (only type-only imports), so
 * this needs no DB, no @pkmn, and no `server-only` mock. It pins:
 *   - the stable 11-entry FORMATS tuple,
 *   - the formatForMode/modeForFormat round-trip for every format + mode,
 *   - the genNumberForFormat / basisForFormat tables.
 */

import { describe, expect, it } from "vitest";

import {
  FORMATS,
  DEFAULT_FORMATS,
  STANDARD_FORMAT,
  CHAMPIONS_FORMAT,
  NATDEX_FORMAT,
  SCOPE_PICKER_ORDER,
  formatForMode,
  modeForFormat,
  genNumberForFormat,
  basisForFormat,
  isFormat,
  type Format,
} from "./formats";
import type { AgentMode } from "@/agent/types";

describe("FORMATS", () => {
  it("is the stable 11-entry tuple in the documented order (GS-D1, National Dex scope)", () => {
    expect([...FORMATS]).toEqual([
      "scarlet-violet",
      "champions",
      "gen-5",
      "gen-6",
      "gen-7",
      "gen-8",
      "national-dex",
      "gen-4",
      "gen-3",
      "gen-2",
      "gen-1",
    ]);
  });

  it("DEFAULT_FORMATS is FORMATS (ingest builds everything by default)", () => {
    expect(DEFAULT_FORMATS).toBe(FORMATS);
  });

  it("keeps the standard/champions/national-dex constants pointed at their formats", () => {
    expect(STANDARD_FORMAT).toBe("scarlet-violet");
    expect(CHAMPIONS_FORMAT).toBe("champions");
    expect(NATDEX_FORMAT).toBe("national-dex");
  });
});

describe("formatForMode ∘ modeForFormat round-trips for every format", () => {
  it.each(FORMATS)("format %s survives modeForFormat → formatForMode", (format) => {
    expect(formatForMode(modeForFormat(format))).toBe(format);
  });
});

describe("modeForFormat ∘ formatForMode round-trips for every mode", () => {
  const MODES: AgentMode[] = [
    "standard",
    "champions",
    "national-dex",
    "gen-8",
    "gen-7",
    "gen-6",
    "gen-5",
    "gen-4",
    "gen-3",
    "gen-2",
    "gen-1",
  ];
  it.each(MODES)("mode %s survives formatForMode → modeForFormat", (mode) => {
    expect(modeForFormat(formatForMode(mode))).toBe(mode);
  });
});

describe("formatForMode — direct mapping", () => {
  const CASES: Array<[AgentMode, Format]> = [
    ["standard", "scarlet-violet"],
    ["champions", "champions"],
    ["national-dex", "national-dex"],
    ["gen-8", "gen-8"],
    ["gen-7", "gen-7"],
    ["gen-6", "gen-6"],
    ["gen-5", "gen-5"],
    ["gen-4", "gen-4"],
    ["gen-3", "gen-3"],
    ["gen-2", "gen-2"],
    ["gen-1", "gen-1"],
  ];
  it.each(CASES)("mode %s → format %s", (mode, expected) => {
    expect(formatForMode(mode)).toBe(expected);
  });
});

describe("modeForFormat — direct mapping", () => {
  const CASES: Array<[Format, AgentMode]> = [
    ["scarlet-violet", "standard"],
    ["champions", "champions"],
    ["national-dex", "national-dex"],
    ["gen-8", "gen-8"],
    ["gen-7", "gen-7"],
    ["gen-6", "gen-6"],
    ["gen-5", "gen-5"],
    ["gen-4", "gen-4"],
    ["gen-3", "gen-3"],
    ["gen-2", "gen-2"],
    ["gen-1", "gen-1"],
  ];
  it.each(CASES)("format %s → mode %s", (format, expected) => {
    expect(modeForFormat(format)).toBe(expected);
  });
});

describe("genNumberForFormat", () => {
  const CASES: Array<[Format, number]> = [
    ["scarlet-violet", 9],
    ["champions", 9], // Champions rides the Gen 9 dex
    ["national-dex", 9], // National Dex also rides the Gen 9 dex
    ["gen-8", 8],
    ["gen-7", 7],
    ["gen-6", 6],
    ["gen-5", 5],
    ["gen-4", 4],
    ["gen-3", 3],
    ["gen-2", 2],
    ["gen-1", 1],
  ];
  it.each(CASES)("%s → gen %d", (format, expected) => {
    expect(genNumberForFormat(format)).toBe(expected);
  });
});

describe("basisForFormat", () => {
  const CASES: Array<[Format, string]> = [
    ["scarlet-violet", "gen-9"], // storage name differs from the basis tag
    ["champions", "champions"],
    ["national-dex", "national-dex"], // falls through to its own format name
    ["gen-8", "gen-8"],
    ["gen-7", "gen-7"],
    ["gen-6", "gen-6"],
    ["gen-5", "gen-5"],
    ["gen-4", "gen-4"],
    ["gen-3", "gen-3"],
    ["gen-2", "gen-2"],
    ["gen-1", "gen-1"],
  ];
  it.each(CASES)("%s → basis %s", (format, expected) => {
    expect(basisForFormat(format)).toBe(expected);
  });
});

describe("SCOPE_PICKER_ORDER", () => {
  it("contains exactly the same members as FORMATS (no additions or omissions)", () => {
    expect([...SCOPE_PICKER_ORDER].sort()).toEqual([...FORMATS].sort());
  });

  it("starts with national-dex (the default scope)", () => {
    expect(SCOPE_PICKER_ORDER[0]).toBe("national-dex");
  });

  it("lists champions next, then mainline gens in release-date descending order", () => {
    // Expected: national-dex, champions, scarlet-violet, gen-8..gen-1
    expect([...SCOPE_PICKER_ORDER]).toEqual([
      "national-dex",
      "champions",
      "scarlet-violet",
      "gen-8",
      "gen-7",
      "gen-6",
      "gen-5",
      "gen-4",
      "gen-3",
      "gen-2",
      "gen-1",
    ]);
  });
});

describe("isFormat", () => {
  it("accepts every FORMATS entry and rejects near-misses", () => {
    for (const f of FORMATS) expect(isFormat(f)).toBe(true);
    for (const bad of ["gen-9", "gen-0", "standard", "sv", "", "GEN-7"]) {
      expect(isFormat(bad)).toBe(false);
    }
  });

  it("now accepts gen-4 (widened by the National Dex scope feature)", () => {
    expect(isFormat("gen-4")).toBe(true);
  });
});
