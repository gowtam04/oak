/**
 * eval/cases.test.ts — structural unit tests for the Champions-first goldens.
 *
 * Owned by: phase "Eval" / track "cases" (champions-first P9).
 *
 * Tests the STRUCTURE and INTENT of cases.ts without any LLM or DB calls:
 *  - G1–G26 + G61 present, unique IDs, no wiki/SQL/OU/G55-fallback leftovers
 *  - every case is Champions-scoped
 *  - deterministic subset matches the CI plan
 *  - tool-efficiency cases specify query_pokedex (or the named tool)
 *  - status values are valid OakAnswer status strings
 *  - Champions success-criteria IDs are covered
 *  - derived exports are consistent
 *  - G61 team-from-box keep-and-warn via lookup_box
 */

import { describe, it, expect } from "vitest";
import {
  cases,
  caseById,
  deterministicCases,
  rebuildRegressionCases,
  type GoldenCase,
} from "./cases";

const VALID_STATUSES = new Set<string>([
  "answered",
  "clarification_needed",
  "resolution_failed",
  "insufficient_data",
]);

const EXPECTED_IDS = [
  ...Array.from({ length: 26 }, (_, i) => `G${i + 1}`),
  "G61",
];

const EXPECTED_DETERMINISTIC_IDS = new Set([
  "G1",
  "G3",
  "G5",
  "G6",
  "G8",
  "G11",
  "G15",
  "G17",
  "G61",
]);

const EXPECTED_REBUILD_REGRESSION_IDS = new Set([
  "G1",
  "G5",
  "G6",
  "G7",
  "G25",
]);

const QUERY_POKEDEX_EFFICIENCY_IDS = ["G1", "G5", "G6", "G8"];

const DROPPED_IDS = [
  "G27",
  "G28",
  "G32",
  "G35",
  "G44",
  "G47",
  "G54",
  "G55",
  "G56",
  "G57",
  "G58",
  "G59",
  "G60",
];

const REMOVED_TOOLS = ["run_sql", "search_wiki", "get_meta_usage", "get_encounters"];

function getCase(id: string): GoldenCase {
  const c = caseById[id];
  if (!c) throw new Error(`Case ${id} not found in caseById`);
  return c;
}

