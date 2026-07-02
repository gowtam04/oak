/**
 * Tests for the Grok-NATIVE domain body (`./domain-grok`) — the default model's
 * prompt. Pins the XML-section structure, byte-stability (cache-prefix safety),
 * and the Champions-specific content, parallel to what `style.test.ts` does for
 * the assembled segments. The shared Markdown body is guarded by `prompts.test.ts`
 * (its orphan mirror) + `style.test.ts`; this file guards the forked Grok body so
 * a parity slip between the two prompts is caught.
 */

import { describe, expect, it } from "vitest";

import {
  GROK_CHAMPIONS_FEW_SHOT,
  GROK_CHAMPIONS_SYSTEM_PROMPT,
  grokDomainForMode,
} from "@/agent/prompts/domain-grok";
import { MAINLINE_GEN_INFO } from "@/agent/prompts/gen-info";
import { CHAMPIONS_REGULATION } from "@/data/formats";

// The standard Grok body became a per-scope BUILDER (`grokDomainForMode`); the
// old `GROK_STANDARD_*` consts are gone. Derive the "standard" (Gen 9) pair from
// the builder so the existing structure assertions still pin the default scope,
// and hold a gen-7 build alongside to prove the per-gen templating.
const grokStandard = grokDomainForMode("standard");
const GROK_STANDARD_SYSTEM_PROMPT = grokStandard.systemPrompt;
const GROK_STANDARD_FEW_SHOT = grokStandard.fewShot;
const grokGen7 = grokDomainForMode("gen-7");

const STANDARD_SECTIONS = [
  "role",
  "task",
  "constraints",
  "data_rules",
  "tools",
  "tool_routing",
  "reasoning",
  "type_effectiveness",
  "doubles",
  "conversation",
  "teams",
  "image_input",
  "clarify",
  "scope",
  "output_contract",
  "output_format",
  "stop_condition",
];

function noEdgeWhitespace(s: string): void {
  expect(s).toBe(s.trim());
}

describe("Grok standard system prompt — XML-sectioned native body", () => {
  it("opens on <role> with the Oak identity and is whitespace-clean + sizable", () => {
    expect(GROK_STANDARD_SYSTEM_PROMPT.startsWith("<role>")).toBe(true);
    expect(GROK_STANDARD_SYSTEM_PROMPT).toContain("You are Oak");
    noEdgeWhitespace(GROK_STANDARD_SYSTEM_PROMPT);
    expect(GROK_STANDARD_SYSTEM_PROMPT.length).toBeGreaterThan(2000);
  });

  it("carries every section as a balanced <tag>…</tag> pair", () => {
    for (const tag of STANDARD_SECTIONS) {
      expect(GROK_STANDARD_SYSTEM_PROMPT).toContain(`<${tag}>`);
      expect(GROK_STANDARD_SYSTEM_PROMPT).toContain(`</${tag}>`);
    }
  });

  it("front-loads the brittle structured-output rules", () => {
    expect(GROK_STANDARD_SYSTEM_PROMPT).toContain("truncated:false");
    expect(GROK_STANDARD_SYSTEM_PROMPT).toContain("national_dex_number");
    expect(GROK_STANDARD_SYSTEM_PROMPT).toContain("subjects[]");
  });

  it("does not carry the old wrapper-era tags", () => {
    expect(GROK_STANDARD_SYSTEM_PROMPT).not.toContain("<playbook>");
    expect(GROK_STANDARD_SYSTEM_PROMPT).not.toContain("<grok_directives>");
  });
});

