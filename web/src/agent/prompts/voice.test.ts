/**
 * Structure pins for the voice-mode Pokédex instructions (`./voice`).
 *
 * Champions-first: spoken chat is a Champions coach with the same decline
 * rule as text (CF-VOICE-US-1 / CF-VOICE-AC-1.2–1.3). No wiki/SQL tools.
 *
 * Refs: CF-VOICE-US-1, CF-CHAT-US-2, CF-DATA-BR-4, ADR-2.
 */

import { describe, expect, it } from "vitest";

import { buildVoiceInstructions } from "@/agent/prompts/voice";
import { CHAMPIONS_REGULATION } from "@/data/formats";

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
    expect(instructions).toMatch(/\[calls get_pokemon\]/);
    expect(instructions).toMatch(/\[calls resolve_entity\]/);
    expect(instructions.toLowerCase()).toContain("did you mean");
  });

  it("is a Champions coach: current regulation, Stat Points, Mega (CF-VOICE-AC-1.2)", () => {
    const instructions = buildVoiceInstructions({ format: "champions" });

    expect(instructions).toContain(CHAMPIONS_REGULATION);
    expect(instructions).toContain("POKÉMON CHAMPIONS");
    expect(instructions).toContain("Mega Evolution");
    expect(instructions).toContain("Stat Points");
    expect(instructions).not.toContain("Generation 7");
  });

  it("teaches the same decline phrase as text chat (CF-VOICE-AC-1.3, CF-DATA-BR-4)", () => {
    const instructions = buildVoiceInstructions({ format: "champions" });
    expect(instructions).toContain("not in the Champions roster");
    expect(instructions).toMatch(/Pokémon Champions/i);
  });

  it("does not teach wiki/SQL/OU/encounter tools (ADR-2)", () => {
    const instructions = buildVoiceInstructions({ format: "champions" });
    expect(instructions).not.toContain("run_sql");
    expect(instructions).not.toContain("search_wiki");
    expect(instructions).not.toContain("get_meta_usage");
    expect(instructions).not.toContain("get_encounters");
  });

  it("does not build a Gen 7 / other-game voice body when format is gen-7", () => {
    const instructions = buildVoiceInstructions({ format: "gen-7" });
    expect(instructions).toContain(CHAMPIONS_REGULATION);
    expect(instructions).toContain("not in the Champions roster");
    expect(instructions).not.toContain("Z-Moves");
  });

  it("appends the history section only when historyDigest is provided", () => {
    const withoutHistory = buildVoiceInstructions({ format: "champions" });
    expect(withoutHistory).not.toContain("EARLIER IN THIS CONVERSATION");

    const withHistory = buildVoiceInstructions({
      format: "champions",
      historyDigest: "User asked about Garchomp's Speed; Oak answered 169.",
    });
    expect(withHistory).toContain("EARLIER IN THIS CONVERSATION");
    expect(withHistory).toContain(
      "User asked about Garchomp's Speed; Oak answered 169.",
    );
  });

  it("omits the history section for an empty or whitespace-only digest", () => {
    const blank = buildVoiceInstructions({
      format: "champions",
      historyDigest: "   ",
    });
    expect(blank).not.toContain("EARLIER IN THIS CONVERSATION");

    const empty = buildVoiceInstructions({
      format: "champions",
      historyDigest: "",
    });
    expect(empty).not.toContain("EARLIER IN THIS CONVERSATION");
  });
});
