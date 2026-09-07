import { describe, expect, it } from "vitest";

import type { OakAnswer } from "@/agent/schemas";

import {
  estimateTurnCostUsd,
  formatComparison,
  isDailyStratum,
  stratumFor,
  summarizeModel,
  type BakeoffRunFile,
} from "./bakeoff-cost";
import type { JudgeResult, RubricDimension } from "./judge";

const DIMS: RubricDimension[] = [
  "answer_correctness",
  "inference_flagging",
  "mechanics_precision",
  "scope_adherence",
  "transparency",
];

function result(partial: {
  caseId: string;
  pass: boolean;
  correctness?: 0 | 1 | 2;
  usage?: JudgeResult["usage"];
  toolCalls?: string[];
}): JudgeResult {
  const correctness = partial.correctness ?? (partial.pass ? 2 : 0);
  return {
    caseId: partial.caseId,
    input: "q",
    answer: { status: "answered" } as OakAnswer,
    toolCalls: partial.toolCalls ?? ["query_pokedex"],
    structuralFailures: partial.pass ? [] : ["status"],
    scores: DIMS.map((dimension) => ({
      dimension,
      pass: dimension === "answer_correctness" ? correctness >= 1 : true,
      score: (dimension === "answer_correctness" ? correctness : 2) as 0 | 1 | 2,
      reason: "",
    })),
    overallPass: partial.pass,
    agentLatencyMs: 1000,
    judgeLatencyMs: 10,
    covers: [],
    usage: partial.usage ?? {
      inputTokens: 1000,
      outputTokens: 200,
      thinkingTokens: 80,
      cachedInputTokens: 800,
    },
  };
}

describe("estimateTurnCostUsd", () => {
  const usage = {
    inputTokens: 1000,
    outputTokens: 200,
    thinkingTokens: 80,
    cachedInputTokens: 800,
  };

  it("prices uncached input + cached input + output (thinking is inside output)", () => {
    // 200 uncached × $2 + 800 cached × $0.50 + 200 out × $6  per 1M
    expect(estimateTurnCostUsd("grok-4.6", usage)).toBeCloseTo(
      200 / 1e6 * 2 + 800 / 1e6 * 0.5 + 200 / 1e6 * 6,
      10,
    );
  });

  it("does not double-count thinking tokens", () => {
    const withThink = estimateTurnCostUsd("grok-4.6", usage);
    const noThink = estimateTurnCostUsd("grok-4.6", {
      ...usage,
      thinkingTokens: 0,
    });
    expect(withThink).toBe(noThink);
  });

  it("is cheaper on grok-4.3 at the same token mix", () => {
    const a = estimateTurnCostUsd("grok-4.6", usage);
    const b = estimateTurnCostUsd("grok-4.3", usage);
    expect(b).toBeLessThan(a);
    expect(b / a).toBeCloseTo(
      (200 * 1.25 + 800 * 0.2 + 200 * 2.5) / (200 * 2 + 800 * 0.5 + 200 * 6),
      8,
    );
  });
});

describe("stratumFor", () => {
  it("maps the production-incident SQL cases to sql", () => {
    expect(stratumFor("G58")).toBe("sql");
    expect(stratumFor("G60")).toBe("sql");
    expect(isDailyStratum("sql")).toBe(false);
  });

  it("treats lookups as daily work", () => {
    expect(stratumFor("G9")).toBe("lookup");
    expect(isDailyStratum("lookup")).toBe(true);
  });
});

describe("summarizeModel / formatComparison", () => {
  it("splits daily vs hard pass rates and reports a disagreement", () => {
    const left: BakeoffRunFile = {
      model: "grok-4.6",
      results: [
        result({ caseId: "G9", pass: true }),
        result({ caseId: "G58", pass: true, toolCalls: ["run_sql"] }),
      ],
    };
    const right: BakeoffRunFile = {
      model: "grok-4.3",
      results: [
        result({ caseId: "G9", pass: true }),
        result({
          caseId: "G58",
          pass: false,
          correctness: 0,
          toolCalls: ["run_sql", "run_sql"],
        }),
      ],
    };
    const sb = summarizeModel(right);
    expect(sb.dailyPassRate).toBe(1);
    expect(sb.hardPassRate).toBe(0);
    const report = formatComparison(left, right);
    expect(report).toContain("G58");
    expect(report).toContain("grok-4.6");
    expect(report).toContain("grok-4.3");
  });
});
