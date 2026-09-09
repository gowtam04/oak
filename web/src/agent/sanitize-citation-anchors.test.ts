/**
 * Unit tests for sanitizeCitationAnchors (P1 citation contract).
 *
 * Production module `./sanitize-citation-anchors` is not required to exist
 * yet — a failed resolve is the intended red.
 *
 * Requirement refs: CIT-US-2, CIT-AC-2.1, CIT-AC-2.2, CIT-BR-3, VOICE-AC-1.2.
 *
 * Architecture (`api-design.md` + ADR-2):
 *   sanitizeCitationAnchors(answer: unknown): unknown
 *   - Drop citations[i].anchor if target ∉ answer_span|fact_row.
 *   - Drop if id is missing, not a string, or fails
 *     /^[A-Za-z0-9_.:#-]{1,64}$/.
 *   - Leave source / detail / endpoint_url intact.
 *   - Run before oakAnswerSchema.safeParse (a bad anchor can NEVER fail
 *     submit_answer — CIT-BR-3).
 *   - Strip model-emitted `origin` (server-owned, like saved_team).
 */

import { describe, expect, it } from "vitest";

import { oakAnswerSchema, type OakAnswer } from "@/agent/schemas";

import { sanitizeCitationAnchors } from "./sanitize-citation-anchors";

/** Minimal valid OakAnswer — same surface as schemas.test.ts BASE_ANSWER. */
const BASE_ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "Bottom line.",
  reasoning_markdown: "Because.",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

/** Fields the current citation contract already accepts (source + detail). */
const CITATION = {
  source: "pokemon/garchomp",
  detail: "base Speed 102",
};

const CITATION_WITH_URL = {
  ...CITATION,
  endpoint_url: "https://oak.example/pokedex/garchomp",
};

type CitationOut = {
  source?: string;
  detail?: string;
  endpoint_url?: string;
  anchor?: { target?: string; id?: string };
};

type AnswerOut = {
  citations?: CitationOut[];
  origin?: unknown;
};

function asAnswer(value: unknown): AnswerOut {
  return value as AnswerOut;
}

describe("sanitizeCitationAnchors — legal answers (CIT-US-2, CIT-AC-2.1)", () => {
  it("leaves a legal OakAnswer with no anchors unchanged and still valid", () => {
    const input = {
      ...BASE_ANSWER,
      citations: [{ source: CITATION.source, detail: CITATION.detail }],
    };
    const out = sanitizeCitationAnchors(input);
    expect(out).toEqual(input);
    expect(oakAnswerSchema.safeParse(out).success).toBe(true);
  });

  it("keeps a valid { target: \"answer_span\", id: \"c0\" } (CIT-US-2)", () => {
    const input = {
      ...BASE_ANSWER,
      citations: [
        {
          ...CITATION,
          anchor: { target: "answer_span", id: "c0" },
        },
      ],
    };
    const out = asAnswer(sanitizeCitationAnchors(input));
    expect(out.citations?.[0]?.anchor).toEqual({
      target: "answer_span",
      id: "c0",
    });
    expect(out.citations?.[0]?.source).toBe(CITATION.source);
    expect(out.citations?.[0]?.detail).toBe(CITATION.detail);
    expect(oakAnswerSchema.safeParse(sanitizeCitationAnchors(input)).success).toBe(
      true,
    );
  });

  it("leaves source / detail / endpoint_url intact when dropping a bad anchor", () => {
    const input = {
      ...BASE_ANSWER,
      citations: [
        {
          ...CITATION_WITH_URL,
          anchor: { target: "nope", id: "c0" },
        },
      ],
    };
    const out = asAnswer(sanitizeCitationAnchors(input));
    expect(out.citations?.[0]?.source).toBe(CITATION_WITH_URL.source);
    expect(out.citations?.[0]?.detail).toBe(CITATION_WITH_URL.detail);
    expect(out.citations?.[0]?.endpoint_url).toBe(CITATION_WITH_URL.endpoint_url);
    expect(out.citations?.[0]?.anchor).toBeUndefined();
  });

  it("keeps a valid { target: \"fact_row\", id: \"Garchomp\" } (CIT-US-2)", () => {
    const input = {
      ...BASE_ANSWER,
      citations: [
        {
          ...CITATION,
          anchor: { target: "fact_row", id: "Garchomp" },
        },
      ],
    };
    const out = asAnswer(sanitizeCitationAnchors(input));
    expect(out.citations?.[0]?.anchor).toEqual({
      target: "fact_row",
      id: "Garchomp",
    });
    expect(oakAnswerSchema.safeParse(sanitizeCitationAnchors(input)).success).toBe(
      true,
    );
  });

  it("keeps every legal id character class and the 1–64 length bounds", () => {
    const ids = ["a", "c0", "row.name", "span:c0", "id#1", "a-b_c", "A".repeat(64)];
    for (const id of ids) {
      const input = {
        ...BASE_ANSWER,
        citations: [{ ...CITATION, anchor: { target: "answer_span", id } }],
      };
      const out = asAnswer(sanitizeCitationAnchors(input));
      expect(out.citations?.[0]?.anchor).toEqual({
        target: "answer_span",
        id,
      });
    }
  });
});

