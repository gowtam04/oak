import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
