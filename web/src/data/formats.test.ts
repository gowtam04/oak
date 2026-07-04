/**
 * Unit tests for the pure format↔mode mappings (generation-scope GS-D1/GS-D2).
 *
 * `formats.ts` is a client-safe portable module (only type-only imports), so
 * this needs no DB, no @pkmn, and no `server-only` mock. It pins:
 *   - the stable 6-entry FORMATS tuple,
 *   - the formatForMode/modeForFormat round-trip for every format + mode,
 *   - the genNumberForFormat / basisForFormat tables.
 */

import { describe, expect, it } from "vitest";

import {
  FORMATS,
  DEFAULT_FORMATS,
  STANDARD_FORMAT,
  CHAMPIONS_FORMAT,
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
  it("is the stable 6-entry tuple in the documented order (GS-D1)", () => {
    expect([...FORMATS]).toEqual([
      "scarlet-violet",
      "champions",
      "gen-5",
      "gen-6",
      "gen-7",
      "gen-8",
    ]);
  });

  it("DEFAULT_FORMATS is FORMATS (ingest builds everything by default)", () => {
    expect(DEFAULT_FORMATS).toBe(FORMATS);
  });

  it("keeps the standard/champions constants pointed at their formats", () => {
    expect(STANDARD_FORMAT).toBe("scarlet-violet");
    expect(CHAMPIONS_FORMAT).toBe("champions");
  });
});

describe("formatForMode ∘ modeForFormat round-trips for every format", () => {
  it.each(FORMATS)("format %s survives modeForFormat → formatForMode", (format) => {
    expect(formatForMode(modeForFormat(format))).toBe(format);
  });
});

describe("modeForFormat ∘ formatForMode round-trips for every mode", () => {
  const MODES: AgentMode[] = ["standard", "champions", "gen-5", "gen-6", "gen-7", "gen-8"];
  it.each(MODES)("mode %s survives formatForMode → modeForFormat", (mode) => {
    expect(modeForFormat(formatForMode(mode))).toBe(mode);
  });
});

describe("formatForMode — direct mapping", () => {
  const CASES: Array<[AgentMode, Format]> = [
    ["standard", "scarlet-violet"],
    ["champions", "champions"],
    ["gen-5", "gen-5"],
    ["gen-6", "gen-6"],
    ["gen-7", "gen-7"],
    ["gen-8", "gen-8"],
  ];
  it.each(CASES)("mode %s → format %s", (mode, expected) => {
    expect(formatForMode(mode)).toBe(expected);
  });
});

describe("modeForFormat — direct mapping", () => {
  const CASES: Array<[Format, AgentMode]> = [
    ["scarlet-violet", "standard"],
    ["champions", "champions"],
    ["gen-5", "gen-5"],
    ["gen-6", "gen-6"],
    ["gen-7", "gen-7"],
    ["gen-8", "gen-8"],
  ];
  it.each(CASES)("format %s → mode %s", (format, expected) => {
    expect(modeForFormat(format)).toBe(expected);
  });
});

describe("genNumberForFormat", () => {
  const CASES: Array<[Format, number]> = [
    ["scarlet-violet", 9],
    ["champions", 9], // Champions rides the Gen 9 dex
    ["gen-5", 5],
    ["gen-6", 6],
    ["gen-7", 7],
    ["gen-8", 8],
  ];
  it.each(CASES)("%s → gen %d", (format, expected) => {
    expect(genNumberForFormat(format)).toBe(expected);
  });
});

describe("basisForFormat", () => {
  const CASES: Array<[Format, string]> = [
    ["scarlet-violet", "gen-9"], // storage name differs from the basis tag
    ["champions", "champions"],
    ["gen-5", "gen-5"],
    ["gen-6", "gen-6"],
    ["gen-7", "gen-7"],
    ["gen-8", "gen-8"],
  ];
  it.each(CASES)("%s → basis %s", (format, expected) => {
    expect(basisForFormat(format)).toBe(expected);
  });
});

describe("SCOPE_PICKER_ORDER", () => {
  it("contains exactly the same members as FORMATS (no additions or omissions)", () => {
    expect([...SCOPE_PICKER_ORDER].sort()).toEqual([...FORMATS].sort());
  });

  it("starts with champions (the default scope)", () => {
    expect(SCOPE_PICKER_ORDER[0]).toBe("champions");
  });

  it("lists mainline gens in release-date descending order after champions", () => {
    // Expected: champions, scarlet-violet, gen-8, gen-7, gen-6, gen-5
    expect([...SCOPE_PICKER_ORDER]).toEqual([
      "champions",
      "scarlet-violet",
      "gen-8",
      "gen-7",
      "gen-6",
      "gen-5",
    ]);
  });
});

describe("isFormat", () => {
  it("accepts every FORMATS entry and rejects near-misses", () => {
    for (const f of FORMATS) expect(isFormat(f)).toBe(true);
    for (const bad of ["gen-9", "gen-4", "standard", "sv", "", "GEN-7"]) {
      expect(isFormat(bad)).toBe(false);
    }
  });
});
