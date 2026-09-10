/**
 * Sequential `/calc` slash slots — lockstep oracle (SD-US-10).
 *
 * iOS `SlashCalcTests` and Android `SlashCalcTest` clone these cases.
 * Pure slot/query/insert/split; resolver uses a fake `search`.
 *
 *   calcPickerState(rest, bind):
 *     no attacker bind → slot attacker (query = text before vs, or full rest)
 *     attacker bound, no vs → slot move
 *     vs present → slot defender (move optional)
 *     editing the attacker name cascade-drops move + defender
 *   insertCalcAttacker("Garchomp") === "/calc Garchomp "
 *   insertCalcMove("Garchomp", "Earthquake") === "/calc Garchomp Earthquake vs "
 *   insertCalcSkipMove("Garchomp") === "/calc Garchomp vs "
 *   insertCalcDefender("Garchomp", "Earthquake", "Gholdengo")
 *     === "/calc Garchomp Earthquake vs Gholdengo"
 *   splitCalcRest: vs / vs. / versus; "Garchomp vs" is vsPresent with empty right
 *   resolveCalcScenario: bind slugs win; longest prefix for typed multi-word
 *     names; unresolved → empty side; no vs without an attacker match →
 *     attacker only.
 */

import { describe, expect, it, vi } from "vitest";

import { CHAMPIONS_FORMAT } from "@/data/formats";

import {
  CALC_CAPTION_ATTACKER,
  CALC_CAPTION_DEFENDER,
  CALC_CAPTION_MOVE,
  CALC_SKIP_MOVE,
  EMPTY_CALC_MOVE,
  EMPTY_CALC_SPECIES,
  calcPickerCaption,
  calcPickerState,
  emptyCalcScenario,
  insertCalcAttacker,
  insertCalcDefender,
  insertCalcMove,
  insertCalcSkipMove,
  resolveCalcScenario,
  showCalcSkipMove,
  splitCalcRest,
  type CalcBind,
  type CalcSearchFn,
} from "./slash-calc";
import type { DexNameRow } from "./slash-picker";

const garchomp: DexNameRow = {
  kind: "pokemon",
  slug: "garchomp",
  displayName: "Garchomp",
};
const gholdengo: DexNameRow = {
  kind: "pokemon",
  slug: "gholdengo",
  displayName: "Gholdengo",
};
const ironBundle: DexNameRow = {
  kind: "pokemon",
  slug: "ironbundle",
  displayName: "Iron Bundle",
};
const flutterMane: DexNameRow = {
  kind: "pokemon",
  slug: "fluttermane",
  displayName: "Flutter Mane",
};
const earthquake: DexNameRow = {
  kind: "move",
  slug: "earthquake",
  displayName: "Earthquake",
};
const playRough: DexNameRow = {
  kind: "move",
  slug: "playrough",
  displayName: "Play Rough",
};

const roster: DexNameRow[] = [
  garchomp,
  gholdengo,
  ironBundle,
  flutterMane,
  earthquake,
  playRough,
];

const search: CalcSearchFn = async (kind, query) => {
  const needle = query.toLowerCase();
  return roster.filter(
    (row) =>
      row.kind === kind
      && (row.displayName.toLowerCase() === needle
        || row.slug.toLowerCase() === needle),
  );
};

describe("copy", () => {
  it("exports slot captions, skip-move label, and empty lines (SD-US-10)", () => {
    expect(CALC_CAPTION_ATTACKER).toBe("Pick attacker · or Send to open empty");
    expect(CALC_CAPTION_MOVE).toBe("Pick move · or Send");
    expect(CALC_CAPTION_DEFENDER).toBe("Pick defender · or Send");
    expect(calcPickerCaption("attacker")).toBe(CALC_CAPTION_ATTACKER);
    expect(calcPickerCaption("move")).toBe(CALC_CAPTION_MOVE);
    expect(calcPickerCaption("defender")).toBe(CALC_CAPTION_DEFENDER);
    expect(CALC_SKIP_MOVE).toBe("vs …");
    expect(EMPTY_CALC_SPECIES).toBe("No Pokémon matches");
    expect(EMPTY_CALC_MOVE).toBe("No move matches");
    expect(showCalcSkipMove("move", "")).toBe(true);
    expect(showCalcSkipMove("move", "earth")).toBe(false);
    expect(showCalcSkipMove("attacker", "")).toBe(false);
  });
});

