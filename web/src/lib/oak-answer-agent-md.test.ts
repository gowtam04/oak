import { describe, expect, it } from "vitest";
import { oakAnswerToAgentMarkdown } from "./oak-answer-agent-md";
import type { OakAnswer } from "@/agent/schemas";

const BASE: OakAnswer = {
  status: "answered",
  answer_markdown: "Garchomp is a Dragon/Ground pseudo-legendary.",
  reasoning_markdown: "Looked up Garchomp base stats and typing.",
  citations: [
    {
      source: "pokemon/garchomp",
      detail: "base speed: 102",
      endpoint_url: "https://example.test/garchomp",
    },
  ],
  inferences: [
    {
      claim: "Outspeeds most Ground threats.",
      confidence: "high",
      note: "Base 102 Speed.",
    },
  ],
  generation_basis: {
    generation: "gen-9",
    fallback: false,
  },
  subjects: [
    {
      name: "Garchomp",
      dex_number: 445,
      sprite_url: "https://example.test/garchomp.png",
      types: ["dragon", "ground"],
      is_fallback: false,
    },
  ],
  uncertainty_flags: ["Competitive usage may shift monthly."],
};

describe("oakAnswerToAgentMarkdown", () => {
  it("includes status, scope, answer, subjects, inferences, citations, flags", () => {
    const md = oakAnswerToAgentMarkdown(BASE);
    expect(md).toContain("# Oak answer");
    expect(md).toContain("**Status:** answered");
    expect(md).toContain("**Scope / basis:** gen-9");
    expect(md).toContain("## Answer");
    expect(md).toContain("Garchomp is a Dragon/Ground");
    expect(md).toContain("## Subjects");
    expect(md).toContain("**Garchomp** #445 — dragon/ground");
    expect(md).toContain("## Inferences");
    expect(md).toContain("[high]");
    expect(md).toContain("## Citations");
    expect(md).toContain("`pokemon/garchomp`");
    expect(md).toContain("https://example.test/garchomp");
    expect(md).toContain("## Uncertainty flags");
    expect(md).toContain("Competitive usage may shift monthly.");
    expect(md).toContain("## Reasoning");
    expect(md).toContain("Looked up Garchomp");
  });

  it("marks fallback scope and subject fallback", () => {
    const md = oakAnswerToAgentMarkdown({
      ...BASE,
      generation_basis: {
        generation: "gen-1",
        fallback: true,
        note: "Not in Scarlet/Violet roster.",
      },
      subjects: [
        {
          name: "Mewtwo",
          dex_number: 150,
          sprite_url: "https://example.test/mewtwo.png",
          types: ["psychic"],
          is_fallback: true,
          source_generation: "gen-1",
        },
      ],
    });
    expect(md).toContain("gen-1 · fallback");
    expect(md).toContain("**Basis note:** Not in Scarlet/Violet roster.");
    expect(md).toContain("_(fallback: gen-1)_");
  });

  it("omits empty optional sections", () => {
    const md = oakAnswerToAgentMarkdown({
      status: "insufficient_data",
      answer_markdown: "Not enough data.",
      reasoning_markdown: "",
      citations: [],
      inferences: [],
      generation_basis: { generation: "national-dex", fallback: false },
    });
    expect(md).not.toContain("## Subjects");
    expect(md).not.toContain("## Inferences");
    expect(md).not.toContain("## Citations");
    expect(md).not.toContain("## Uncertainty flags");
    expect(md).not.toContain("## Reasoning");
    expect(md).toContain("**Status:** insufficient_data");
  });

  it("strips citation-span comments from the answer body", () => {
    const md = oakAnswerToAgentMarkdown({
      ...BASE,
      answer_markdown:
        "<!-- span:c0 -->Garchomp is a Dragon/Ground pseudo-legendary.<!-- /span:c0 -->",
    });
    expect(md).toContain("Garchomp is a Dragon/Ground pseudo-legendary.");
    expect(md).not.toContain("<!--");
    expect(md).not.toContain("span:c0");
  });
});
