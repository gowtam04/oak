import { describe, expect, it } from "vitest";

import {
  STARTER_ENTRIES,
  STARTER_PROMPTS,
  pickRandomPrompts,
  pickRandomStarters,
} from "./example-prompts";

const CATEGORIES = new Set(["Battle", "Dex", "Rules", "Meta"]);

describe("STARTER_ENTRIES", () => {
  it("has no duplicate prompt texts", () => {
    expect(new Set(STARTER_ENTRIES.map((e) => e.text)).size).toBe(
      STARTER_ENTRIES.length,
    );
  });

  it("uses only soul.md categories (Battle / Dex / Rules / Meta)", () => {
    for (const entry of STARTER_ENTRIES) {
      expect(CATEGORIES.has(entry.category)).toBe(true);
    }
  });

  it("covers all four categories", () => {
    const seen = new Set(STARTER_ENTRIES.map((e) => e.category));
    expect(seen).toEqual(CATEGORIES);
  });
});

describe("STARTER_PROMPTS", () => {
  it("mirrors STARTER_ENTRIES texts with no duplicates", () => {
    expect(STARTER_PROMPTS).toEqual(STARTER_ENTRIES.map((e) => e.text));
    expect(new Set(STARTER_PROMPTS).size).toBe(STARTER_PROMPTS.length);
  });
});

describe("pickRandomPrompts", () => {
  it("returns n distinct members of the pool", () => {
    const picked = pickRandomPrompts(5);
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
    for (const prompt of picked) {
      expect(STARTER_PROMPTS).toContain(prompt);
    }
  });

  it("returns the whole pool when n exceeds the pool length", () => {
    const picked = pickRandomPrompts(STARTER_PROMPTS.length + 10);
    expect(picked).toHaveLength(STARTER_PROMPTS.length);
    expect(new Set(picked).size).toBe(STARTER_PROMPTS.length);
  });
});

describe("pickRandomStarters", () => {
  it("returns n distinct filed starters with category + text", () => {
    const picked = pickRandomStarters(4);
    expect(picked).toHaveLength(4);
    expect(new Set(picked.map((e) => e.text)).size).toBe(4);
    for (const entry of picked) {
      expect(CATEGORIES.has(entry.category)).toBe(true);
      expect(STARTER_PROMPTS).toContain(entry.text);
    }
  });
});