describe("splitCalcRest", () => {
  it("splits on vs, vs., and versus (case-insensitive)", () => {
    expect(splitCalcRest("garchomp earthquake vs gholdengo")).toEqual({
      left: "garchomp earthquake",
      right: "gholdengo",
      vsPresent: true,
    });
    expect(splitCalcRest("garchomp earthquake vs. gholdengo")).toEqual({
      left: "garchomp earthquake",
      right: "gholdengo",
      vsPresent: true,
    });
    expect(splitCalcRest("garchomp versus gholdengo")).toEqual({
      left: "garchomp",
      right: "gholdengo",
      vsPresent: true,
    });
    expect(splitCalcRest("Garchomp VS Gholdengo").vsPresent).toBe(true);
  });

  it("treats a trailing vs as vsPresent with an empty right", () => {
    expect(splitCalcRest("Garchomp vs")).toEqual({
      left: "Garchomp",
      right: "",
      vsPresent: true,
    });
    expect(splitCalcRest("Garchomp vs ")).toEqual({
      left: "Garchomp",
      right: "",
      vsPresent: true,
    });
  });

  it("does not split when vs is absent", () => {
    expect(splitCalcRest("garchomp earthquake")).toEqual({
      left: "garchomp earthquake",
      right: null,
      vsPresent: false,
    });
    expect(splitCalcRest("")).toEqual({
      left: "",
      right: null,
      vsPresent: false,
    });
  });
});

describe("insert helpers", () => {
  it("builds slot strings with vs inserted after a move or skip", () => {
    expect(insertCalcAttacker("Garchomp")).toBe("/calc Garchomp ");
    expect(insertCalcAttacker("Iron Bundle")).toBe("/calc Iron Bundle ");
    expect(insertCalcMove("Garchomp", "Earthquake")).toBe(
      "/calc Garchomp Earthquake vs ",
    );
    expect(insertCalcSkipMove("Garchomp")).toBe("/calc Garchomp vs ");
    expect(insertCalcDefender("Garchomp", "Earthquake", "Gholdengo")).toBe(
      "/calc Garchomp Earthquake vs Gholdengo",
    );
    expect(insertCalcDefender("Garchomp", undefined, "Gholdengo")).toBe(
      "/calc Garchomp vs Gholdengo",
    );
  });
});

describe("calcPickerState", () => {
  it("starts on attacker with an empty rest", () => {
    expect(calcPickerState("", null)).toEqual({
      slot: "attacker",
      query: "",
      bind: {},
      vsPresent: false,
    });
    expect(calcPickerState("Gar", null)).toEqual({
      slot: "attacker",
      query: "Gar",
      bind: {},
      vsPresent: false,
    });
  });

  it("uses the left side as attacker query when vs is typed without a bind", () => {
    expect(calcPickerState("garchomp vs gholdengo", null)).toEqual({
      slot: "attacker",
      query: "garchomp",
      bind: {},
      vsPresent: true,
    });
  });

  it("moves to the move slot after an attacker bind", () => {
    const bind: CalcBind = { attacker: garchomp };
    expect(calcPickerState("Garchomp", bind)).toEqual({
      slot: "move",
      query: "",
      bind,
      vsPresent: false,
    });
    expect(calcPickerState("Garchomp Earth", bind)).toEqual({
      slot: "move",
      query: "Earth",
      bind,
      vsPresent: false,
    });
  });

  it("moves to the defender slot after vs, with or without a move bind", () => {
    expect(
      calcPickerState("Garchomp Earthquake vs", {
        attacker: garchomp,
        move: earthquake,
      }),
    ).toEqual({
      slot: "defender",
      query: "",
      bind: { attacker: garchomp, move: earthquake },
      vsPresent: true,
    });
    expect(calcPickerState("Garchomp vs Ghol", { attacker: garchomp })).toEqual({
      slot: "defender",
      query: "Ghol",
      bind: { attacker: garchomp },
      vsPresent: true,
    });
    expect(
      calcPickerState("Garchomp Earthquake vs Gholdengo", {
        attacker: garchomp,
        move: earthquake,
        defender: gholdengo,
      }),
    ).toEqual({
      slot: "defender",
      query: "Gholdengo",
      bind: { attacker: garchomp, move: earthquake, defender: gholdengo },
      vsPresent: true,
    });
  });

  it("cascade-drops later binds when the attacker name is edited", () => {
    const bind: CalcBind = {
      attacker: garchomp,
      move: earthquake,
      defender: gholdengo,
    };
    expect(calcPickerState("Garchom Earthquake vs Gholdengo", bind)).toEqual({
      slot: "attacker",
      query: "Garchom Earthquake",
      bind: {},
      vsPresent: true,
    });
    expect(calcPickerState("Garchomp Earth vs Gholdengo", bind)).toEqual({
      slot: "defender",
      query: "Gholdengo",
      bind: { attacker: garchomp, defender: gholdengo },
      vsPresent: true,
    });
  });

  it("keeps multi-word attacker names as a single prefix", () => {
    const bind: CalcBind = { attacker: ironBundle };
    expect(calcPickerState("Iron Bundle Play", bind)).toEqual({
      slot: "move",
      query: "Play",
      bind,
      vsPresent: false,
    });
  });
});

