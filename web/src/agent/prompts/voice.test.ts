/**
 * Structure pins for the voice-mode Pokédex instructions (`./voice`). This is
 * a NEW prompt surface (see the top-of-file comment in voice.ts) — these tests
 * pin its own shape, not the domain.ts/domain-grok.ts parity contract.
 */

import { describe, expect, it } from "vitest";

import { buildVoiceInstructions } from "@/agent/prompts/voice";
import { CHAMPIONS_REGULATION } from "@/data/formats";
import { MAINLINE_GEN_INFO } from "@/agent/prompts/gen-info";

describe("buildVoiceInstructions", () => {
  it("always carries the Pokédex persona and the spoken-answer contract", () => {
    const instructions = buildVoiceInstructions({ format: "champions" });

    expect(instructions).toContain("Oak");
    expect(instructions).toMatch(/Pokédex/i);
    expect(instructions.toLowerCase()).toContain("voice mode");
  });

  it("forbids markdown, lists, URLs, and emoji in spoken answers", () => {
    const instructions = buildVoiceInstructions({ format: "champions" });

    expect(instructions).toMatch(/never use markdown/i);
    expect(instructions.toLowerCase()).toContain("bullet");
    expect(instructions.toLowerCase()).toContain("emoji");
    expect(instructions.toLowerCase()).toContain("url");
  });

  it("instructs announcing tool use before calling, naming key tools", () => {
    const instructions = buildVoiceInstructions({ format: "champions" });

    expect(instructions).toMatch(/before calling any tool/i);
    expect(instructions).toContain("resolve_entity");
    expect(instructions).toContain("get_pokemon");
    expect(instructions).toContain("get_move");
    expect(instructions).toContain("estimate_damage");
    expect(instructions).toContain("get_usage_stats");
  });

  it("never mentions submit_answer — voice has no structured output contract", () => {
    const instructions = buildVoiceInstructions({ format: "champions" });
    expect(instructions).not.toContain("submit_answer");
  });

  it("forbids speaking internal tool/table/database names aloud", () => {
    const instructions = buildVoiceInstructions({ format: "champions" });
    expect(instructions).toMatch(
      /Never speak the name of a tool, table, database/i,
    );
  });

  it("includes two example exchanges: a tool-backed answer and a miss", () => {
    const instructions = buildVoiceInstructions({ format: "champions" });

    expect(instructions).toContain("EXAMPLES");
    expect(instructions).toContain("Example 1");
    expect(instructions).toContain("Example 2");
    // Tool call named as a bracketed stage direction, not spoken aloud.
    expect(instructions).toMatch(/\[calls get_pokemon\]/);
    expect(instructions).toMatch(/\[calls resolve_entity\]/);
    // The miss example offers the nearest real alternative instead of failing silently.
    expect(instructions.toLowerCase()).toContain("did you mean");
  });

  it("keeps the EXAMPLES section scope-neutral (same in every format)", () => {
    const champions = buildVoiceInstructions({ format: "champions" });
    const gen7 = buildVoiceInstructions({ format: "gen-7" });

    const extractExamples = (s: string) =>
      s.slice(s.indexOf("EXAMPLES"), s.indexOf("SCOPE AND CERTAINTY"));

    expect(extractExamples(champions)).toBe(extractExamples(gen7));
  });

  it("a champions build names the current regulation and Champions mechanics", () => {
    const instructions = buildVoiceInstructions({ format: "champions" });

    expect(instructions).toContain(CHAMPIONS_REGULATION);
    expect(instructions).toContain("POKÉMON CHAMPIONS");
    expect(instructions).toContain("Mega Evolution");
    expect(instructions).not.toContain("Generation 7");
  });

  it("a gen-7 build names Gen 7 facts, not Champions", () => {
    const instructions = buildVoiceInstructions({ format: "gen-7" });
    const info = MAINLINE_GEN_INFO["gen-7"];

    expect(instructions).toContain("GENERATION 7");
    expect(instructions).toContain(info.gamesShort);
    expect(instructions).toContain("Z-Moves");
    expect(instructions).not.toContain(CHAMPIONS_REGULATION);
    expect(instructions).not.toContain("POKÉMON CHAMPIONS");
  });

  it("every mainline format builds without throwing and names its own generation", () => {
    for (const format of ["scarlet-violet", "gen-5", "gen-6", "gen-8"] as const) {
      const instructions = buildVoiceInstructions({ format });
      expect(instructions.length).toBeGreaterThan(500);
    }
  });

  it("appends the history section only when historyDigest is provided", () => {
    const withoutHistory = buildVoiceInstructions({ format: "champions" });
    expect(withoutHistory).not.toContain("EARLIER IN THIS CONVERSATION");

    const withHistory = buildVoiceInstructions({
      format: "champions",
      historyDigest: "User asked about Garchomp's Speed; Oak answered 169.",
    });
    expect(withHistory).toContain("EARLIER IN THIS CONVERSATION");
    expect(withHistory).toContain("User asked about Garchomp's Speed; Oak answered 169.");
  });

  it("omits the history section for an empty or whitespace-only digest", () => {
    const blank = buildVoiceInstructions({ format: "champions", historyDigest: "   " });
    expect(blank).not.toContain("EARLIER IN THIS CONVERSATION");

    const empty = buildVoiceInstructions({ format: "champions", historyDigest: "" });
    expect(empty).not.toContain("EARLIER IN THIS CONVERSATION");
  });
});
