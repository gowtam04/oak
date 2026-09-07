/**
 * Integration tests for the Showdown import/export service (import-export.ts).
 *
 * Champions-first P4 (CF-TEAM-US-3, ADR-7): import always resolves against the
 * Champions index; Tera is dropped; EV numbers are stored as Stat Points; names
 * not on the roster stay on the slot as stored text (warn-but-allow, not
 * rejected). Export of a living team omits Tera, writes Level 50, and rides
 * Stat Points in the EV fields (CF-TEAM-AC-3.1–3.4).
 *
 * Run against a REAL throwaway Postgres schema seeded with the `tools` fixture
 * (Testcontainers), so name↔slug resolution exercises the actual
 * `searchable_names` index.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { OakDb } from "@/data/db";
import type { TeamMember } from "@/data/teams/team-schema";

import { exportPaste, importPaste } from "./import-export";
import { createPgSchema, type PgFixture } from "../../../test/support/pg";

const CH = "champions" as const;
const SV = "scarlet-violet" as const;

let fixture: PgFixture;
let db: OakDb;

beforeAll(async () => {
  fixture = await createPgSchema({ seed: "tools" });
  db = fixture.db as unknown as OakDb;
});

afterAll(async () => {
  await fixture?.cleanup();
});

const evs0 = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const ivs31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

function storedText(value: string | null | undefined, raw: string): void {
  expect(value, `expected stored text for "${raw}"`).toBeTruthy();
  const got = (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const want = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  expect(got).toContain(want);
}

describe("importPaste", () => {
  it("resolves every display name to a slug and fills Champions defaults (ADR-7)", async () => {
    const paste = `Chompy (Garchomp) (M) @ Leftovers
Ability: Rough Skin
Shiny: Yes
Level: 50
Tera Type: Dragon
EVs: 32 Atk / 2 Def / 32 Spe
Jolly Nature
IVs: 0 Spe
- Earthquake
- Fake Out`;

    const { members } = await importPaste(paste, CH, db);

    expect(members).toHaveLength(1);
    const m = members[0];
    expect(m.species).toBe("garchomp");
    expect(m.ability).toBe("rough-skin");
    expect(m.item).toBe("leftovers");
    expect(m.nature).toBe("jolly");
    expect(m.tera_type).toBeNull();
    expect(m.moves).toEqual(["earthquake", "fake-out"]);
    expect(m.level).toBe(50);
    expect(m.evs).toEqual({ hp: 0, atk: 32, def: 2, spa: 0, spd: 0, spe: 32 });
    expect(m.ivs).toEqual({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 0 });
    expect(m.nickname).toBe("Chompy");
    expect(m.gender).toBe("M");
    expect(m.shiny).toBe(true);
  });

  it("drops Tera even when the paste has a Tera Type line (CF-TEAM-AC-3.1)", async () => {
    const { members } = await importPaste(
      `Garchomp\nTera Type: Fire\nAbility: Rough Skin\n- Earthquake`,
      CH,
      db,
    );
    expect(members[0].tera_type).toBeNull();
  });

  it("ignores a requested other-game format and still resolves against Champions", async () => {
    const { members } = await importPaste(
      `Garchomp\nAbility: Rough Skin\nTera Type: Dragon\n- Earthquake`,
      SV,
      db,
    );
    expect(members[0].species).toBe("garchomp");
    expect(members[0].tera_type).toBeNull();
    expect(members[0].level).toBe(50);
  });

  it("defaults level 50 / zero Stat Points / 31 IVs when omitted (ADR-7)", async () => {
    const { members } = await importPaste(
      `Garchomp\nAbility: Rough Skin\n- Earthquake`,
      CH,
      db,
    );
    const m = members[0];
    expect(m.level).toBe(50);
    expect(m.evs).toEqual(evs0);
    expect(m.ivs).toEqual(ivs31);
    expect(m.nature).toBeNull();
    expect(m.item).toBeNull();
    expect(m.tera_type).toBeNull();
  });

  it("keeps an off-roster species as stored text with a note (CF-TEAM-AC-3.3)", async () => {
    const paste = `Notamon @ Leftovers
Ability: Rough Skin
- Earthquake`;
    const { members, notes } = await importPaste(paste, CH, db);

    expect(members).toHaveLength(1);
    storedText(members[0].species, "Notamon");
    expect(members[0].item).toBe("leftovers");
    expect(members[0].ability).toBe("rough-skin");
    expect(members[0].moves).toEqual(["earthquake"]);

    const note = notes.find((n) => n.kind === "pokemon" && n.raw === "Notamon");
    expect(note).toBeDefined();
    expect(note?.message).toMatch(/not in the Champions roster/);
  });

  it("keeps an off-roster move as stored text with a note (CF-TEAM-AC-3.3)", async () => {
    const paste = `Garchomp
Ability: Rough Skin
- Earthquake
- Hyper Nonsense
- Fake Out`;
    const { members, notes } = await importPaste(paste, CH, db);
    expect(members[0].moves).toContain("earthquake");
    expect(members[0].moves).toContain("fake-out");
    storedText(
      members[0].moves.find((m) => /hyper/i.test(m)) ?? null,
      "Hyper Nonsense",
    );
    const moveNotes = notes.filter((n) => n.kind === "move");
    expect(moveNotes.some((n) => n.raw === "Hyper Nonsense")).toBe(true);
  });

  it("notes an unknown nature and leaves it empty", async () => {
    const { members, notes } = await importPaste(
      `Garchomp\nAbility: Rough Skin\nBogus Nature\n- Earthquake`,
      CH,
      db,
    );
    expect(members[0].nature).toBeNull();
    expect(notes.some((n) => n.kind === "nature" && n.raw === "Bogus")).toBe(true);
  });

  it("preserves over-cap Stat Points verbatim (warn-but-allow, no clamp) (CF-TEAM-AC-3.2)", async () => {
    const { members, notes } = await importPaste(
      `Garchomp\nAbility: Rough Skin\nEVs: 252 Atk\n- Earthquake`,
      CH,
      db,
    );
    expect(members[0].evs.atk).toBe(252);
    expect(notes.filter((n) => n.kind !== "tera")).toEqual([]);
  });

  it("notes an out-of-range level but still imports the member; living level is 50 (U1, ADR-7)", async () => {
    const { members, notes } = await importPaste(
      `Garchomp\nLevel: 150\nAbility: Rough Skin\n- Earthquake`,
      CH,
      db,
    );
    expect(members).toHaveLength(1);
    expect(members[0].species).toBe("garchomp");
    expect(members[0].moves).toEqual(["earthquake"]);
    expect(members[0].level).toBe(50);
    const levelNotes = notes.filter((n) => n.kind === "level");
    expect(levelNotes).toHaveLength(1);
    expect(levelNotes[0]).toMatchObject({ slot: 0, raw: "150" });
  });

  it("imports multiple members and indexes notes by slot", async () => {
    const paste = `Garchomp\nAbility: Rough Skin\n- Earthquake\n\nNotamon\nAbility: Rough Skin\n- Earthquake`;
    const { members, notes } = await importPaste(paste, CH, db);
    expect(members).toHaveLength(2);
    expect(members[0].species).toBe("garchomp");
    storedText(members[1].species, "Notamon");
    expect(notes.some((n) => n.slot === 1 && n.kind === "pokemon")).toBe(true);
  });

  it("returns empty members/notes for a blank paste", async () => {
    expect(await importPaste("", CH, db)).toEqual({ members: [], notes: [] });
  });
});

describe("exportPaste", () => {
  it("round-trips members → Showdown text → members without Tera (CF-TEAM-AC-3.4)", async () => {
    const members: TeamMember[] = [
      {
        species: "garchomp",
        ability: "rough-skin",
        item: "leftovers",
        moves: ["earthquake", "fake-out"],
        nature: "jolly",
        evs: { hp: 0, atk: 32, def: 2, spa: 0, spd: 0, spe: 32 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 0 },
        tera_type: null,
        level: 50,
        nickname: "Chompy",
        gender: "M",
        shiny: true,
      },
    ];

    const text = await exportPaste(members, CH, db);
    expect(text).toContain("Garchomp");
    expect(text).toContain("Rough Skin");
    expect(text).toContain("Leftovers");
    expect(text).not.toMatch(/Tera Type/i);
    expect(text).toMatch(/Level:\s*50/);
    expect(text).toMatch(/EVs:/);
    expect(text).toMatch(/32 Atk/);

    const { members: round } = await importPaste(text, CH, db);
    expect(round[0].species).toBe("garchomp");
    expect(round[0].tera_type).toBeNull();
    expect(round[0].level).toBe(50);
    expect(round[0].evs).toEqual(members[0].evs);
    expect(round[0].ability).toBe("rough-skin");
    expect(round[0].item).toBe("leftovers");
    expect(round[0].moves).toEqual(["earthquake", "fake-out"]);
    expect(round[0].nature).toBe("jolly");
    expect(round[0].nickname).toBe("Chompy");
  });

  it("omits Tera even when the stored member still has tera_type (ADR-7)", async () => {
    const members: TeamMember[] = [
      {
        species: "garchomp",
        ability: "rough-skin",
        item: null,
        moves: ["earthquake"],
        nature: "jolly",
        evs: evs0,
        ivs: ivs31,
        tera_type: "dragon",
        level: 50,
      },
    ];
    const text = await exportPaste(members, CH, db);
    expect(text).not.toMatch(/Tera Type/i);
  });

  it("exports an empty team to an empty string", async () => {
    expect(await exportPaste([], CH, db)).toBe("");
  });
});