describe("resolveCalcScenario", () => {
  it("returns an empty Champions scenario for empty rest", async () => {
    await expect(
      resolveCalcScenario({ rest: "", bind: null, search }),
    ).resolves.toEqual(emptyCalcScenario());
    expect(emptyCalcScenario().format).toBe(CHAMPIONS_FORMAT);
  });

  it("uses bind slugs without searching those slots", async () => {
    const spy = vi.fn(search);
    const scenario = await resolveCalcScenario({
      rest: "Garchomp Earthquake vs Gholdengo",
      bind: { attacker: garchomp, move: earthquake, defender: gholdengo },
      search: spy,
    });
    expect(scenario).toEqual({
      format: CHAMPIONS_FORMAT,
      attacker: { species: "garchomp" },
      defender: { species: "gholdengo" },
      move: { slug: "earthquake", name: "Earthquake" },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("resolves the classic single-word typed rest", async () => {
    await expect(
      resolveCalcScenario({
        rest: "garchomp earthquake vs gholdengo",
        bind: null,
        search,
      }),
    ).resolves.toEqual({
      format: CHAMPIONS_FORMAT,
      attacker: { species: "garchomp" },
      defender: { species: "gholdengo" },
      move: { slug: "earthquake", name: "Earthquake" },
    });
  });

  it("longest-prefix matches multi-word Champions names (SD-US-10)", async () => {
    await expect(
      resolveCalcScenario({
        rest: "iron bundle play rough vs flutter mane",
        bind: null,
        search,
      }),
    ).resolves.toEqual({
      format: CHAMPIONS_FORMAT,
      attacker: { species: "ironbundle" },
      defender: { species: "fluttermane" },
      move: { slug: "playrough", name: "Play Rough" },
    });
  });

  it("leaves unresolved tokens empty (CALC-AC-3.3)", async () => {
    await expect(
      resolveCalcScenario({
        rest: "not-a-species vs also-fake",
        bind: null,
        search,
      }),
    ).resolves.toEqual(emptyCalcScenario());
  });

  it("without vs, only fills a move when an attacker prefix was consumed", async () => {
    await expect(
      resolveCalcScenario({
        rest: "garchomp earthquake",
        bind: null,
        search,
      }),
    ).resolves.toEqual({
      format: CHAMPIONS_FORMAT,
      attacker: { species: "garchomp" },
      defender: {},
      move: { slug: "earthquake", name: "Earthquake" },
    });
    await expect(
      resolveCalcScenario({
        rest: "zzq earthquake",
        bind: null,
        search,
      }),
    ).resolves.toEqual(emptyCalcScenario());
  });

  it("never throws when search rejects", async () => {
    await expect(
      resolveCalcScenario({
        rest: "garchomp vs gholdengo",
        bind: null,
        search: async () => {
          throw new Error("network");
        },
      }),
    ).resolves.toEqual(emptyCalcScenario());
  });
});
