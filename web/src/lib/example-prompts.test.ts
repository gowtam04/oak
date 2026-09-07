import { describe, expect, it } from "vitest";

import { STARTER_ENTRIES, STARTER_PROMPTS } from "./example-prompts";

/**
 * Champions-first starter pool (CF-CHAT-AC-1.3, CF-UI-AC-3.2).
 * Imports the exported list only — does not restate production copy.
 */

const OTHER_GAME: Array<[string, RegExp]> = [
  ["other generations", /\bgen(?:eration)?s?\s*[1-9]\b|\bevery generation\b/i],
  ["National Dex", /national\s*dex/i],
  ["Scarlet/Violet", /\bscarlet\b|\bviolet\b/i],
  ["Mystery Dungeon", /mystery\s*dungeon|\bpmd\b/i],
  ["glitches", /\bglitch(?:es|ed)?\b/i],
  [
    "catch locations",
    /\bcatch(?:es|ing)?\b(?!\s+rate)|\bwhere (?:can i|do (?:i|you)|to) (?:find|catch)\b|\bencounter locations?\b/i,
  ],
  ["Tera", /\btera(?:stall(?:iz(?:e|ation))?|blast| type)?\b/i],
  ["Smogon OU", /\bsmogon\b|\bgen\s*9\s*ou\b|\bgen9ou\b/i],
];

describe("STARTER_PROMPTS — Champions-only (CF-CHAT-AC-1.3)", () => {
  it("exports a non-empty pool that matches STARTER_ENTRIES texts", () => {
    expect(STARTER_PROMPTS.length).toBeGreaterThan(0);
    expect(STARTER_PROMPTS).toEqual(STARTER_ENTRIES.map((e) => e.text));
  });

  it("every starter is a valid Champions question: no other gens, PMD, glitches, catch locations, Tera, or Smogon OU", () => {
    expect(STARTER_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of STARTER_ENTRIES) {
      const text = entry.text;
      expect(text.trim().length, "empty starter").toBeGreaterThan(0);
      for (const [name, re] of OTHER_GAME) {
        expect(text, `${name}: ${text}`).not.toMatch(re);
      }
      // Case-sensitive OU ladder tag (avoid matching "you").
      expect(text, `Smogon OU: ${text}`).not.toMatch(/(?<![A-Za-z])OU(?![A-Za-z])/);
    }
  });
});
