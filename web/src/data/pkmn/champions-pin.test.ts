/**
 * Offline gates for the Showdown-pinned Champions ingest path.
 *
 * Fail the build if the pin is a half-mod (FormatsData unban without species
 * bytes) or still the stale npm @pkmn/mods 0.10.11 leftover abilities.
 * No network.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { loadFormat, type FormatSource } from "./gen-provider";
import { SHOWDOWN_PIN } from "./showdown-pin";
import {
  applyInherit,
  applyText,
  loadChampionsShowdownMod,
  SHOWDOWN_VENDOR_DIR,
} from "./showdown-loader";

const MC_IDS = [
  "rillaboom",
  "salamence",
  "salamencemega",
  "golisopod",
  "golisopodmega",
  "baxcalibur",
  "baxcaliburmega",
  "lucariomegaz",
  "garchompmegaz",
  "absolmegaz",
] as const;

const EXPECTED_ABILITY: Record<string, string> = {
  lucariomegaz: "Aura Guard",
  golisopodmega: "Tough Claws",
  garchompmegaz: "Levitate",
  absolmegaz: "Sharpness",
  salamencemega: "Aerilate",
  baxcaliburmega: "Thermal Exchange",
};

const STALE_ABILITY: Record<string, string> = {
  lucariomegaz: "Adaptability",
  golisopodmega: "Emergency Exit",
  garchompmegaz: "Sand Force",
  absolmegaz: "Magic Bounce",
};

describe("applyInherit", () => {
  it("merges inherit overlays onto the base id and drops undefined keys", () => {
    const base = {
      anchorshot: { name: "Anchor Shot", basePower: 80, pp: 20 },
      lucarionitez: { name: "Lucarionite Z", megaStone: { Lucario: "Lucario-Mega-Z" } },
    };
    const overlay = {
      anchorshot: { inherit: true, basePower: 90 },
      lucarionitez: { inherit: true, isNonstandard: null, onTakeItem: undefined },
    };
    const out = applyInherit(base, overlay);
    expect(out.anchorshot).toEqual({ name: "Anchor Shot", basePower: 90, pp: 20 });
    expect(out.lucarionitez).toMatchObject({
      name: "Lucarionite Z",
      megaStone: { Lucario: "Lucario-Mega-Z" },
      isNonstandard: null,
    });
    expect(out.lucarionitez).not.toHaveProperty("onTakeItem");
    expect(out.lucarionitez).not.toHaveProperty("inherit");
  });
});

describe("applyText", () => {
  it("copies current-gen shortDesc/desc onto matching mechanics ids", () => {
    const mechanics = {
      bulletproof: { name: "Bulletproof", flags: { breakable: 1 } },
      aurasphere: { name: "Aura Sphere", basePower: 80 },
    };
    const text = {
      bulletproof: {
        name: "Bulletproof",
        shortDesc: "This Pokemon is immune to bullet moves.",
        gen6: { shortDesc: "old" },
      },
      aurasphere: {
        name: "Aura Sphere",
        desc: "Does not check accuracy.",
        shortDesc: "This move does not check accuracy.",
      },
    };
    const out = applyText(mechanics, text);
    expect(out.bulletproof).toMatchObject({
      name: "Bulletproof",
      flags: { breakable: 1 },
      shortDesc: "This Pokemon is immune to bullet moves.",
      desc: "This Pokemon is immune to bullet moves.",
    });
    expect(out.aurasphere).toMatchObject({
      name: "Aura Sphere",
      basePower: 80,
      shortDesc: "This move does not check accuracy.",
      desc: "Does not check accuracy.",
    });
  });

  it("leaves unmatched mechanics ids unchanged so ingest can fail loud", () => {
    const out = applyText(
      { mystery: { name: "Mystery" } },
      { bulletproof: { shortDesc: "immune to bullet moves." } },
    );
    expect(out.mystery).toEqual({ name: "Mystery" });
    expect(out.mystery).not.toHaveProperty("shortDesc");
  });

  it("inherits Hidden Power clone prose from the base move", () => {
    const out = applyText(
      { hiddenpowerbug: { name: "Hidden Power Bug" } },
      {
        hiddenpower: {
          shortDesc: "Varies in type based on the user's IVs.",
          desc: "Type depends on IVs.",
        },
        hiddenpowerbug: { name: "Hidden Power Bug" },
      },
    );
    expect(out.hiddenpowerbug).toMatchObject({
      name: "Hidden Power Bug",
      shortDesc: "Varies in type based on the user's IVs.",
      desc: "Type depends on IVs.",
    });
  });

  it("fills Nihil Light from the mechanics-derived fallback", () => {
    const out = applyText({ nihillight: { name: "Nihil Light" } }, {});
    expect(out.nihillight).toMatchObject({ name: "Nihil Light" });
    expect((out.nihillight as { shortDesc: string }).shortDesc).toMatch(/Dragon/i);
  });
});

describe("Champions Showdown pin", () => {
  let champions: FormatSource;
  let ids: Set<string>;

  beforeAll(async () => {
    champions = await loadFormat("champions");
    ids = new Set(champions.roster.map((s) => s.id));
  });

  it("records the pinned SHA on the source and in vendor/SHA", () => {
    const vendorSha = readFileSync(path.join(SHOWDOWN_VENDOR_DIR, "SHA"), "utf8").trim();
    expect(vendorSha).toBe(SHOWDOWN_PIN.sha);
    expect(champions.showdownPin).toBe(SHOWDOWN_PIN.sha);
    expect(SHOWDOWN_PIN.regulation).toBe("Regulation M-C");
  });

  it("keeps restricteds out of the roster", () => {
    for (const id of ["mewtwo", "koraidon", "miraidon"]) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it("gates roster size to hundreds, not the full dex", () => {
    expect(champions.roster.length).toBeGreaterThan(320);
    expect(champions.roster.length).toBeLessThan(500);
  });

  it("gives every legal FormatsData id real species bytes (half-mod fails)", async () => {
    const { modData } = await loadChampionsShowdownMod();
    const fd = (
      modData as {
        FormatsData?: Record<string, { isNonstandard?: unknown }>;
      }
    ).FormatsData;
    expect(fd).toBeDefined();
    const legal = Object.keys(fd!).filter((id) => !fd![id]?.isNonstandard);
    expect(legal.length).toBe(champions.roster.length);
    for (const id of legal) {
      const sp = champions.dex.species.get(id);
      expect(sp.exists, id).toBe(true);
      expect(sp.num, id).toBeGreaterThan(0);
      expect(sp.types.length, id).toBeGreaterThanOrEqual(1);
      expect(sp.abilities[0], id).toBeTruthy();
    }
  });

  it("includes M-C species with real stats/types/abilities (not a FormatsData-only unban)", () => {
    for (const id of MC_IDS) {
      expect(ids.has(id)).toBe(true);
      const sp = champions.dex.species.get(id);
      expect(sp.exists).toBe(true);
      expect(sp.num).toBeGreaterThan(0);
      expect(sp.types.length).toBeGreaterThanOrEqual(1);
      const stats = sp.baseStats;
      for (const stat of ["hp", "atk", "def", "spa", "spd", "spe"] as const) {
        const n = stats[stat];
        expect(typeof n).toBe("number");
        expect(n).toBeGreaterThan(0);
      }
      expect(sp.abilities[0]).toBeTruthy();
    }
  });

  it("does not use stale Z-A leftover abilities on M-C formes", () => {
    for (const [id, name] of Object.entries(EXPECTED_ABILITY)) {
      const sp = champions.dex.species.get(id);
      expect(sp.abilities[0]).toBe(name);
      const stale = STALE_ABILITY[id];
      if (stale) expect(sp.abilities[0]).not.toBe(stale);
    }
    const bax = champions.dex.species.get("baxcaliburmega");
    expect(bax.abilities[0]).toBe("Thermal Exchange");
    expect(Object.values(bax.abilities)).not.toContain("Ice Body");
  });

  it("loads Aura Guard onto the champions dex", () => {
    const ability = champions.dex.abilities.get("auraguard");
    expect(ability.exists).toBe(true);
    expect(ability.name).toBe("Aura Guard");
    expect(champions.abilities.some((a) => a.id === "auraguard")).toBe(true);
  });

  it("applies the Champions Anchor Shot override (90, not 80)", () => {
    expect(champions.dex.moves.get("anchorshot").basePower).toBe(90);
  });

  it("merges Showdown text so Bulletproof / Aura Sphere / Leftovers have prose", () => {
    const bulletproof = champions.dex.abilities.get("bulletproof");
    expect(bulletproof.shortDesc).toMatch(/bullet/i);
    const armorTail = champions.dex.abilities.get("armortail");
    expect(armorTail.shortDesc || armorTail.desc).toBeTruthy();
    const leftovers = champions.dex.items.get("leftovers");
    expect(leftovers.shortDesc).toMatch(/HP/i);
    const auraSphere = champions.dex.moves.get("aurasphere");
    expect(auraSphere.shortDesc).toBeTruthy();
    expect(auraSphere.flags.bullet).toBeTruthy();
    expect(auraSphere.flags.pulse).toBeTruthy();
    expect(champions.dex.moves.get("hiddenpowerbug").shortDesc).toBeTruthy();
    expect(champions.dex.moves.get("nihillight").shortDesc).toMatch(/Dragon/i);
  });

  it("indexes non-empty effect text for every ability, move, and item", () => {
    const missing = (id: string, shortDesc?: string, desc?: string): string | null =>
      shortDesc || desc ? null : id;
    const badAbilities = champions.abilities
      .map((a) => missing(a.id, a.shortDesc, a.desc))
      .filter((id): id is string => id !== null);
    const badMoves = champions.moves
      .map((m) => missing(m.id, m.shortDesc, m.desc))
      .filter((id): id is string => id !== null);
    const badItems = champions.items
      .map((i) => missing(i.id, i.shortDesc, i.desc))
      .filter((id): id is string => id !== null);
    expect(badAbilities, `abilities missing text: ${badAbilities.join(",")}`).toEqual(
      [],
    );
    expect(badMoves, `moves missing text: ${badMoves.join(",")}`).toEqual([]);
    expect(badItems, `items missing text: ${badItems.join(",")}`).toEqual([]);
  });

  it("keeps Mega Salamence legal despite tier Uber", () => {
    expect(ids.has("salamencemega")).toBe(true);
  });

  it("returns a non-empty Rillaboom learnset and inherits Lucario-Mega-Z from Lucario", async () => {
    const rilla = await champions.getLearnset("rillaboom");
    expect(Object.keys(rilla).length).toBeGreaterThan(0);
    const megaZ = await champions.getLearnset("lucariomegaz");
    expect(Object.keys(megaZ).length).toBeGreaterThan(0);
    const base = await champions.getLearnset("lucario");
    expect(Object.keys(megaZ).length).toBe(Object.keys(base).length);
  });
});
