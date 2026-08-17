/**
 * Phase 7 lockstep oracle — human-readable copy projection.
 *
 * iOS `OakAnswerHumanMarkdownTests` and Android `HumanMarkdownTest` must clone
 * these fixtures and the same inclusions/exclusions. Do not drift the BASE
 * shape or the required/forbidden strings without updating all three clients.
 *
 * Requirement refs: COPY-US-1, COPY-AC-1.1, COPY-AC-1.2, COPY-AC-1.3,
 * COPY-BR-1, COPY-BR-2. ADR-9.
 *
 * Lockstep with web `oak-answer-human-md.ts` / iOS `OakAnswerHumanMarkdown`
 * / Android `HumanMarkdown`.
 */

import { describe, expect, it } from "vitest";

import type { OakAnswer } from "@/agent/schemas";
import type { TeamMember } from "@/data/teams/team-schema";

import { oakAnswerToAgentMarkdown } from "./oak-answer-agent-md";
import { oakAnswerToHumanMarkdown } from "./oak-answer-human-md";

/** Shared with oak-answer-agent-md.test.ts so both projections start from one shape. */
const BASE: OakAnswer = {
  status: "answered",
  answer_markdown: "Garchomp is a Dragon/Ground pseudo-legendary.",
  reasoning_markdown: "Looked up Garchomp base stats and typing.",
  citations: [
    {
      source: "pokemon/garchomp",
      detail: "base speed: 102",
      endpoint_url: "https://example.test/garchomp",
    },
  ],
  inferences: [
    {
      claim: "Outspeeds most Ground threats.",
      confidence: "high",
      note: "Base 102 Speed.",
    },
  ],
  generation_basis: {
    generation: "gen-9",
    fallback: false,
  },
  subjects: [
    {
      name: "Garchomp",
      dex_number: 445,
      sprite_url: "https://example.test/garchomp.png",
      types: ["dragon", "ground"],
      is_fallback: false,
    },
  ],
  uncertainty_flags: ["Competitive usage may shift monthly."],
};

const GARCHOMP_SET: TeamMember = {
  species: "garchomp",
  ability: "rough-skin",
  item: "life-orb",
  moves: ["earthquake", "dragon-claw", "stone-edge", "swords-dance"],
  nature: "jolly",
  evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  tera_type: "ground",
  level: 50,
};

