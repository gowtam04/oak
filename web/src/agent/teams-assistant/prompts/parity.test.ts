/**
 * PARITY guard for the team-builder assistant's two prompt bodies — the
 * builder twin of @/agent/prompts/parity.test.ts. `./domain` (Claude/OpenAI
 * Markdown) and `./domain-grok` (Grok XML) must carry the SAME domain facts;
 * mainline scopes are templated from the single-source `MAINLINE_GEN_INFO`
 * (@/agent/prompts/gen-info) so parity holds by construction there, and
 * Champions is a standalone variant hand-authored in both bodies (checked
 * fact-by-fact below).
 */

import { describe, expect, it } from "vitest";

import type { ProviderKind } from "@/agent/models";
import { MAINLINE_GEN_INFO, type MainlineMode } from "@/agent/prompts/gen-info";
import { CHAMPIONS_REGULATION } from "@/data/formats";
import { builderDomainForMode } from "./domain";
import { grokBuilderDomainForMode } from "./domain-grok";
import { buildBuilderSystemSegments } from "./index";

function fullText(domain: { systemPrompt: string; fewShot: string }): string {
  return `${domain.systemPrompt}\n${domain.fewShot}`;
}

describe("champions body parity", () => {
  const claudeText = fullText(builderDomainForMode("champions"));
  const grokText = fullText(grokBuilderDomainForMode("champions"));

  it("both bodies carry the Stat Points budget, the Mega-only gimmick, the regulation, and the output contract", () => {
    for (const text of [claudeText, grokText]) {
      expect(text).toContain("66"); // Stat Points budget
      expect(text).toContain("-mega"); // Mega slug convention
      expect(text).toContain(CHAMPIONS_REGULATION);
      expect(text).toContain("submit_builder_answer");
      expect(text).toContain("team_patch");
      expect(text).toContain("get_learnset");
    }
  });

  it("neither body claims Terastallization is available in Champions", () => {
    expect(claudeText).not.toContain("Terastallization is available");
    expect(grokText).not.toContain("Terastallization is available");
    // The actual claim is the opposite — pin that too, so a future edit that
    // silently drops the "NO Terastallization" fact from one body still fails.
    expect(claudeText.toLowerCase()).toContain("no terastallization");
    expect(grokText.toLowerCase()).toContain("no terastallization");
  });
});

describe("mainline body parity — every scope in MAINLINE_GEN_INFO", () => {
  const modes = Object.keys(MAINLINE_GEN_INFO) as MainlineMode[];

  it("covers exactly standard + gen-5..gen-8", () => {
    expect([...modes].sort()).toEqual([
      "gen-5",
      "gen-6",
      "gen-7",
      "gen-8",
      "standard",
    ]);
  });

  for (const mode of modes) {
    const info = MAINLINE_GEN_INFO[mode];

    it(`${mode}: both bodies embed the gen-info mechanicsNotes verbatim (parity by construction)`, () => {
      const claudeText = fullText(builderDomainForMode(mode));
      const grokText = fullText(grokBuilderDomainForMode(mode));
      expect(claudeText).toContain(info.mechanicsNotes);
      expect(grokText).toContain(info.mechanicsNotes);
    });

    it(`${mode}: both bodies mention get_learnset`, () => {
      const claudeText = fullText(builderDomainForMode(mode));
      const grokText = fullText(grokBuilderDomainForMode(mode));
      expect(claudeText).toContain("get_learnset");
      expect(grokText).toContain("get_learnset");
    });
  }
});

describe("buildBuilderSystemSegments", () => {
  const PROVIDERS: ProviderKind[] = ["anthropic", "openai", "xai"];

  it("puts exactly one cache breakpoint, on the LAST segment, for every provider kind", () => {
    for (const provider of PROVIDERS) {
      const segments = buildBuilderSystemSegments({ provider, mode: "standard" });
      expect(segments.length).toBeGreaterThan(0);
      const breakpoints = segments.filter((s) => s.cacheBreakpoint);
      expect(breakpoints).toHaveLength(1);
      expect(segments[segments.length - 1]?.cacheBreakpoint).toBe(true);
    }
  });

  // The task brief for this suite assumed "2 segments for every provider
  // kind." That does NOT hold: buildBuilderSystemSegments reuses the shared
  // style wrappers unchanged (style-claude/style-grok are 2-segment builders,
  // but style-openai — reused verbatim from the main agent's prompt layer —
  // always emits 4: an agent-contract segment, the domain body, an
  // output-contract segment, then the cached few-shot). Pinning the REAL
  // per-provider counts here so a future style change is caught rather than
  // silently asserted away.
  it("anthropic and xai are 2 segments; openai (shared style-openai wrapper) is 4", () => {
    expect(
      buildBuilderSystemSegments({ provider: "anthropic", mode: "standard" }),
    ).toHaveLength(2);
    expect(
      buildBuilderSystemSegments({ provider: "xai", mode: "standard" }),
    ).toHaveLength(2);
    expect(
      buildBuilderSystemSegments({ provider: "openai", mode: "standard" }),
    ).toHaveLength(4);
  });
});
