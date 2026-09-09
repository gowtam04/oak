/**
 * Portable `placeSpeciesOnTeam` — add-to-team slot write (ADR-5).
 *
 * Production module is not required to exist yet — a failed resolve is the
 * intended red (P5 TDD).
 *
 *   placeSpeciesOnTeam(members, incoming, target):
 *     | { ok: true; members: TeamMember[]; slotIndex: number }
 *     | { ok: false; error: "full" }
 *
 *   target = { type: "first_empty" } | { type: "replace"; index: 0..5 }
 *
 * First empty = lowest index 0–5 whose species is null/empty (ADD-BR-1).
 * Full → `{ error: "full" }` — no auto-replace (ADD-BR-6).
 * Incoming is species + named set fields; unnamed stay `blankMember()`
 * (ADD-BR-2 / ADD-AC-1.3 / ADD-AC-1.4). Editor defaults: EVs 0, IVs 31,
 * level 50, empty moves, null ability/item/nature/tera/nickname.
 *
 * Requirement refs: ADD-BR-1, ADD-BR-2, ADD-BR-6, ADD-AC-1.3, ADD-AC-1.4,
 * ADD-AC-3.1, ADD-AC-3.2. ADR-5.
 */

import { describe, expect, it } from "vitest";

import type { TeamMember } from "./team-schema";

import { blankMember, placeSpeciesOnTeam } from "./place-on-team";

const ZERO_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const MAX_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

function filled(species: string, over: Partial<TeamMember> = {}): TeamMember {
  return {
    ...blankMember(),
    species,
    ...over,
  };
}

function speciesOnly(species: string): TeamMember {
  return { ...blankMember(), species };
}

describe("blankMember — editor defaults (ADD-BR-2)", () => {
  it("is an empty slot with editor new-pick defaults", () => {
    expect(blankMember()).toEqual({
      species: null,
      ability: null,
      item: null,
      moves: [],
      nature: null,
      evs: ZERO_EVS,
      ivs: MAX_IVS,
      tera_type: null,
      level: 50,
      nickname: null,
    });
  });
});

