/**
 * Phase 7 lockstep oracle — follow-up chips derived from OakAnswer + turn context.
 *
 * iOS `FollowUpChipsTests` and Android `FollowUpChipsTest` must clone these
 * fixtures and the same kind/label/target/cap assertions.
 *
 * Requirement refs: CHIP-US-1, CHIP-AC-1.1..1.5, CHIP-BR-1, CHIP-BR-2,
 * CHIP-BR-3. ADR-9.
 *
 * Contract (web `follow-up-chips.ts` / iOS `FollowUpChips.swift` /
 * Android `FollowUpChips.kt`):
 *
 *   deriveFollowUpChips({
 *     answer: OakAnswer,
 *     impliedFormat?: Format,       // ignored — no game-switch chip
 *     mentionedTeam?: { id, name }, // signed-in bound / @mentioned team
 *   }): Array<{
 *     kind: "dex" | "team",
 *     label: string,
 *     target: string,               // subject name | team id
 *   }>
 *
 * Labels:
 *   dex   → `Open ${subject.name} in Dex`
 *   team  → `Open ${teamName}`
 *
 * Caps: ≤3 Dex, ≤1 team. No empty-row filler chips. No "Switch to {format}".
 * Never calc / compare / add-to-team / "Open this calc" / "tell me more".
 * No new OakAnswer field — chips are a client projection (CHIP-BR-3).
 */

import { describe, expect, it } from "vitest";

import type { OakAnswer, Subject, TypeName } from "@/agent/schemas";
import type { TeamMember } from "@/data/teams/team-schema";

import { deriveFollowUpChips } from "./follow-up-chips";

const MEMBER: TeamMember = {
  species: "garchomp",
  ability: "rough-skin",
  item: "life-orb",
  moves: ["earthquake"],
  nature: "jolly",
  evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  tera_type: "ground",
  level: 50,
};

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
  inferences: [],
  generation_basis: { generation: "champions", fallback: false },
  subjects: [
    {
      name: "Garchomp",
      dex_number: 445,
      sprite_url: "https://example.test/garchomp.png",
      types: ["dragon", "ground"],
      is_fallback: false,
    },
  ],
};

function subject(name: string, dex: number, types: TypeName[]): Subject {
  return {
    name,
    dex_number: dex,
    sprite_url: `https://example.test/${name.toLowerCase()}.png`,
    types,
    is_fallback: false,
  };
}

const FORBIDDEN_CHIP = /calc|compare|add .+ to a team|open this calc|tell me more/i;