describe("eval/cases", () => {
  it("exports G1–G26 plus G61 (27 Champions goldens)", () => {
    expect(cases).toHaveLength(27);
    expect(cases.map((c) => c.id)).toEqual(EXPECTED_IDS);
  });

  it("all IDs follow the G<number> pattern and are unique", () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^G\d{1,2}$/);
    }
  });

  it("caseById indexes every case", () => {
    expect(Object.keys(caseById)).toHaveLength(27);
    for (const id of EXPECTED_IDS) {
      expect(caseById[id], `caseById["${id}"] should be defined`).toBeDefined();
    }
  });

  it("does not keep wiki/SQL/OU/G55-fallback/National Dex cases", () => {
    const ids = new Set(cases.map((c) => c.id));
    for (const id of DROPPED_IDS) {
      expect(ids.has(id), `${id} should have been dropped or retargeted away`).toBe(
        false,
      );
    }
  });

  it("never requires a removed tool as usedTool", () => {
    for (const c of cases) {
      const used = c.expect.toolEfficiency?.usedTool;
      if (used) {
        expect(REMOVED_TOOLS).not.toContain(used);
      }
    }
  });

  it.each(cases.map((c) => [c.id, c] as [string, GoldenCase]))(
    "%s is Champions-scoped",
    (_id, c) => {
      expect(c.mode).toBe("champions");
    },
  );

  it.each(cases.map((c) => [c.id, c] as [string, GoldenCase]))(
    "%s — required fields are present and well-typed",
    (_id, c) => {
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBeGreaterThan(0);

      if (Array.isArray(c.input)) {
        expect((c.input as string[]).length).toBeGreaterThanOrEqual(2);
        for (const turn of c.input as string[]) {
          expect(typeof turn).toBe("string");
          expect(turn.length).toBeGreaterThan(0);
        }
      } else {
        expect(typeof c.input).toBe("string");
        expect((c.input as string).length).toBeGreaterThan(0);
      }

      expect(c.expect).toBeDefined();
      expect(typeof c.expect).toBe("object");
      expect(c.expect).not.toBeNull();

      if (c.expect.status !== undefined) {
        expect(
          VALID_STATUSES.has(c.expect.status),
          `${c.id} status "${c.expect.status}" is not a valid OakAnswer status`,
        ).toBe(true);
      }

      if (c.expect.minCandidates !== undefined) {
        expect(Number.isInteger(c.expect.minCandidates)).toBe(true);
        expect(c.expect.minCandidates).toBeGreaterThan(0);
      }

      if (c.expect.mustCite !== undefined) {
        expect(Array.isArray(c.expect.mustCite)).toBe(true);
        expect(c.expect.mustCite.length).toBeGreaterThan(0);
        for (const s of c.expect.mustCite) {
          expect(typeof s).toBe("string");
          expect(s.length).toBeGreaterThan(0);
        }
      }

      if (c.expect.mustInclude !== undefined) {
        expect(Array.isArray(c.expect.mustInclude)).toBe(true);
        expect(c.expect.mustInclude.length).toBeGreaterThan(0);
        for (const s of c.expect.mustInclude) {
          expect(typeof s).toBe("string");
          expect(s.length).toBeGreaterThan(0);
        }
      }

      if (c.expect.toolEfficiency !== undefined) {
        expect(typeof c.expect.toolEfficiency.usedTool).toBe("string");
        expect(c.expect.toolEfficiency.usedTool.length).toBeGreaterThan(0);
        expect(
          Number.isInteger(c.expect.toolEfficiency.maxPerPokemonFetches),
        ).toBe(true);
        expect(
          c.expect.toolEfficiency.maxPerPokemonFetches,
        ).toBeGreaterThanOrEqual(0);
      }

      for (const key of [
        "forbiddenTools",
        "proposedTeamSpecies",
        "proposedTeamWarningCodes",
      ] as const) {
        const arr = c.expect[key];
        if (arr === undefined) continue;
        expect(Array.isArray(arr)).toBe(true);
        expect(arr.length).toBeGreaterThan(0);
        for (const s of arr) {
          expect(typeof s).toBe("string");
          expect(s.length).toBeGreaterThan(0);
        }
      }

      if (c.expect.deterministic !== undefined) {
        expect(typeof c.expect.deterministic).toBe("boolean");
      }

      expect(Array.isArray(c.covers)).toBe(true);
      expect(c.covers.length).toBeGreaterThan(0);
      for (const req of c.covers) {
        expect(typeof req).toBe("string");
        expect(req.length).toBeGreaterThan(0);
      }
    },
  );

  describe("multi-turn (G19)", () => {
    it("G19 input is an array of exactly 2 turns", () => {
      const g19 = getCase("G19");
      expect(Array.isArray(g19.input)).toBe(true);
      expect((g19.input as string[]).length).toBe(2);
    });

    it("only G19 has an array input", () => {
      const multiTurn = cases.filter((c) => Array.isArray(c.input));
      expect(multiTurn).toHaveLength(1);
      expect(multiTurn[0].id).toBe("G19");
    });

    it("G19 first turn is the Trick Room + Will-O-Wisp query", () => {
      const g19 = getCase("G19");
      const turns = g19.input as string[];
      expect(turns[0].toLowerCase()).toContain("trick room");
      expect(turns[0].toLowerCase()).toContain("will-o-wisp");
    });
  });

  describe("deterministic CI subset", () => {
    it("deterministicCases contains all expected IDs", () => {
      const actual = new Set(deterministicCases.map((c) => c.id));
      expect(actual).toEqual(EXPECTED_DETERMINISTIC_IDS);
    });

    it("every entry in deterministicCases has deterministic:true", () => {
      for (const c of deterministicCases) {
        expect(
          c.expect.deterministic,
          `${c.id} should have deterministic:true`,
        ).toBe(true);
      }
    });

    it("deterministicCases is a subset of cases (same objects by reference)", () => {
      const caseSet = new Set(cases);
      for (const c of deterministicCases) {
        expect(caseSet.has(c)).toBe(true);
      }
    });

    it("G3 is deterministic — resolve_entity suggestion check", () => {
      const g3 = getCase("G3");
      expect(g3.expect.deterministic).toBe(true);
      expect(g3.expect.status).toBe("clarification_needed");
      expect(g3.expect.mustInclude).toContain("Will-O-Wisp");
    });

    it("G11 is deterministic — type immunity assertion", () => {
      const g11 = getCase("G11");
      expect(g11.expect.deterministic).toBe(true);
      expect(g11.expect.mustInclude).toContain("immune");
    });

    it("G15 is deterministic — Champions Stat Points Speed = 169", () => {
      const g15 = getCase("G15");
      expect(g15.expect.deterministic).toBe(true);
      expect(g15.expect.mustInclude).toContain("169");
      expect((g15.input as string).toLowerCase()).toContain("stat point");
    });

    it("G17 is deterministic — off-roster decline names Excadrill", () => {
      const g17 = getCase("G17");
      expect(g17.expect.deterministic).toBe(true);
      expect(g17.expect.status).toBe("answered");
      expect(g17.expect.mustInclude).toContain("Excadrill");
      expect(g17.expect.mustInclude).toContain("not in the Champions roster");
      expect(g17.expect.toolEfficiency?.usedTool).toBe("resolve_entity");
    });
  });

  describe("tool-efficiency assertions", () => {
    it.each(QUERY_POKEDEX_EFFICIENCY_IDS)(
      "%s has a query_pokedex toolEfficiency assertion",
      (id) => {
        expect(getCase(id).expect.toolEfficiency?.usedTool).toBe(
          "query_pokedex",
        );
        expect(getCase(id).expect.toolEfficiency?.maxPerPokemonFetches).toBe(0);
        expect(getCase(id).expect.deterministic).toBe(true);
      },
    );
  });

  describe("rebuildRegressionCases", () => {
    it("contains G1/G5/G6/G7/G25 (Champions roster filters + spread mechanics)", () => {
      const actual = new Set(rebuildRegressionCases.map((c) => c.id));
      expect(actual).toEqual(EXPECTED_REBUILD_REGRESSION_IDS);
    });

    it("is a subset of cases (same objects by reference)", () => {
      const caseSet = new Set(cases);
      for (const c of rebuildRegressionCases) {
        expect(caseSet.has(c)).toBe(true);
      }
    });
  });

  describe("status coverage", () => {
    it("at least one case asserts each of: answered, clarification_needed, insufficient_data", () => {
      const usedStatuses = new Set(
        cases
          .filter((c) => c.expect.status !== undefined)
          .map((c) => c.expect.status!),
      );
      expect(usedStatuses.has("answered")).toBe(true);
      expect(usedStatuses.has("clarification_needed")).toBe(true);
      expect(usedStatuses.has("insufficient_data")).toBe(true);
    });

    it("G3 status is clarification_needed (misspelled entity → suggestions)", () => {
      expect(getCase("G3").expect.status).toBe("clarification_needed");
    });

    it("G22 status is insufficient_data (index unavailable)", () => {
      expect(getCase("G22").expect.status).toBe("insufficient_data");
    });
  });

  describe("mustCite presence on factual cases", () => {
    it("G1 cites both learnsets", () => {
      const sources = getCase("G1").expect.mustCite!;
      expect(sources.some((s) => s.includes("trick-room"))).toBe(true);
      expect(sources.some((s) => s.includes("will-o-wisp"))).toBe(true);
    });

    it("G4 cites the move and the ability", () => {
      const sources = getCase("G4").expect.mustCite!;
      expect(sources.some((s) => s.includes("fake-out"))).toBe(true);
      expect(sources.some((s) => s.includes("armor-tail"))).toBe(true);
    });

    it("G11 cites the ground type", () => {
      expect(getCase("G11").expect.mustCite?.some((s) => s.includes("ground"))).toBe(
        true,
      );
    });

    it("G13 cites the leftovers item", () => {
      expect(
        getCase("G13").expect.mustCite?.some((s) => s.includes("leftovers")),
      ).toBe(true);
    });

    it("G24 cites leftovers despite the citation-suppression prompt injection", () => {
      expect(
        getCase("G24").expect.mustCite?.some((s) => s.includes("leftovers")),
      ).toBe(true);
    });
  });

  describe("Champions goldens (Stat Points, T15, Mega, off-roster)", () => {
    it("G10 is a Mega Evolution case (no Tera)", () => {
      const g10 = getCase("G10");
      expect((g10.input as string).toLowerCase()).toContain("mega");
      expect(g10.expect.mustInclude).toContain("Mega");
      expect(g10.expect.rubricNote?.toLowerCase()).toContain("tera");
      expect(g10.covers).toEqual(
        expect.arrayContaining(["CF-INT-BR-1"]),
      );
    });

    it("G14 requires the 66/32 Stat Point budget", () => {
      const g14 = getCase("G14");
      expect(g14.expect.mustInclude).toEqual(
        expect.arrayContaining(["66", "32"]),
      );
      expect((g14.input as string).toLowerCase()).toContain("stat point");
    });

    it("G15 asks for max Speed Stat Points, not 252 EVs", () => {
      const input = (getCase("G15").input as string).toLowerCase();
      expect(input).toContain("stat point");
      expect(input).not.toContain("ev");
    });

    it("G17 declines Excadrill / Gen 5 with the user-facing roster phrase", () => {
      const g17 = getCase("G17");
      expect((g17.input as string).toLowerCase()).toContain("excadrill");
      expect((g17.input as string).toLowerCase()).toContain("gen 5");
      expect(g17.expect.mustInclude).toContain("not in the Champions roster");
    });

    it("G26 routes live usage through get_usage_stats and forbids Smogon/wiki/SQL", () => {
      const g26 = getCase("G26");
      expect(g26.expect.toolEfficiency?.usedTool).toBe("get_usage_stats");
      expect(g26.expect.forbiddenTools).toEqual(
        expect.arrayContaining(["get_meta_usage", "run_sql", "search_wiki"]),
      );
      expect(g26.expect.deterministic).toBeUndefined();
    });
  });

  describe("mustInclude critical terms", () => {
    it("G11 requires 'immune' (not just 'not very effective')", () => {
      expect(getCase("G11").expect.mustInclude).toContain("immune");
    });

    it("G15 requires '169' (exact stat value)", () => {
      expect(getCase("G15").expect.mustInclude).toContain("169");
    });

    it("G16 requires 'estimate' (damage range is an estimate)", () => {
      expect(getCase("G16").expect.mustInclude).toContain("estimate");
    });

    it("G9 requires both 'dragon' and 'ground' (Garchomp's types)", () => {
      const mustInclude = getCase("G9").expect.mustInclude ?? [];
      expect(mustInclude).toContain("dragon");
      expect(mustInclude).toContain("ground");
    });

    it("G12 requires 'grass' and 'electric' (Water weaknesses)", () => {
      const mustInclude = getCase("G12").expect.mustInclude ?? [];
      expect(mustInclude).toContain("grass");
      expect(mustInclude).toContain("electric");
    });
  });

  it("G18 requires minCandidates >= 2 (multiple Tauros forms must be shown)", () => {
    const g18 = getCase("G18");
    expect(g18.expect.minCandidates).toBeDefined();
    expect(g18.expect.minCandidates!).toBeGreaterThanOrEqual(2);
  });

  describe("requirement coverage", () => {
    const allCovers = cases.flatMap((c) => c.covers);

    const keyRequirements = [
      "US-1",
      "US-2",
      "US-3",
      "US-6",
      "US-7",
      "US-10",
      "US-11",
      "US-12",
      "AC-1.2",
      "AC-1.3",
      "AC-2.2",
      "AC-3.1",
      "AC-3.2",
      "AC-3.3",
      "AC-4.1",
      "AC-6.1",
      "AC-7.1",
      "AC-7.2",
      "AC-7.3",
      "AC-8.1",
      "AC-9.1",
      "AC-9.2",
      "AC-10.1",
      "BR-2",
      "BR-3",
      "BR-4",
      "BR-5",
      "BR-6",
      "BR-7",
      "BR-9",
      "D8",
      "NFR-reliability",
      "BOX-AC-1.2",
      "BOX-AC-2.4",
      "BOX-AC-3.1",
      "CF-SC-2",
      "CF-SC-4",
      "CF-INT-BR-1",
      "CF-INT-BR-4",
      "CF-CHAT-AC-2.1",
    ];

    it.each(keyRequirements)("%s is covered by at least one case", (req) => {
      expect(
        allCovers.some((c) => c.includes(req)),
        `Requirement ${req} should be covered by some case`,
      ).toBe(true);
    });
  });

  describe("G61 team-from-box (Mega Kangaskhan keep-and-warn)", () => {
    it("is deterministic and routes through lookup_box", () => {
      const g61 = getCase("G61");
      expect(g61.expect.deterministic).toBe(true);
      expect(g61.expect.status).toBe("answered");
      expect(g61.expect.toolEfficiency?.usedTool).toBe("lookup_box");
      expect(g61.expect.toolEfficiency?.maxPerPokemonFetches).toBe(0);
    });

    it("structurally requires kangaskhan-mega on proposed_team with learnset_unavailable", () => {
      const g61 = getCase("G61");
      expect(g61.expect.proposedTeamSpecies).toEqual(["kangaskhan-mega"]);
      expect(g61.expect.proposedTeamWarningCodes).toEqual([
        "learnset_unavailable",
      ]);
      expect(g61.expect.forbiddenTools).toEqual(
        expect.arrayContaining(["run_sql", "search_wiki"]),
      );
    });

    it("covers BOX-AC-1.2, BOX-AC-2.4, and BOX-AC-3.1", () => {
      expect(getCase("G61").covers).toEqual(
        expect.arrayContaining(["BOX-AC-1.2", "BOX-AC-2.4", "BOX-AC-3.1"]),
      );
    });

    it("input is a box-build paste that names Mega Kangaskhan", () => {
      const input = getCase("G61").input;
      expect(typeof input).toBe("string");
      expect((input as string).toLowerCase()).toContain("mega kangaskhan");
    });
  });
});
