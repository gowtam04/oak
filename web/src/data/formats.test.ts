/**
 * Unit tests for the pure format↔mode mappings.
 *
 * Champions-first (ADR-3 / ADR-4): `FORMATS` remains the historical stored-row
 * union so archived teams and old conversations still decode (`isFormat("gen-7")`
 * etc.). Ingest / product default is Champions only — `DEFAULT_FORMATS` is
 * exactly `["champions"]`, not the full `FORMATS` tuple.
 *
 * `formats.ts` is a client-safe portable module (only type-only imports), so
 * this needs no DB, no @pkmn, and no `server-only` mock.
 */

import { describe, expect, it } from "vitest";

import {
  FORMATS,
  DEFAULT_FORMATS,
  STANDARD_FORMAT,
  CHAMPIONS_FORMAT,
  NATDEX_FORMAT,
  formatForMode,
  modeForFormat,
  genNumberForFormat,
  basisForFormat,
  isFormat,
  type Format,
} from "./formats";
import type { AgentMode } from "@/agent/types";

describe("FORMATS", () => {
  it("keeps the historical stored-row union so archived formats still decode (ADR-3)", () => {
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

  it("DEFAULT_FORMATS is exactly [\"champions\"] — not FORMATS (ADR-4, CF-DATA-BR-3)", () => {
    expect([...DEFAULT_FORMATS]).toEqual(["champions"]);
    expect(DEFAULT_FORMATS).not.toEqual(FORMATS);
    expect(DEFAULT_FORMATS).not.toContain("gen-7");
    expect(DEFAULT_FORMATS).not.toContain("national-dex");
    expect(DEFAULT_FORMATS).not.toContain("scarlet-violet");
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

describe("isFormat", () => {
  it("accepts every FORMATS entry and rejects near-misses", () => {
    for (const f of FORMATS) expect(isFormat(f)).toBe(true);
    for (const bad of ["gen-9", "gen-0", "standard", "sv", "", "GEN-7"]) {
      expect(isFormat(bad)).toBe(false);
    }
  });

  it("accepts archived stored-row values like gen-7 (ADR-3)", () => {
    expect(isFormat("gen-7")).toBe(true);
    expect(isFormat("national-dex")).toBe(true);
    expect(isFormat("scarlet-violet")).toBe(true);
    expect(isFormat("champions")).toBe(true);
  });
});
