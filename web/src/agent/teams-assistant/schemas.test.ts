/**
 * Pure unit tests for the team-builder assistant's output contract + patch
 * semantics (schemas.ts). No DB, no network — `applyTeamPatch` is the same
 * pure function the server (legality gate) and the `/teams` client (Apply)
 * both run, so its slot-resolution rules are pinned here in isolation.
 */

import { describe, expect, it } from "vitest";

import type { TeamMember } from "@/data/teams/team-schema";
import {
  applyTeamPatch,
  blankTeamMember,
  builderAnswerSchema,
  type TeamPatch,
} from "./schemas";

/** A blank member tagged with `species` so slot identity is easy to assert. */
function m(species: string): TeamMember {
  return { ...blankTeamMember(), species };
}

describe("blankTeamMember", () => {
  it("is a fresh, empty member with IVs 31, level 50, and zero EVs", () => {
    expect(blankTeamMember()).toEqual({
      species: null,
      ability: null,
      item: null,
      moves: [],
      nature: null,
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      tera_type: null,
      level: 50,
      nickname: null,
    });
  });
});

describe("applyTeamPatch", () => {
  it("replaces one slot with a full replacement (not a partial merge)", () => {
    const members = [m("a"), m("b")];
    const patch: TeamPatch = { slots: [{ slot: 1, member: m("b2") }] };

    const result = applyTeamPatch(members, patch);

    expect(result.map((x) => x.species)).toEqual(["a", "b2"]);
  });

  it("removes a slot via member:null, compacting and preserving order", () => {
    const members = [m("a"), m("b"), m("c")];
    const patch: TeamPatch = { slots: [{ slot: 1, member: null }] };

    const result = applyTeamPatch(members, patch);

    expect(result.map((x) => x.species)).toEqual(["a", "c"]);
  });

  it("pads gaps with blankTeamMember when a patch targets a slot past the draft's length", () => {
    const members = [m("a")];
    const patch: TeamPatch = { slots: [{ slot: 2, member: m("c") }] };

    const result = applyTeamPatch(members, patch);

    expect(result).toHaveLength(3);
    expect(result[0]?.species).toBe("a");
    expect(result[1]).toEqual(blankTeamMember());
    expect(result[2]?.species).toBe("c");
  });

  it("resolves every slot index against the PRE-patch draft, not intermediate state", () => {
    // slot 1 replace + slot 0 remove in the SAME patch: both indices refer to
    // the original [a, b, c] — the removal must not shift the replace's target.
    const members = [m("a"), m("b"), m("c")];
    const patch: TeamPatch = {
      slots: [
        { slot: 1, member: m("b2") },
        { slot: 0, member: null },
      ],
    };

    const result = applyTeamPatch(members, patch);

    expect(result.map((x) => x.species)).toEqual(["b2", "c"]);
  });

  it("caps the result at 6 members even bypassing the schema's slot<=5 cap", () => {
    // teamPatchSlotSchema restricts `slot` to 0..5 at the Zod layer, but
    // applyTeamPatch is a plain function over TeamPatch — exercise its own
    // defensive `.slice(0, 6)` directly by constructing a patch the schema
    // itself would reject.
    const members = [m("a"), m("b"), m("c"), m("d"), m("e"), m("f")];
    const patch = { slots: [{ slot: 6, member: m("g") }] } as unknown as TeamPatch;

    const result = applyTeamPatch(members, patch);

    expect(result).toHaveLength(6);
    expect(result.map((x) => x.species)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("returns the original members unchanged when the patch has no slots", () => {
    const members = [m("a"), m("b")];
    const result = applyTeamPatch(members, { slots: [] });
    expect(result.map((x) => x.species)).toEqual(["a", "b"]);
    expect(result).not.toBe(members); // pure — never returns the input array
  });
});

describe("builderAnswerSchema", () => {
  it("accepts an advice-only payload (no team_patch)", () => {
    const parsed = builderAnswerSchema.safeParse({
      answer_markdown: "Here's some advice.",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a payload carrying a team_patch", () => {
    const parsed = builderAnswerSchema.safeParse({
      answer_markdown: "Try this.",
      team_patch: { slots: [{ slot: 0, member: null }] },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown top-level keys (.strict())", () => {
    const parsed = builderAnswerSchema.safeParse({
      answer_markdown: "hi",
      extra_field: "nope",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing answer_markdown", () => {
    expect(builderAnswerSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty answer_markdown", () => {
    expect(
      builderAnswerSchema.safeParse({ answer_markdown: "" }).success,
    ).toBe(false);
  });
});
