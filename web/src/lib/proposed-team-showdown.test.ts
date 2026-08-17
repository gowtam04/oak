/**
 * One-tap Showdown paste for a proposed team (ADR-10, PASTE-BR-2).
 *
 * Production module is not required to exist yet — a failed resolve is the
 * intended red (P5 TDD). Thin wrapper over the existing `serializeShowdown`
 * dialect used by human copy (`oak-answer-human-md.ts`) and the team editor.
 *
 *   proposedTeamToShowdownPaste(team: ProposedTeam): string
 *
 * Copies **only** the paste — not the full human markdown (PASTE-AC-1.1).
 * Guests can copy; this is not a save (PASTE-BR-1 / PASTE-BR-3).
 *
 * Requirement refs: PASTE-US-1, PASTE-AC-1.1, PASTE-BR-1, PASTE-BR-2,
 * PASTE-BR-3. ADR-10.
 */

import { describe, expect, it } from "vitest";

import type { OakAnswer, ProposedTeam } from "@/agent/schemas";
import type { TeamMember } from "@/data/teams/team-schema";
import {
  serializeShowdown,
  type ShowdownSet,
} from "@/data/pkmn/team-paste";

import { oakAnswerToHumanMarkdown } from "./oak-answer-human-md";
import { proposedTeamToShowdownPaste } from "./proposed-team-showdown";

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

const TEAM: ProposedTeam = {
  name: "Rain Offense",
  format: "scarlet-violet",
  members: [GARCHOMP_SET, DRAGONITE_SET],
};

const BASE_ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "Here is a rain core.",
  reasoning_markdown: "internal",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Same mapping `oak-answer-human-md.ts` uses for the Showdown section. */
function memberToSet(member: TeamMember): ShowdownSet | null {
  if (!member.species) return null;
  const set: ShowdownSet = {
    name: member.nickname ?? "",
    species: humanize(member.species),
    item: member.item ? humanize(member.item) : "",
    ability: member.ability ? humanize(member.ability) : "",
    moves: member.moves.map(humanize),
    nature: member.nature ? humanize(member.nature) : "",
    gender: member.gender ?? "",
    evs: { ...member.evs },
    ivs: { ...member.ivs },
    level: member.level,
  };
  if (member.tera_type) set.teraType = humanize(member.tera_type);
  if (member.shiny) set.shiny = true;
  return set;
}

function expectedPaste(team: ProposedTeam): string {
  const sets: ShowdownSet[] = [];
  for (const member of team.members) {
    const set = memberToSet(member);
    if (set) sets.push(set);
  }
  return serializeShowdown(sets);
}

describe("proposedTeamToShowdownPaste (PASTE-BR-2, ADR-10)", () => {
  it("emits the same Showdown string as serializeShowdown / human-md's paste section", () => {
    const paste = proposedTeamToShowdownPaste(TEAM);
    const expected = expectedPaste(TEAM);
    expect(paste).toBe(expected);
    expect(paste.length).toBeGreaterThan(0);

    const human = oakAnswerToHumanMarkdown({
      ...BASE_ANSWER,
      proposed_team: TEAM,
    });
    expect(human).toContain(paste);
    expect(paste).not.toContain("Here is a rain core.");
    expect(paste).not.toContain("internal");
  });

  it("includes the same species, item, ability, moves, nature, and level as the editor dialect", () => {
    const paste = proposedTeamToShowdownPaste(TEAM);
    expect(paste).toMatch(/garchomp/i);
    expect(paste).toMatch(/Life Orb/i);
    expect(paste).toMatch(/Rough Skin/i);
    expect(paste).toMatch(/Earthquake/);
    expect(paste).toMatch(/Dragon Claw/);
    expect(paste).toMatch(/Stone Edge/);
    expect(paste).toMatch(/Swords Dance/);
    expect(paste).toMatch(/Jolly/i);
    expect(paste).toMatch(/Level:\s*50/);
    expect(paste).toMatch(/dragonite/i);
    expect(paste).toMatch(/Multiscale/i);
    expect(paste).toMatch(/Extreme Speed/);
  });

  it("skips members with no species, matching human-md", () => {
    const team: ProposedTeam = {
      name: "Partial",
      format: "scarlet-violet",
      members: [
        { ...GARCHOMP_SET, species: null },
        DRAGONITE_SET,
      ],
    };
    expect(proposedTeamToShowdownPaste(team)).toBe(expectedPaste(team));
    expect(proposedTeamToShowdownPaste(team)).toMatch(/dragonite/i);
    expect(proposedTeamToShowdownPaste(team)).not.toMatch(/garchomp/i);
  });

  it("returns an empty string for an empty roster", () => {
    const team: ProposedTeam = {
      name: "Empty",
      format: "scarlet-violet",
      members: [],
    };
    expect(proposedTeamToShowdownPaste(team)).toBe("");
  });

  it("is not a save — the proposed team object is not mutated (PASTE-BR-1)", () => {
    const snapshot = structuredClone(TEAM);
    const paste = proposedTeamToShowdownPaste(TEAM);
    expect(TEAM).toEqual(snapshot);
    expect(typeof paste).toBe("string");
  });
});