const DRAGONITE_SET: TeamMember = {
  species: "dragonite",
  ability: "multiscale",
  item: null,
  moves: ["extreme-speed", "earthquake"],
  nature: "adamant",
  evs: { hp: 248, atk: 252, def: 0, spa: 0, spd: 8, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  tera_type: "normal",
  level: 50,
};

/** Full lockstep card: prose + candidate fact table + caveats + proposed team. */
const FULL: OakAnswer = {
  ...BASE,
  candidates: {
    total_count: 2,
    truncated: false,
    sort: "speed desc",
    shown: [
      {
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
      },
      {
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
      },
    ],
  },
  proposed_team: {
    name: "Rain Offense",
    format: "scarlet-violet",
    members: [GARCHOMP_SET, DRAGONITE_SET],
  },
};

describe("oakAnswerToHumanMarkdown", () => {
  it("includes the user-facing prose (COPY-AC-1.1)", () => {
    const md = oakAnswerToHumanMarkdown(BASE);
    expect(md).toContain("Garchomp is a Dragon/Ground pseudo-legendary.");
  });

  it("includes a readable fact table from candidates (COPY-AC-1.1)", () => {
    const md = oakAnswerToHumanMarkdown(FULL);
    expect(md).toContain("|");
    expect(md).toContain("Garchomp");
    expect(md).toContain("Dragonite");
    expect(md).toContain("108");
    expect(md).toContain("130");
    expect(md).toContain("102");
    expect(md).toContain("91");
    expect(md).toContain("134");
    expect(md).toContain("80");
  });

  it("renders key_stats when a candidate has no base_stats (COPY-AC-1.1)", () => {
    const md = oakAnswerToHumanMarkdown({
      ...BASE,
      candidates: {
        total_count: 1,
        truncated: false,
        sort: null,
        shown: [
          {
            name: "Garchomp",
            dex_number: 445,
            types: ["dragon", "ground"],
            key_stats: { speed: 102, attack: 130 },
          },
        ],
      },
    });
    expect(md).toContain("|");
    expect(md).toContain("Garchomp");
    expect(md).toContain("102");
    expect(md).toContain("130");
  });

  it("emits a Name+Types fact table when shown rows have no stats (COPY-AC-1.1)", () => {
    const md = oakAnswerToHumanMarkdown({
      ...BASE,
      candidates: {
        total_count: 2,
        truncated: false,
        sort: null,
        shown: [
          { name: "Garchomp", types: ["dragon", "ground"] },
          { name: "Dragonite", types: ["dragon", "flying"] },
        ],
      },
    });
    expect(md).toContain("|");
    expect(md).toContain("Garchomp");
    expect(md).toContain("Dragonite");
  });

  it("omits a fact table when there is no candidates.shown (COPY-AC-1.1)", () => {
    const md = oakAnswerToHumanMarkdown({
      ...BASE,
      answer_markdown: "Yes, Garchomp can learn Earthquake.",
    });
    expect(md).toContain("Yes, Garchomp can learn Earthquake.");
    expect(md).not.toMatch(/^\s*\|/m);
  });

  it("includes user-facing uncertainty caveats (COPY-AC-1.1)", () => {
    const md = oakAnswerToHumanMarkdown(FULL);
    expect(md).toContain("Competitive usage may shift monthly.");
  });

  it("maps internal uncertainty codes to user-facing labels (COPY-AC-1.1 / COPY-AC-1.2)", () => {
    const md = oakAnswerToHumanMarkdown({
      ...BASE,
      uncertainty_flags: ["max_iterations_reached"],
    });
    expect(md).toContain("Couldn't complete this answer");
    expect(md).not.toContain("max_iterations_reached");
  });

  it("includes the generation-fallback note when fallback is true (COPY-AC-1.1)", () => {
    const md = oakAnswerToHumanMarkdown({
      ...BASE,
      generation_basis: {
        generation: "gen-8",
        fallback: true,
        note: "Not in Scarlet/Violet roster.",
      },
    });
    expect(md).toContain("Not in Scarlet/Violet roster.");
    expect(md).not.toContain("generation_basis");
  });

  it("includes the default generation-fallback sentence when note is absent (COPY-AC-1.1)", () => {
    const md = oakAnswerToHumanMarkdown({
      ...BASE,
      generation_basis: {
        generation: "gen-8",
        fallback: true,
      },
    });
    expect(md).toContain(
      "Based on gen-8 data — this Pokémon is not in Gen 9.",
    );
    expect(md).not.toContain("generation_basis");
  });

  it("includes a Showdown paste when proposed_team is present (COPY-AC-1.1)", () => {
    const md = oakAnswerToHumanMarkdown(FULL);
    expect(md).toMatch(/garchomp/i);
    expect(md).toMatch(/life-orb|Life Orb/i);
    expect(md).toMatch(/rough-skin|Rough Skin/i);
    expect(md).toMatch(/earthquake/i);
    expect(md).toMatch(/dragon-claw|Dragon Claw/i);
    expect(md).toMatch(/stone-edge|Stone Edge/i);
    expect(md).toMatch(/swords-dance|Swords Dance/i);
    expect(md).toMatch(/jolly/i);
    expect(md).toMatch(/Level:\s*50/);
    expect(md).toContain("252");
    expect(md).toMatch(/dragonite/i);
    expect(md).toMatch(/multiscale|Multiscale/i);
    expect(md).toMatch(/extreme-speed|Extreme Speed/i);
    expect(md).toContain("Rain Offense");
  });

  it("omits a Showdown paste when there is no proposed_team (COPY-AC-1.1)", () => {
    const md = oakAnswerToHumanMarkdown(BASE);
    expect(md).not.toMatch(/Ability:/);
    expect(md).not.toMatch(/Level:\s*\d+/);
    expect(md).not.toMatch(/@\s*life-orb/i);
  });

  it("does not dump citation schema, endpoints, or agent headings (COPY-AC-1.2)", () => {
    const md = oakAnswerToHumanMarkdown(FULL);
    expect(md).not.toContain("# Oak answer");
    expect(md).not.toContain("## Citations");
    expect(md).not.toContain("## Reasoning");
    expect(md).not.toContain("## Subjects");
    expect(md).not.toContain("## Inferences");
    expect(md).not.toContain("## Uncertainty flags");
    expect(md).not.toContain("**Status:**");
    expect(md).not.toContain("`pokemon/garchomp`");
    expect(md).not.toContain("pokemon/garchomp");
    expect(md).not.toContain("https://example.test/garchomp");
    expect(md).not.toContain("endpoint_url");
    expect(md).not.toContain("reasoning_markdown");
    expect(md).not.toContain("generation_basis");
    expect(md).not.toContain("tool_activity");
    expect(md).not.toContain("tool-activity");
  });

  it("does not include the internal reasoning dump (COPY-AC-1.2)", () => {
    const md = oakAnswerToHumanMarkdown(FULL);
    expect(md).not.toContain("Looked up Garchomp base stats and typing.");
  });

  it("stays distinct from Copy-for-agents (COPY-AC-1.3 / COPY-BR-2)", () => {
    const human = oakAnswerToHumanMarkdown(FULL);
    const agent = oakAnswerToAgentMarkdown(FULL);
    expect(human).not.toEqual(agent);
    expect(agent).toContain("# Oak answer");
    expect(agent).toContain("## Citations");
    expect(agent).toContain("`pokemon/garchomp`");
    expect(agent).toContain("## Reasoning");
    expect(human).not.toContain("# Oak answer");
    expect(human).not.toContain("## Citations");
  });

  it("is a pure projection of the given answer (COPY-BR-1)", () => {
    const snapshot = structuredClone(FULL);
    const md = oakAnswerToHumanMarkdown(FULL);
    expect(FULL).toEqual(snapshot);
    expect(typeof md).toBe("string");
    expect(md.length).toBeGreaterThan(0);
  });
});
