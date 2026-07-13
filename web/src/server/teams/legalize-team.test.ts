/**
 * Unit tests for legalize-team — deterministic repair of hard illegalities.
 * Uses the tools fixture Postgres schema (real index rows).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { OakDb } from "@/data/db";
import type { StatSpread, TeamMember } from "@/data/teams/team-schema";
import { createPgSchema, type PgFixture } from "../../../test/support/pg";
import { legalizeTeam, formatRepairsNote } from "./legalize-team";
import { isHardViolation, validateTeam } from "./validate-team";

const SV = "scarlet-violet" as const;

const ZERO: StatSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const PERFECT: StatSpread = {
  hp: 31,
  atk: 31,
  def: 31,
  spa: 31,
  spd: 31,
  spe: 31,
};

function member(over: Partial<TeamMember> = {}): TeamMember {
  return {
    species: null,
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: { ...ZERO },
    ivs: { ...PERFECT },
    tera_type: null,
    level: 50,
    ...over,
  };
}

function legalGarchomp(over: Partial<TeamMember> = {}): TeamMember {
  return member({
    species: "garchomp",
    ability: "sand-veil",
    item: "leftovers",
    moves: ["earthquake", "dragon-claw", "fire-fang", "earthquake"],
    ...over,
  });
}

function legalNinetales(over: Partial<TeamMember> = {}): TeamMember {
  return member({
    species: "ninetales",
    ability: "flash-fire",
    item: "life-orb",
    moves: ["flamethrower", "will-o-wisp", "trick-room", "flamethrower"],
    ...over,
  });
}

let fix: PgFixture;
let db: OakDb;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  db = fix.db as unknown as OakDb;
});

afterAll(async () => {
  await fix?.cleanup();
});

describe("legalizeTeam", () => {
  it("replaces an illegal held item with a legal staple", async () => {
    const { members, repairs, remainingHard } = await legalizeTeam(
      [legalGarchomp({ item: "choice-band" })],
      SV,
      db,
    );
    expect(remainingHard.filter(isHardViolation)).toHaveLength(0);
    expect(members[0]!.item).not.toBe("choice-band");
    expect(members[0]!.item).toBeTruthy();
    expect(repairs.some((r) => r.field === "item")).toBe(true);
    const warnings = await validateTeam(members, SV, db);
    expect(warnings.some((w) => w.code === "item_illegal")).toBe(false);
  });

  it("fills a missing held item on a battle-ready member", async () => {
    const { members, remainingHard } = await legalizeTeam(
      [legalGarchomp({ item: null })],
      SV,
      db,
    );
    expect(remainingHard.some((w) => w.code === "item_missing")).toBe(false);
    expect(members[0]!.item).toBeTruthy();
  });

  it("resolves the item clause by reassigning the later slot", async () => {
    const { members, remainingHard } = await legalizeTeam(
      [
        legalGarchomp({ item: "leftovers" }),
        legalNinetales({ item: "leftovers" }),
      ],
      SV,
      db,
    );
    expect(remainingHard.some((w) => w.code === "duplicate_item")).toBe(false);
    expect(members[0]!.item).not.toBe(members[1]!.item);
  });

  it("swaps an illegal move for a learnset move", async () => {
    const { members, repairs, remainingHard } = await legalizeTeam(
      [
        legalGarchomp({
          moves: ["earthquake", "dragon-claw", "psychic", "earthquake"],
        }),
      ],
      SV,
      db,
    );
    expect(remainingHard.some((w) => w.code === "move_not_in_learnset")).toBe(
      false,
    );
    expect(members[0]!.moves).not.toContain("psychic");
    expect(repairs.some((r) => r.field.startsWith("moves"))).toBe(true);
  });

  it("leaves species_illegal as remaining hard (does not invent a mon)", async () => {
    const { remainingHard } = await legalizeTeam(
      [legalGarchomp({ species: "heatran", ability: "flash-fire" })],
      SV,
      db,
    );
    expect(remainingHard.some((w) => w.code === "species_illegal")).toBe(true);
  });
});

describe("formatRepairsNote", () => {
  it("returns empty string for no repairs", () => {
    expect(formatRepairsNote([])).toBe("");
  });

  it("lists each repair for UX honesty", () => {
    const note = formatRepairsNote([
      {
        slot: 0,
        field: "item",
        from: "choice-band",
        to: "sitrus-berry",
        reason: "item not legal in this format",
      },
    ]);
    expect(note).toContain("choice-band");
    expect(note).toContain("sitrus-berry");
    expect(note).toMatch(/legal/i);
  });
});
