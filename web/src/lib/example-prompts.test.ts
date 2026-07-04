import { describe, expect, it } from "vitest";

import { STARTER_PROMPTS, pickRandomPrompts } from "./example-prompts";

describe("STARTER_PROMPTS", () => {
  it("has no duplicate entries", () => {
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