describe("placeSpeciesOnTeam — first_empty (ADD-BR-1)", () => {
  it("writes slot 0 on an empty roster", () => {
    const incoming = speciesOnly("garchomp");
    const result = placeSpeciesOnTeam([], incoming, { type: "first_empty" });
    expect(result).toEqual({
      ok: true,
      slotIndex: 0,
      members: [incoming],
    });
  });

  it("appends after trailing filled slots (lowest unused index)", () => {
    const members = [filled("garchomp"), filled("dragonite")];
    const incoming = speciesOnly("gholdengo");
    const result = placeSpeciesOnTeam(members, incoming, { type: "first_empty" });
    expect(result).toEqual({
      ok: true,
      slotIndex: 2,
      members: [members[0], members[1], incoming],
    });
  });

  it("fills the lowest hole when an earlier species is null", () => {
    const members = [
      blankMember(),
      filled("dragonite"),
      filled("gholdengo"),
    ];
    const incoming = speciesOnly("garchomp");
    const result = placeSpeciesOnTeam(members, incoming, { type: "first_empty" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotIndex).toBe(0);
    expect(result.members[0]).toEqual(incoming);
    expect(result.members[1]?.species).toBe("dragonite");
    expect(result.members[2]?.species).toBe("gholdengo");
  });

  it("treats an empty-string species as an empty slot (ADD-BR-1)", () => {
    const hole = { ...blankMember(), species: "" };
    const members = [filled("garchomp"), hole, filled("dragonite")];
    const incoming = speciesOnly("gholdengo");
    const result = placeSpeciesOnTeam(members, incoming, { type: "first_empty" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotIndex).toBe(1);
    expect(result.members[1]).toEqual(incoming);
  });

  it("fills a hole in a six-slot roster instead of appending", () => {
    const members = [
      filled("a"),
      filled("b"),
      blankMember(),
      filled("d"),
      filled("e"),
      filled("f"),
    ];
    const incoming = speciesOnly("garchomp");
    const result = placeSpeciesOnTeam(members, incoming, { type: "first_empty" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotIndex).toBe(2);
    expect(result.members).toHaveLength(6);
    expect(result.members[2]).toEqual(incoming);
  });
});

describe("placeSpeciesOnTeam — full (ADD-BR-1, ADD-BR-6)", () => {
  it("returns { ok: false, error: 'full' } and does not auto-replace", () => {
    const members = [
      filled("one"),
      filled("two"),
      filled("three"),
      filled("four"),
      filled("five"),
      filled("six"),
    ];
    const snapshot = structuredClone(members);
    const incoming = speciesOnly("garchomp");
    const result = placeSpeciesOnTeam(members, incoming, { type: "first_empty" });
    expect(result).toEqual({ ok: false, error: "full" });
    expect(members).toEqual(snapshot);
  });
});

describe("placeSpeciesOnTeam — replace (ADD-AC-3.2, ADD-BR-6)", () => {
  it("overwrites the named index and leaves other slots alone", () => {
    const members = [
      filled("one"),
      filled("two"),
      filled("three"),
      filled("four"),
      filled("five"),
      filled("six"),
    ];
    const incoming = speciesOnly("garchomp");
    const result = placeSpeciesOnTeam(members, incoming, {
      type: "replace",
      index: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotIndex).toBe(2);
    expect(result.members[2]).toEqual(incoming);
    expect(result.members[0]?.species).toBe("one");
    expect(result.members[1]?.species).toBe("two");
    expect(result.members[3]?.species).toBe("four");
    expect(result.members[5]?.species).toBe("six");
    expect(result.members).toHaveLength(6);
  });

  it("replace is allowed on a full team (the explicit overwrite path)", () => {
    const members = [0, 1, 2, 3, 4, 5].map((i) => filled(`slot-${i}`));
    const incoming = speciesOnly("miraidon");
    const result = placeSpeciesOnTeam(members, incoming, {
      type: "replace",
      index: 0,
    });
    expect(result).toEqual({
      ok: true,
      slotIndex: 0,
      members: [incoming, ...members.slice(1)],
    });
  });
});

describe("placeSpeciesOnTeam — copy named fields only (ADD-BR-2)", () => {
  it("copies species + named set fields; rest stay blankMember defaults (ADD-AC-1.3)", () => {
    const incoming: TeamMember = {
      ...blankMember(),
      species: "garchomp",
      ability: "rough-skin",
      item: "life-orb",
      moves: ["earthquake", "dragon-claw"],
      nature: "jolly",
      evs: { ...ZERO_EVS, atk: 252, spe: 252, hp: 4 },
      tera_type: "ground",
      level: 50,
    };
    const result = placeSpeciesOnTeam([], incoming, { type: "first_empty" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.members[0]).toEqual(incoming);
    expect(result.members[0]?.ivs).toEqual(MAX_IVS);
    expect(result.members[0]?.nickname).toBeNull();
  });

  it("species-only incoming does not invent a set (ADD-AC-1.4, ADD-BR-2)", () => {
    const incoming = speciesOnly("garchomp");
    const result = placeSpeciesOnTeam([], incoming, { type: "first_empty" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.members[0];
    expect(placed).toEqual({
      ...blankMember(),
      species: "garchomp",
    });
    expect(placed?.ability).toBeNull();
    expect(placed?.item).toBeNull();
    expect(placed?.moves).toEqual([]);
    expect(placed?.nature).toBeNull();
    expect(placed?.evs).toEqual(ZERO_EVS);
    expect(placed?.ivs).toEqual(MAX_IVS);
    expect(placed?.tera_type).toBeNull();
    expect(placed?.level).toBe(50);
  });

  it("does not mutate the input members array", () => {
    const members = [filled("garchomp")];
    const snapshot = structuredClone(members);
    placeSpeciesOnTeam(members, speciesOnly("dragonite"), {
      type: "first_empty",
    });
    expect(members).toEqual(snapshot);
  });
});
