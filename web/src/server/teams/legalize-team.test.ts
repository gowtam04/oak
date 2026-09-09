/**
 * Unit tests for legalize-team — deterministic repair of hard illegalities.
 * Uses the tools fixture Postgres schema (real index rows).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { OakDb } from "@/data/db";
import {
  HARD_VIOLATION_CODES,
  isHardViolation as isHardViolationCode,
  warningCodeSchema,
  type StatSpread,
  type TeamMember,
  type WarningCode,
} from "@/data/teams/team-schema";
import { createPgSchema, type PgFixture } from "../../../test/support/pg";
import {
  legalizeTeam,
  formatRepairsNote,
  LEARNSET_UNAVAILABLE_MESSAGE,
} from "./legalize-team";
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

  it("forces a Mega to hold its mega stone (not a competitive staple)", async () => {
    const { members, repairs, remainingHard } = await legalizeTeam(
      [
        member({
          species: "swampert-mega",
          ability: "swift-swim",
          item: "life-orb",
          moves: ["earthquake", "waterfall", "ice-punch", "superpower"],
        }),
      ],
      SV,
      db,
    );
    expect(members[0]!.item).toBe("swampertite");
    expect(repairs.some((r) => r.to === "swampertite")).toBe(true);
    expect(remainingHard.filter(isHardViolation)).toHaveLength(0);
  });
});

describe("legalizeTeam keepSpecies (BOX-BR-9, BOX-AC-1.2, BOX-AC-1.3)", () => {
  it("keeps a named species that would otherwise be repaired by swapping", async () => {
    const { members, remainingHard } = await legalizeTeam(
      [
        legalGarchomp({
          moves: ["earthquake", "dragon-claw", "psychic", "earthquake"],
        }),
      ],
      SV,
      db,
      { keepSpecies: ["garchomp"] },
    );
    expect(members).toHaveLength(1);
    expect(members[0]!.species).toBe("garchomp");
    expect(members[0]!.species).not.toBe("ninetales");
    expect(members[0]!.species).not.toBe("swampert-mega");
    // keepSpecies repairs by clearing the illegal move, not by swapping the mon.
    expect(members[0]!.moves).not.toContain("psychic");
    expect(members[0]!.moves).toHaveLength(3);
    expect(remainingHard.some((w) => w.slot === 0 && w.code === "species_illegal")).toBe(
      false,
    );
    expect(remainingHard.some((w) => w.code === "learnset_unavailable")).toBe(
      false,
    );
  });

  it("clears illegal moves on a keepSpecies slot rather than dropping or replacing the member", async () => {
    const { members } = await legalizeTeam(
      [
        legalGarchomp({
          moves: ["earthquake", "dragon-claw", "psychic", "earthquake"],
        }),
      ],
      SV,
      db,
      { keepSpecies: ["garchomp"] },
    );
    expect(members).toHaveLength(1);
    expect(members[0]!.species).toBe("garchomp");
    expect(members[0]!.moves).not.toContain("psychic");
    expect(members[0]!.moves).toEqual(
      expect.arrayContaining(["earthquake", "dragon-claw"]),
    );
    // Emptied the illegal slot — not swapped in a different legal filler.
    expect(members[0]!.moves).toHaveLength(3);
  });

  it("keeps a species not in the roster when it is in keepSpecies (BOX-AC-1.3)", async () => {
    const { members, remainingHard } = await legalizeTeam(
      [
        member({
          species: "kangaskhan-mega",
          ability: "parental-bond",
          item: "kangaskhanite",
          moves: ["fake-out", "power-up-punch", "sucker-punch", "return"],
        }),
      ],
      SV,
      db,
      { keepSpecies: ["kangaskhan-mega"] },
    );
    expect(members).toHaveLength(1);
    expect(members[0]!.species).toBe("kangaskhan-mega");
    expect(members[0]!.item).toBe("kangaskhanite");
    expect(remainingHard.some((w) => w.code === "species_illegal")).toBe(true);
    expect(remainingHard.some((w) => w.code === "learnset_unavailable")).toBe(
      true,
    );
    expect(
      remainingHard.find((w) => w.code === "learnset_unavailable")?.message,
    ).toBe(LEARNSET_UNAVAILABLE_MESSAGE);
  });
});

describe("learnset_unavailable warning code (BOX-AC-1.2, BOX-BR-9)", () => {
  it("is a valid soft warning code and is not a hard violation", () => {
    expect(warningCodeSchema.safeParse("learnset_unavailable").success).toBe(
      true,
    );
    expect(
      HARD_VIOLATION_CODES.has("learnset_unavailable" as WarningCode),
    ).toBe(false);
    expect(
      isHardViolationCode({
        code: "learnset_unavailable" as WarningCode,
        message:
          "Learnset unavailable for this form in this scope; species kept because you named it.",
      }),
    ).toBe(false);
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