describe("sanitizeCitationAnchors — drop invalid anchors (CIT-BR-3)", () => {
  function expectAnchorDropped(anchor: unknown): void {
    const citation = { ...CITATION, anchor };
    const input = { ...BASE_ANSWER, citations: [citation] };
    const out = asAnswer(sanitizeCitationAnchors(input));
    expect(out.citations).toHaveLength(1);
    expect(out.citations?.[0]?.anchor).toBeUndefined();
    expect(out.citations?.[0]?.source).toBe(CITATION.source);
    expect(out.citations?.[0]?.detail).toBe(CITATION.detail);
    // A bad anchor can NEVER fail submit_answer (CIT-BR-3).
    expect(oakAnswerSchema.safeParse(sanitizeCitationAnchors(input)).success).toBe(
      true,
    );
  }

  it("drops anchor when target is not answer_span|fact_row", () => {
    expectAnchorDropped({ target: "sentence", id: "c0" });
    expectAnchorDropped({ target: "answer-span", id: "c0" });
    expectAnchorDropped({ target: "ANSWER_SPAN", id: "c0" });
    expectAnchorDropped({ target: "", id: "c0" });
    expectAnchorDropped({ target: 1, id: "c0" });
  });

  it("drops anchor when target is missing", () => {
    expectAnchorDropped({ id: "c0" });
  });

  it("drops anchor when id is missing, not a string, or fails the allowlist", () => {
    expectAnchorDropped({ target: "answer_span" });
    expectAnchorDropped({ target: "answer_span", id: "" });
    expectAnchorDropped({ target: "answer_span", id: 123 });
    expectAnchorDropped({ target: "answer_span", id: null });
    expectAnchorDropped({ target: "answer_span", id: { nested: "c0" } });
    expectAnchorDropped({ target: "answer_span", id: "has space" });
    expectAnchorDropped({ target: "answer_span", id: "foo/bar" });
    expectAnchorDropped({ target: "answer_span", id: "hello!" });
    expectAnchorDropped({ target: "answer_span", id: "A".repeat(65) });
  });

  it("drops an extra-keyed / malformed anchor object (ADR-2)", () => {
    expectAnchorDropped({
      target: "answer_span",
      id: "c0",
      extra: true,
    });
  });

  it("strips only the bad citation's anchor and leaves a sibling valid (CIT-AC-2.1)", () => {
    const input = {
      ...BASE_ANSWER,
      citations: [
        { ...CITATION, anchor: { target: "answer_span", id: "c0" } },
        { ...CITATION, source: "move/earthquake", anchor: { target: "nope", id: "x" } },
      ],
    };
    const out = asAnswer(sanitizeCitationAnchors(input));
    expect(out.citations?.[0]?.anchor).toEqual({
      target: "answer_span",
      id: "c0",
    });
    expect(out.citations?.[1]?.anchor).toBeUndefined();
    expect(out.citations?.[1]?.source).toBe("move/earthquake");
    expect(oakAnswerSchema.safeParse(sanitizeCitationAnchors(input)).success).toBe(
      true,
    );
  });
});

describe("sanitizeCitationAnchors — origin is server-owned (VOICE-AC-1.2)", () => {
  it("strips a model-emitted origin: \"voice\" on a normal chat answer", () => {
    const input = { ...BASE_ANSWER, origin: "voice" };
    const out = asAnswer(sanitizeCitationAnchors(input));
    expect(out.origin).toBeUndefined();
    expect(oakAnswerSchema.safeParse(sanitizeCitationAnchors(input)).success).toBe(
      true,
    );
  });

  it("strips any model-emitted origin value (not only \"voice\")", () => {
    const input = { ...BASE_ANSWER, origin: "chat" };
    const out = asAnswer(sanitizeCitationAnchors(input));
    expect(out.origin).toBeUndefined();
    expect(oakAnswerSchema.safeParse(sanitizeCitationAnchors(input)).success).toBe(
      true,
    );
  });
});

describe("sanitizeCitationAnchors — historical answers (CIT-AC-2.2)", () => {
  it("parses a stored answer that never had citation.anchor", () => {
    const historical = {
      ...BASE_ANSWER,
      citations: [{ source: CITATION.source, detail: CITATION.detail }],
    };
    expect(oakAnswerSchema.safeParse(historical).success).toBe(true);
    const out = sanitizeCitationAnchors(historical);
    expect(asAnswer(out).citations?.[0]?.anchor).toBeUndefined();
    expect(oakAnswerSchema.safeParse(out).success).toBe(true);
  });
});