describe("Grok standard few-shot — <examples> block", () => {
  it("is one <examples> block and is whitespace-clean", () => {
    expect(GROK_STANDARD_FEW_SHOT.startsWith("<examples>")).toBe(true);
    expect(GROK_STANDARD_FEW_SHOT.trimEnd().endsWith("</examples>")).toBe(true);
    noEdgeWhitespace(GROK_STANDARD_FEW_SHOT);
  });

  it("has the ten worked examples A–J, each ending in a submit_answer call", () => {
    const exampleOpens = GROK_STANDARD_FEW_SHOT.match(/<example name="/g) ?? [];
    expect(exampleOpens).toHaveLength(10);
    for (const id of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]) {
      expect(GROK_STANDARD_FEW_SHOT).toContain(`<example name="${id} —`);
    }
    const submits = GROK_STANDARD_FEW_SHOT.match(/→ submit_answer\(\{/g) ?? [];
    expect(submits.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Grok standard body — per-scope generation facts (gen-7)", () => {
  it("keeps every XML section when built for a gen scope", () => {
    for (const tag of STANDARD_SECTIONS) {
      expect(grokGen7.systemPrompt).toContain(`<${tag}>`);
      expect(grokGen7.systemPrompt).toContain(`</${tag}>`);
    }
  });

  it("carries the gen-7 label + basis tag and drops 'Generation 9'", () => {
    const text = grokGen7.systemPrompt + grokGen7.fewShot;
    expect(text).toContain(MAINLINE_GEN_INFO["gen-7"].label);
    expect(text).toContain(MAINLINE_GEN_INFO["gen-7"].basisTag);
    // The gen-9-only label/mechanics text must not leak into a gen-7 build.
    expect(text).not.toContain("Generation 9");
  });

  it("the standard (default) body carries the Gen 9 label + basis tag", () => {
    const text = GROK_STANDARD_SYSTEM_PROMPT + GROK_STANDARD_FEW_SHOT;
    expect(text).toContain(MAINLINE_GEN_INFO.standard.label);
    expect(text).toContain(MAINLINE_GEN_INFO.standard.basisTag);
  });
});

describe("Grok Champions body — XML-sectioned, Champions-correct", () => {
  it("adds the Champions scope + mechanics sections and the regulation string", () => {
    expect(GROK_CHAMPIONS_SYSTEM_PROMPT.startsWith("<role>")).toBe(true);
    expect(GROK_CHAMPIONS_SYSTEM_PROMPT).toContain("<champions_scope>");
    expect(GROK_CHAMPIONS_SYSTEM_PROMPT).toContain("</champions_scope>");
    expect(GROK_CHAMPIONS_SYSTEM_PROMPT).toContain("<champions_mechanics>");
    expect(GROK_CHAMPIONS_SYSTEM_PROMPT).toContain("</champions_mechanics>");
    expect(GROK_CHAMPIONS_SYSTEM_PROMPT).toContain(CHAMPIONS_REGULATION);
    noEdgeWhitespace(GROK_CHAMPIONS_SYSTEM_PROMPT);
  });

  it("uses Stat Points and forbids Terastallization", () => {
    expect(GROK_CHAMPIONS_SYSTEM_PROMPT).toContain("Stat Points");
    expect(GROK_CHAMPIONS_SYSTEM_PROMPT).toContain("NO Terastallization");
    // No EV-budget language leaks in from the standard body.
    expect(GROK_CHAMPIONS_SYSTEM_PROMPT).not.toContain("252 per stat");
  });

  it("few-shot is scoped to Champions with the champions generation_basis", () => {
    expect(GROK_CHAMPIONS_FEW_SHOT.startsWith("<examples>")).toBe(true);
    expect(GROK_CHAMPIONS_FEW_SHOT).toContain('generation: "champions"');
    expect(GROK_CHAMPIONS_FEW_SHOT).toContain(CHAMPIONS_REGULATION);
    const exampleOpens = GROK_CHAMPIONS_FEW_SHOT.match(/<example name="/g) ?? [];
    expect(exampleOpens).toHaveLength(8);
  });
});

describe("grokDomainForMode — mode selection", () => {
  it("returns the standard Grok pair for standard mode", () => {
    expect(grokDomainForMode("standard")).toEqual({
      systemPrompt: GROK_STANDARD_SYSTEM_PROMPT,
      fewShot: GROK_STANDARD_FEW_SHOT,
    });
  });

  it("returns a distinct, gen-specific Grok pair for a gen scope", () => {
    const g7 = grokDomainForMode("gen-7");
    expect(g7.systemPrompt).toContain(MAINLINE_GEN_INFO["gen-7"].label);
    // The gen scope is NOT just the standard body — the generation facts differ.
    expect(g7.systemPrompt).not.toBe(GROK_STANDARD_SYSTEM_PROMPT);
  });

  it("returns the Champions Grok pair for champions mode", () => {
    expect(grokDomainForMode("champions")).toEqual({
      systemPrompt: GROK_CHAMPIONS_SYSTEM_PROMPT,
      fewShot: GROK_CHAMPIONS_FEW_SHOT,
    });
  });
});
