/**
 * P3 / ADR-2 — voice gating after T18/T19 (and T14/T21) leave the barrel.
 *
 * Remaining voice tools still exclude submit_answer (voice speaks; no OakAnswer
 * contract). Do not re-list run_sql / search_wiki — they are gone, not gated.
 *
 * Refs: ADR-2, CF-VOICE-US-1.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { tools } from "@/agent/tools";
import { VOICE_EXCLUDED_TOOLS } from "@/agent/tools/voice-gating";

const REMOVED_TOOL_NAMES = [
  "get_encounters",
  "run_sql",
  "search_wiki",
  "get_meta_usage",
] as const;

describe("VOICE_EXCLUDED_TOOLS (Champions-first)", () => {
  it("still excludes submit_answer (voice has no structured output contract)", () => {
    expect(VOICE_EXCLUDED_TOOLS.has("submit_answer")).toBe(true);
  });

  it("does not name removed T14/T18/T19/T21 — they are gone from the barrel", () => {
    for (const removed of REMOVED_TOOL_NAMES) {
      expect(VOICE_EXCLUDED_TOOLS.has(removed)).toBe(false);
    }
  });

  it("does not invent exclusions for remaining voice-capable tools", () => {
    for (const name of [
      "resolve_entity",
      "get_pokemon",
      "get_move",
      "get_learnset",
      "lookup_box",
      "get_usage_stats",
    ]) {
      expect(VOICE_EXCLUDED_TOOLS.has(name)).toBe(false);
    }
  });

  it("voice-advertised names are the barrel minus the exclusion set", () => {
    const advertised = tools
      .map((t) => t.name)
      .filter((name) => !VOICE_EXCLUDED_TOOLS.has(name));
    expect(advertised).not.toContain("submit_answer");
    expect(advertised).toContain("get_pokemon");
    expect(advertised).toContain("lookup_box");
    expect(advertised).not.toContain("run_sql");
    expect(advertised).not.toContain("search_wiki");
  });
});
