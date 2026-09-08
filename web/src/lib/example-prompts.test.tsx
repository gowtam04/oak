import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { loadFormat, type PkmnSpecies } from "@/data/pkmn/gen-provider";

import {
  STARTER_CATEGORIES,
  STARTER_ENTRIES,
  STARTER_PROMPTS,
  firstFiledStarters,
  pickFiledStarters,
} from "./example-prompts";
import {
  KOTLIN_PATH,
  SWIFT_PATH,
  renderKotlin,
  renderSwift,
} from "../../scripts/sync-example-prompts";

const CATEGORIES = new Set<string>(STARTER_CATEGORIES);

const TYPE_SLUGS = new Set([
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
]);

describe("STARTER_ENTRIES", () => {
  it("has no duplicate prompt texts", () => {
    const texts = STARTER_ENTRIES.map((e) => e.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(new Set(texts.map((t) => t.toLowerCase())).size).toBe(texts.length);
  });

  it("uses only Battle / Dex / Rules / Meta", () => {
    for (const entry of STARTER_ENTRIES) {
      expect(CATEGORIES.has(entry.category)).toBe(true);
    }
  });

  it("covers all four categories with at least one prompt each", () => {
    for (const category of STARTER_CATEGORIES) {
      expect(
        STARTER_ENTRIES.filter((e) => e.category === category).length,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses a known Pokémon type slug on every entry", () => {
    for (const entry of STARTER_ENTRIES) {
      expect(TYPE_SLUGS.has(entry.type), entry.text).toBe(true);
    }
  });

  it("is a large discovery pool with even categories", () => {
    expect(STARTER_ENTRIES.length).toBeGreaterThanOrEqual(200);
    for (const category of STARTER_CATEGORIES) {
      expect(
        STARTER_ENTRIES.filter((e) => e.category === category).length,
      ).toBeGreaterThanOrEqual(50);
    }
    const typesUsed = new Set(STARTER_ENTRIES.map((e) => e.type));
    expect(typesUsed).toEqual(TYPE_SLUGS);
  });

  it("keeps starter texts short enough for a filed row", () => {
    for (const entry of STARTER_ENTRIES) {
      expect(entry.text.length, entry.text).toBeLessThanOrEqual(80);
    }
  });
});

describe("STARTER_PROMPTS", () => {
  it("mirrors STARTER_ENTRIES texts with no duplicates", () => {
    expect(STARTER_PROMPTS).toEqual(STARTER_ENTRIES.map((e) => e.text));
    expect(new Set(STARTER_PROMPTS).size).toBe(STARTER_PROMPTS.length);
  });
});

const TRIVIA: Array<[string, RegExp]> = [
  ["weight", /\bweight\b/i],
  ["heaviest", /\bheaviest\b/i],
  ["lightest", /\blightest\b/i],
  ["color trivia", /\bpurple\b/i],
  ["catch rate", /\bcatch\s*rate\b/i],
  ["based-on trivia", /\bbased on\b/i],
  ["signature moves", /\bsignature moves?\b/i],
];

describe("STARTER_ENTRIES — no unanswerable trivia", () => {
  it("does not ask Pokédex trivia Oak has no tool for", () => {
    for (const entry of STARTER_ENTRIES) {
      for (const [name, re] of TRIVIA) {
        expect(entry.text, `${name}: ${entry.text}`).not.toMatch(re);
      }
    }
  });
});

describe("firstFiledStarters", () => {
  it("returns the first entry of each category in Battle Dex Rules Meta order", () => {
    const first = firstFiledStarters();
    expect(first.map((e) => e.category)).toEqual([...STARTER_CATEGORIES]);
    for (const entry of first) {
      expect(entry).toEqual(
        STARTER_ENTRIES.find((e) => e.category === entry.category),
      );
    }
  });
});

describe("pickFiledStarters", () => {
  it("returns one starter per category in Battle Dex Rules Meta order", () => {
    const picked = pickFiledStarters();
    expect(picked).toHaveLength(4);
    expect(picked.map((e) => e.category)).toEqual([...STARTER_CATEGORIES]);
    expect(new Set(picked.map((e) => e.text)).size).toBe(4);
    for (const entry of picked) {
      expect(STARTER_ENTRIES).toContainEqual(entry);
    }
  });
});

describe("generated iOS/Android mirrors", () => {
  it("match the canonical STARTER_ENTRIES render", () => {
    expect(readFileSync(SWIFT_PATH, "utf8")).toBe(renderSwift(STARTER_ENTRIES));
    expect(readFileSync(KOTLIN_PATH, "utf8")).toBe(
      renderKotlin(STARTER_ENTRIES),
    );
  });
});

/** Explicit legality / restricted-rules chips may name off-roster entities. */
const LEGALITY_EXEMPT = /\blegal in Champions\b|\brestricted Pokémon\b/i;

function humanAliases(s: PkmnSpecies): string[] {
  const names = new Set<string>();
  if (s.name) names.add(s.name);
  if (s.baseSpecies) names.add(s.baseSpecies);
  const forme = s.forme ?? "";
  const base = s.baseSpecies || s.name;
  if (forme) {
    names.add(`${base} (${forme})`);
    names.add(`${base}-${forme}`);
    if (forme === "Mega") {
      names.add(`Mega ${base}`);
    } else if (forme.startsWith("Mega-")) {
      names.add(`Mega ${base} ${forme.slice("Mega-".length)}`);
      names.add(`Mega ${base}-${forme.slice("Mega-".length)}`);
    } else if (forme === "Galar") {
      names.add(`Galarian ${base}`);
    } else if (forme === "Alola") {
      names.add(`Alolan ${base}`);
    } else if (forme === "Hisui") {
      names.add(`Hisuian ${base}`);
    } else if (forme.startsWith("Paldea")) {
      names.add(`Paldean ${base}`);
    } else if (forme === "Rapid-Strike") {
      names.add(`Rapid Strike ${base}`);
    } else if (forme === "Single-Strike") {
      names.add(`Single Strike ${base}`);
    }
  }
  return [...names].filter((n) => n.length > 1);
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namePattern(alias: string): RegExp {
  return new RegExp(`(?<![A-Za-z])${escapeRe(alias)}(?:'s)?(?![A-Za-z])`, "i");
}

describe("STARTER_ENTRIES — current Champions roster", () => {
  let legalAliases: string[] = [];
  let illegalAliases: string[] = [];

  beforeAll(async () => {
    const champions = await loadFormat("champions");
    const legalIds = new Set(champions.roster.map((s) => s.id));
    const legal = new Set<string>();
    const illegal = new Set<string>();
    for (const s of champions.dex.species.all()) {
      if (!s.exists || typeof s.num !== "number" || s.num <= 0) continue;
      const aliases = humanAliases(s);
      if (legalIds.has(s.id)) {
        for (const alias of aliases) legal.add(alias);
        continue;
      }
      // Past/Gmax formes share baseSpecies with legal mons — don't mark
      // "Charizard" illegal because Charizard-Gmax is.
      for (const alias of aliases) {
        if (s.baseSpecies && alias === s.baseSpecies && alias !== s.name) {
          continue;
        }
        illegal.add(alias);
      }
    }
    const byLength = (a: string, b: string) => b.length - a.length;
    legalAliases = [...legal].sort(byLength);
    illegalAliases = [...illegal].sort(byLength);
  });

  it("names only on-roster species, except explicit legality questions", () => {
    expect(legalAliases.length).toBeGreaterThan(200);
    expect(illegalAliases.length).toBeGreaterThan(0);

    for (const entry of STARTER_ENTRIES) {
      const text = entry.text;
      if (LEGALITY_EXEMPT.test(text)) continue;
      const hit = illegalAliases.find((alias) => namePattern(alias).test(text));
      expect(hit, `off-roster "${hit}" in: ${text}`).toBeUndefined();
    }
  });

  it("Meta chips name a legal species so T15 can ground them", () => {
    const meta = STARTER_ENTRIES.filter((e) => e.category === "Meta");
    expect(meta.length).toBeGreaterThanOrEqual(50);
    for (const entry of meta) {
      const hit = legalAliases.find((alias) =>
        namePattern(alias).test(entry.text),
      );
      expect(
        hit,
        `Meta chip names no roster species: ${entry.text}`,
      ).toBeDefined();
    }
  });
});