describe("deriveFollowUpChips", () => {
  it("never emits a Switch-to-format chip, even when impliedFormat is passed (CF-UI-BR-2)", () => {
    const chips = deriveFollowUpChips({
      answer: BASE,
      impliedFormat: "scarlet-violet",
    });
    expect(chips.filter((c) => c.kind === "scope")).toHaveLength(0);
    expect(chips.map((c) => c.label).join("\n")).not.toMatch(/Switch to /i);
  });

  it("emits no scope chip when impliedFormat is omitted", () => {
    const chips = deriveFollowUpChips({ answer: BASE });
    expect(chips.filter((c) => c.kind === "scope")).toHaveLength(0);
  });

  it("emits Dex chips for primary subjects, capped at 3 (CHIP-AC-1.2 / CHIP-BR-2)", () => {
    const chips = deriveFollowUpChips({
      answer: {
        ...BASE,
        subjects: [
          subject("Garchomp", 445, ["dragon", "ground"]),
          subject("Dragonite", 149, ["dragon", "flying"]),
          subject("Salamence", 373, ["dragon", "flying"]),
          subject("Hydreigon", 635, ["dark", "dragon"]),
          subject("Goodra", 706, ["dragon"]),
        ],
      },
    });
    const dex = chips.filter((c) => c.kind === "dex");
    expect(dex).toHaveLength(3);
    expect(dex.map((c) => c.label)).toEqual([
      "Open Garchomp in Dex",
      "Open Dragonite in Dex",
      "Open Salamence in Dex",
    ]);
    expect(dex.map((c) => c.target)).toEqual([
      "Garchomp",
      "Dragonite",
      "Salamence",
    ]);
    expect(dex.some((c) => c.target === "Hydreigon")).toBe(false);
    expect(dex.some((c) => c.target === "Goodra")).toBe(false);
  });

  it("emits no Dex chips when there are no subjects (CHIP-AC-1.2)", () => {
    const chips = deriveFollowUpChips({
      answer: { ...BASE, subjects: undefined },
    });
    expect(chips.filter((c) => c.kind === "dex")).toHaveLength(0);
  });

  it("emits one team chip from mentionedTeam (CHIP-AC-1.3 / CHIP-BR-2)", () => {
    const chips = deriveFollowUpChips({
      answer: { ...BASE, subjects: undefined },
      mentionedTeam: { id: "team-rain-1", name: "Rain Offense" },
    });
    const team = chips.filter((c) => c.kind === "team");
    expect(team).toHaveLength(1);
    expect(team[0]).toEqual({
      kind: "team",
      label: "Open Rain Offense",
      target: "team-rain-1",
    });
  });

  it("emits one team chip from saved_team when no mention is bound (CHIP-AC-1.3)", () => {
    const chips = deriveFollowUpChips({
      answer: {
        ...BASE,
        subjects: undefined,
        saved_team: {
          id: "team-saved-9",
          name: "Balance Core",
          format: "scarlet-violet",
        },
      },
    });
    const team = chips.filter((c) => c.kind === "team");
    expect(team).toHaveLength(1);
    expect(team[0]).toEqual({
      kind: "team",
      label: "Open Balance Core",
      target: "team-saved-9",
    });
  });

  it("caps team chips at one and prefers mentionedTeam over saved_team (CHIP-BR-2)", () => {
    const chips = deriveFollowUpChips({
      answer: {
        ...BASE,
        subjects: undefined,
        saved_team: {
          id: "team-saved-9",
          name: "Balance Core",
          format: "scarlet-violet",
        },
      },
      mentionedTeam: { id: "team-rain-1", name: "Rain Offense" },
    });
    const team = chips.filter((c) => c.kind === "team");
    expect(team).toHaveLength(1);
    expect(team[0]?.target).toBe("team-rain-1");
    expect(team[0]?.label).toBe("Open Rain Offense");
  });

  it("does not turn proposed_team into an add-to-team chip (CHIP-AC-1.4 / CHIP-BR-1)", () => {
    const chips = deriveFollowUpChips({
      answer: {
        ...BASE,
        subjects: undefined,
        proposed_team: {
          name: "Rain Offense",
          format: "scarlet-violet",
          members: [MEMBER],
        },
      },
    });
    expect(chips.filter((c) => c.kind === "team")).toHaveLength(0);
    expect(chips.map((c) => c.label).join("\n")).not.toMatch(FORBIDDEN_CHIP);
  });

  it("never emits calc, compare, add-to-team, or tell-me-more chips (CHIP-AC-1.4 / CHIP-BR-1)", () => {
    const chips = deriveFollowUpChips({
      answer: {
        ...BASE,
        subjects: [
          subject("Garchomp", 445, ["dragon", "ground"]),
          subject("Dragonite", 149, ["dragon", "flying"]),
        ],
        candidates: {
          total_count: 2,
          truncated: false,
          sort: null,
          shown: [
            { name: "Garchomp", types: ["dragon", "ground"] },
            { name: "Dragonite", types: ["dragon", "flying"] },
          ],
        },
        damage_calc: {
          assumptions: { attacker: "Garchomp", move: "earthquake" },
          result: { min_damage: 142, max_damage: 168 },
          is_estimate: true,
          breakdown: "floor((2*50/5+2)*100*120/65)",
        },
        suggestions: ["Garchomp", "Garchomp (Mega)", "tell me more"],
        proposed_team: {
          name: "Rain Offense",
          format: "scarlet-violet",
          members: [MEMBER],
        },
      },
      impliedFormat: "scarlet-violet",
      mentionedTeam: { id: "team-rain-1", name: "Rain Offense" },
    });

    expect(chips.every((c) => ["dex", "team"].includes(c.kind))).toBe(true);
    for (const chip of chips) {
      expect(chip.label).not.toMatch(FORBIDDEN_CHIP);
      expect(chip.label.toLowerCase()).not.toContain("/calc");
      expect(chip.label.toLowerCase()).not.toContain("add garchomp to a team");
      expect(chip.label.toLowerCase()).not.toContain("open this calc");
      expect(chip.label).not.toMatch(/Switch to /i);
    }
    expect(chips.some((c) => c.kind === "scope")).toBe(false);
    expect(chips.filter((c) => c.kind === "dex").length).toBeLessThanOrEqual(3);
    expect(chips.filter((c) => c.kind === "team")).toHaveLength(1);
  });

  it("returns an empty list when there is nothing to hop to (CHIP-AC-1.5 / CHIP-BR-2)", () => {
    const chips = deriveFollowUpChips({
      answer: { ...BASE, subjects: undefined },
    });
    expect(chips).toEqual([]);
  });

  it("does not invent a suggestions field on OakAnswer (CHIP-BR-3)", () => {
    const answer: OakAnswer = { ...BASE };
    expect("follow_up_chips" in answer).toBe(false);
    const snapshot = structuredClone(answer);
    deriveFollowUpChips({
      answer,
      impliedFormat: "gen-1",
    });
    expect(answer).toEqual(snapshot);
    expect("follow_up_chips" in answer).toBe(false);
  });

  it("respects combined caps: 3 Dex + 1 team, no scope (CHIP-BR-2, CF-UI-BR-2)", () => {
    const chips = deriveFollowUpChips({
      answer: {
        ...BASE,
        subjects: [
          subject("Garchomp", 445, ["dragon", "ground"]),
          subject("Dragonite", 149, ["dragon", "flying"]),
          subject("Salamence", 373, ["dragon", "flying"]),
          subject("Hydreigon", 635, ["dark", "dragon"]),
        ],
        saved_team: {
          id: "team-saved-9",
          name: "Balance Core",
          format: "scarlet-violet",
        },
      },
      impliedFormat: "scarlet-violet",
      mentionedTeam: { id: "team-rain-1", name: "Rain Offense" },
    });
    expect(chips.filter((c) => c.kind === "scope")).toHaveLength(0);
    expect(chips.filter((c) => c.kind === "dex")).toHaveLength(3);
    expect(chips.filter((c) => c.kind === "team")).toHaveLength(1);
    expect(chips).toHaveLength(4);
  });
});
