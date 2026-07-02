/**
 * PARITY guard — the semantic-drift tripwire the build gate enforces.
 *
 * The two prompt bodies (`./domain` for Claude/OpenAI, `./domain-grok` for the
 * default Grok model) carry the SAME Pokémon domain facts in two different prompt
 * structures. For the generation-scope feature the per-gen facts live in ONE
 * place — `MAINLINE_GEN_INFO` (`./gen-info`) — and BOTH bodies template from it,
 * so parity holds by construction. This test pins that: for every mainline scope,
 * the assembled system body + few-shot of EACH model contains that scope's
 * `label` and `basisTag`. If either author edits one body and forgets the other —
 * or hardcodes a generation string instead of sourcing it from `gen-info` — a
 * scope's fact will be missing from one body and this test fails.
 *
 * It also pins the cross-module invariant the gen-info table depends on:
 * `MAINLINE_GEN_INFO[mode].basisTag` MUST equal
 * `basisForFormat(formatForMode(mode))`, keeping the prompt's basis tag in
 * lock-step with `formats.ts` (the value the runtime's synthesized fallbacks use).
 *
 * `style.test.ts` + `domain-grok.test.ts` pin each body's STRUCTURE; this file
 * pins the SEMANTIC parity between them across every gen scope.
 */

import { describe, expect, it } from "vitest";

import { domainForMode } from "@/agent/prompts/domain";
import { grokDomainForMode } from "@/agent/prompts/domain-grok";
import {
  MAINLINE_GEN_INFO,
  type MainlineMode,
} from "@/agent/prompts/gen-info";
import { basisForFormat, formatForMode } from "@/data/formats";

/**
 * Every mainline scope, derived from the fact table itself so a newly-supported
 * generation (e.g. a future gen-4 entry) is automatically parity-checked.
 */
const MAINLINE_MODES = Object.keys(MAINLINE_GEN_INFO) as MainlineMode[];

describe("prompt parity — the fact table backs every mainline scope", () => {
  it("covers exactly the expected mainline scopes (standard + gen-5…gen-8)", () => {
    // Pins the named GS-D1 set so removing/renaming a scope trips the gate.
    expect([...MAINLINE_MODES].sort()).toEqual([
      "gen-5",
      "gen-6",
      "gen-7",
      "gen-8",
      "standard",
    ]);
  });

  for (const mode of MAINLINE_MODES) {
    const info = MAINLINE_GEN_INFO[mode];

    it(`both bodies carry ${mode}'s label + basis tag (parity by construction)`, () => {
      const claude = domainForMode(mode);
      const grok = grokDomainForMode(mode);
      const claudeText = `${claude.systemPrompt}\n${claude.fewShot}`;
      const grokText = `${grok.systemPrompt}\n${grok.fewShot}`;

      // The Markdown (Claude/OpenAI) body.
      expect(claudeText).toContain(info.label);
      expect(claudeText).toContain(info.basisTag);
      // The Grok-native XML body — same facts, different structure.
      expect(grokText).toContain(info.label);
      expect(grokText).toContain(info.basisTag);
    });

    it(`${mode}'s basisTag stays in lock-step with formats.ts`, () => {
      // The gen-info INVARIANT: the prompt's basis tag == the format's basis tag.
      expect(info.basisTag).toBe(basisForFormat(formatForMode(mode)));
    });
  }
});

describe("prompt parity — a gen-7 build never leaks the Gen 9 label", () => {
  it("neither body emits 'Generation 9' when built for gen-7", () => {
    const claude = domainForMode("gen-7");
    const grok = grokDomainForMode("gen-7");
    const claudeText = `${claude.systemPrompt}\n${claude.fewShot}`;
    const grokText = `${grok.systemPrompt}\n${grok.fewShot}`;

    // "Generation 9" lives only in the `standard` gen-info entry; a gen-7 build
    // must not carry it in EITHER prompt structure.
    expect(claudeText).not.toContain("Generation 9");
    expect(grokText).not.toContain("Generation 9");
  });
});
