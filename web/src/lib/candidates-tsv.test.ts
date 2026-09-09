/**
 * Visible candidate rows → tab-separated values (TBL-US-4).
 *
 * Production module is not required to exist yet — a failed resolve is the
 * intended red (P5 TDD). No API — client-only clipboard/share payload.
 *
 *   candidatesToTsv(rows: CandidateRow[]): string
 *
 * Columns match the candidate table / human-md fact table (TBL-AC-4.1):
 *   Name, Types, then per-stat columns when present (HP, Attack, Defense,
 *   SpA, SpD, Speed — separate columns so Sheets/Excel/Numbers split them),
 *   then Ability when any visible row names one. `key_stats` columns are
 *   used only when no row has `base_stats`.
 *
 * The caller passes the **currently visible** set (after sort / filter /
 * in-table pin). Hidden remainder is never included (TBL-BR-1).
 *
 * Requirement refs: TBL-US-4, TBL-AC-4.1, TBL-AC-4.2, TBL-AC-4.4, TBL-BR-1,
 * TBL-BR-3.
 */

import { describe, expect, it } from "vitest";

import type { Candidates } from "@/agent/schemas";

import { candidatesToTsv } from "./candidates-tsv";

type CandidateRow = Candidates["shown"][number];

const GARCHOMP: CandidateRow = {
  name: "Garchomp",
  dex_number: 445,
  types: ["dragon", "ground"],
  base_stats: {
    hp: 108,
    attack: 130,
    defense: 95,
    special_attack: 80,
    special_defense: 85,
    speed: 102,
  },
};

const DRAGONITE: CandidateRow = {
  name: "Dragonite",
  dex_number: 149,
  types: ["dragon", "flying"],
  base_stats: {
    hp: 91,
    attack: 134,
    defense: 95,
    special_attack: 100,
    special_defense: 100,
    speed: 80,
  },
};

function lines(tsv: string): string[] {
  return tsv.split("\n");
}

function cells(line: string): string[] {
  return line.split("\t");
}

describe("candidatesToTsv — visible rows (TBL-US-4, TBL-AC-4.1)", () => {
  it("emits a header + one TSV row per visible candidate, stats as separate columns", () => {
    const tsv = candidatesToTsv([GARCHOMP, DRAGONITE]);
    const [header, ...body] = lines(tsv);
    expect(cells(header)).toEqual([
      "Name",
      "Types",
      "HP",
      "Attack",
      "Defense",
      "SpA",
      "SpD",
      "Speed",
    ]);
    expect(body).toHaveLength(2);
    expect(cells(body[0]!)).toEqual([
      "Garchomp",
      "dragon/ground",
      "108",
      "130",
      "95",
      "80",
      "85",
      "102",
    ]);
    expect(cells(body[1]!)).toEqual([
      "Dragonite",
      "dragon/flying",
      "91",
      "134",
      "95",
      "100",
      "100",
      "80",
    ]);
    expect(tsv).not.toContain(",");
    expect(tsv).toContain("\t");
  });

  it("preserves caller order (sort/filter/pin already applied — TBL-BR-1)", () => {
    const tsv = candidatesToTsv([DRAGONITE, GARCHOMP]);
    const body = lines(tsv).slice(1);
    expect(cells(body[0]!)[0]).toBe("Dragonite");
    expect(cells(body[1]!)[0]).toBe("Garchomp");
  });

  it("adds an Ability column when any visible row names one", () => {
    const tsv = candidatesToTsv([
      { ...GARCHOMP, ability: "rough-skin" },
      DRAGONITE,
    ]);
    const [header, ...body] = lines(tsv);
    expect(cells(header)).toEqual([
      "Name",
      "Types",
      "HP",
      "Attack",
      "Defense",
      "SpA",
      "SpD",
      "Speed",
      "Ability",
    ]);
    expect(cells(body[0]!).at(-1)).toBe("rough-skin");
    expect(cells(body[1]!).at(-1)).toBe("");
  });

  it("uses key_stats columns when no visible row has base_stats", () => {
    const tsv = candidatesToTsv([
      {
        name: "Garchomp",
        types: ["dragon", "ground"],
        key_stats: { speed: 102, attack: 130 },
      },
      {
        name: "Dragonite",
        types: ["dragon", "flying"],
        key_stats: { speed: 80 },
      },
    ]);
    const [header, ...body] = lines(tsv);
    expect(cells(header)).toEqual(["Name", "Types", "Speed", "Attack"]);
    expect(cells(body[0]!)).toEqual(["Garchomp", "dragon/ground", "102", "130"]);
    expect(cells(body[1]!)).toEqual(["Dragonite", "dragon/flying", "80", ""]);
  });

  it("emits Name+Types only when visible rows have no stats", () => {
    const tsv = candidatesToTsv([
      { name: "Garchomp", types: ["dragon", "ground"] },
      { name: "Dragonite", types: ["dragon", "flying"] },
    ]);
    const [header, ...body] = lines(tsv);
    expect(cells(header)).toEqual(["Name", "Types"]);
    expect(body).toEqual(["Garchomp\tdragon/ground", "Dragonite\tdragon/flying"]);
  });

  it("does not include rows the caller did not pass (shown set only — TBL-BR-1)", () => {
    const tsv = candidatesToTsv([GARCHOMP]);
    expect(tsv).toContain("Garchomp");
    expect(tsv).not.toContain("Dragonite");
    expect(lines(tsv)).toHaveLength(2);
  });
});

describe("candidatesToTsv — empty visible set (TBL-AC-4.4)", () => {
  it("returns an empty string when there are no rows to copy", () => {
    expect(candidatesToTsv([])).toBe("");
  });
});
