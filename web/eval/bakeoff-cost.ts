/**
 * Cached-aware turn cost + stratified bake-off summary.
 *
 * Oak's admin estimator (`estimateCostUsd`) bills the full `inputTokens` at the
 * uncached input rate and adds thinking on top of output. xAI's Responses usage
 * reports cached tokens as a subset of input, and reasoning tokens as a subset
 * of output. This helper prices the way the invoice does for Grok:
 *   uncached input × input rate
 *   + cached input × cached rate
 *   + output (includes thinking) × output rate
 */

import { MODEL_PRICING } from "@/server/admin/pricing";

import type { JudgeResult, RubricDimension, TurnUsage } from "./judge";

/** xAI cached-input list prices ($ / 1M), <200k prompt tier. */
const CACHED_INPUT_PER_1M: Record<string, number> = {
  "grok-4.6": 0.5,
  "grok-4.5": 0.3,
  "grok-4.3": 0.2,
};

export const RUBRIC_DIMENSIONS: RubricDimension[] = [
  "answer_correctness",
  "inference_flagging",
  "mechanics_precision",
  "scope_adherence",
  "transparency",
];

/** Product-shaped buckets for the 4.3 vs 4.6 quality-to-cost report. */
export const CASE_STRATUM: Record<string, string> = {
  G2: "lookup",
  G9: "lookup",
  G10: "lookup",
  G11: "lookup",
  G12: "lookup",
  G13: "lookup",
  G14: "lookup",
  G17: "lookup",
  G18: "lookup",
  G1: "filter",
  G5: "filter",
  G6: "filter",
  G7: "filter",
  G8: "filter",
  G15: "battle-math",
  G16: "battle-math",
  G4: "mechanics",
  G25: "mechanics",
  G3: "resolution",
  G19: "follow-up",
  G20: "policy",
  G21: "policy",
  G22: "policy",
  G23: "policy",
  G24: "policy",
  G31: "policy",
  G35: "policy",
  G38: "policy",
  G39: "policy",
  G40: "policy",
  G41: "policy",
  G43: "policy",
  G46: "policy",
  G48: "policy",
  G49: "policy",
  G50: "policy",
  G51: "policy",
  G52: "policy",
  G26: "sql",
  G28: "sql",
  G32: "sql",
  G44: "sql",
  G47: "sql",
  G56: "sql",
  G57: "sql",
  G58: "sql",
  G60: "sql",
  G27: "wiki",
  G29: "wiki",
  G30: "wiki",
  G33: "wiki",
  G34: "wiki",
  G36: "wiki",
  G42: "wiki",
  G45: "wiki",
  G53: "wiki",
  G54: "wiki",
  G37: "champions",
  G55: "champions",
  G59: "forms",
  G61: "team-from-box",
};

const DAILY_STRATA = new Set([
  "lookup",
  "filter",
  "policy",
  "resolution",
  "follow-up",
]);

export function stratumFor(caseId: string): string {
  return CASE_STRATUM[caseId] ?? "other";
}

export function isDailyStratum(stratum: string): boolean {
  return DAILY_STRATA.has(stratum);
}

export function estimateTurnCostUsd(
  model: string,
  usage: TurnUsage,
): number {
  const price = MODEL_PRICING[model as keyof typeof MODEL_PRICING];
  if (!price) return 0;

  const input = finite(usage.inputTokens);
  const cached = Math.min(finite(usage.cachedInputTokens), input);
  const uncached = Math.max(0, input - cached);
  const output = finite(usage.outputTokens);
  const cachedRate = CACHED_INPUT_PER_1M[model] ?? price.inputPer1M;

  return (
    (uncached / 1_000_000) * price.inputPer1M +
    (cached / 1_000_000) * cachedRate +
    (output / 1_000_000) * price.outputPer1M
  );
}

export interface BakeoffRunFile {
  mode?: string;
  db?: string;
  repeat?: number;
  model: string;
  results: JudgeResult[];
}

export interface CaseSummary {
  caseId: string;
  stratum: string;
  daily: boolean;
  runs: number;
  passRate: number;
  overallPass: boolean;
  meanCorrectness: number;
  meanRubric: number;
  structuralFailRate: number;
  meanToolCalls: number;
  meanLatencyMs: number;
  meanUsd: number;
  totalUsd: number;
  usage: TurnUsage;
}

export interface ModelSummary {
  model: string;
  cases: number;
  runs: number;
  passRate: number;
  meanCorrectness: number;
  meanRubric: Record<RubricDimension, number>;
  totalUsd: number;
  usdPerRun: number;
  usdPerPassingRun: number;
  meanToolCalls: number;
  meanLatencyMs: number;
  usage: TurnUsage;
  byStratum: Record<string, { cases: number; passRate: number; usd: number }>;
  dailyPassRate: number;
  hardPassRate: number;
}

export function summarizeCase(
  model: string,
  caseId: string,
  runs: JudgeResult[],
): CaseSummary {
  const n = runs.length;
  const passes = runs.filter((r) => r.overallPass).length;
  const stratum = stratumFor(caseId);
  const usage = runs.reduce<TurnUsage>(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.usage.inputTokens,
      outputTokens: acc.outputTokens + r.usage.outputTokens,
      thinkingTokens: acc.thinkingTokens + r.usage.thinkingTokens,
      cachedInputTokens: acc.cachedInputTokens + r.usage.cachedInputTokens,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cachedInputTokens: 0,
    },
  );
  const totalUsd = runs.reduce(
    (acc, r) => acc + estimateTurnCostUsd(model, r.usage),
    0,
  );
  const correctness =
    runs.reduce(
      (acc, r) =>
        acc +
        (r.scores.find((s) => s.dimension === "answer_correctness")?.score ??
          0),
      0,
    ) / n;
  const meanRubric =
    runs.reduce((acc, r) => {
      const avg =
        r.scores.reduce((sAcc, s) => sAcc + s.score, 0) /
        Math.max(1, r.scores.length);
      return acc + avg;
    }, 0) / n;

  return {
    caseId,
    stratum,
    daily: isDailyStratum(stratum),
    runs: n,
    passRate: passes / n,
    overallPass: passes === n,
    meanCorrectness: correctness,
    meanRubric,
    structuralFailRate:
      runs.filter((r) => r.structuralFailures.length > 0).length / n,
    meanToolCalls: runs.reduce((a, r) => a + r.toolCalls.length, 0) / n,
    meanLatencyMs: runs.reduce((a, r) => a + r.agentLatencyMs, 0) / n,
    meanUsd: totalUsd / n,
    totalUsd,
    usage,
  };
}

export function summarizeModel(file: BakeoffRunFile): ModelSummary {
  const byCase = groupByCase(file.results);
  const caseSummaries = [...byCase.entries()].map(([id, runs]) =>
    summarizeCase(file.model, id, runs),
  );
  const runs = file.results;
  const n = runs.length || 1;
  const passing = runs.filter((r) => r.overallPass).length;
  const totalUsd = runs.reduce(
    (acc, r) => acc + estimateTurnCostUsd(file.model, r.usage),
    0,
  );
  const usage = runs.reduce<TurnUsage>(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.usage.inputTokens,
      outputTokens: acc.outputTokens + r.usage.outputTokens,
      thinkingTokens: acc.thinkingTokens + r.usage.thinkingTokens,
      cachedInputTokens: acc.cachedInputTokens + r.usage.cachedInputTokens,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cachedInputTokens: 0,
    },
  );

  const meanRubric = Object.fromEntries(
    RUBRIC_DIMENSIONS.map((dim) => {
      const avg =
        runs.reduce(
          (acc, r) =>
            acc + (r.scores.find((s) => s.dimension === dim)?.score ?? 0),
          0,
        ) / n;
      return [dim, avg];
    }),
  ) as Record<RubricDimension, number>;

  const byStratum: ModelSummary["byStratum"] = {};
  for (const c of caseSummaries) {
    const slot = (byStratum[c.stratum] ??= {
      cases: 0,
      passRate: 0,
      usd: 0,
    });
    slot.cases += 1;
    slot.passRate += c.passRate;
    slot.usd += c.totalUsd;
  }
  for (const slot of Object.values(byStratum)) {
    slot.passRate = slot.passRate / slot.cases;
  }

  const daily = caseSummaries.filter((c) => c.daily);
  const hard = caseSummaries.filter((c) => !c.daily);

  return {
    model: file.model,
    cases: caseSummaries.length,
    runs: runs.length,
    passRate: passing / n,
    meanCorrectness: meanRubric.answer_correctness,
    meanRubric,
    totalUsd,
    usdPerRun: totalUsd / n,
    usdPerPassingRun: passing > 0 ? totalUsd / passing : totalUsd,
    meanToolCalls: runs.reduce((a, r) => a + r.toolCalls.length, 0) / n,
    meanLatencyMs: runs.reduce((a, r) => a + r.agentLatencyMs, 0) / n,
    usage,
    byStratum,
    dailyPassRate:
      daily.length > 0
        ? daily.reduce((a, c) => a + c.passRate, 0) / daily.length
        : 0,
    hardPassRate:
      hard.length > 0
        ? hard.reduce((a, c) => a + c.passRate, 0) / hard.length
        : 0,
  };
}

export function groupByCase(
  results: JudgeResult[],
): Map<string, JudgeResult[]> {
  const byCase = new Map<string, JudgeResult[]>();
  for (const r of results) {
    const arr = byCase.get(r.caseId);
    if (arr) arr.push(r);
    else byCase.set(r.caseId, [r]);
  }
  return byCase;
}

export function formatComparison(
  a: BakeoffRunFile,
  b: BakeoffRunFile,
): string {
  const sa = summarizeModel(a);
  const sb = summarizeModel(b);
  const aCases = new Map(
    [...groupByCase(a.results)].map(([id, runs]) => [
      id,
      summarizeCase(a.model, id, runs),
    ]),
  );
  const bCases = new Map(
    [...groupByCase(b.results)].map(([id, runs]) => [
      id,
      summarizeCase(b.model, id, runs),
    ]),
  );
  const ids = [...new Set([...aCases.keys(), ...bCases.keys()])].sort(
    (x, y) => caseNum(x) - caseNum(y),
  );

  const lines: string[] = [];
  lines.push(`# Oak bake-off  ${a.model}  vs  ${b.model}`);
  lines.push("");
  lines.push("## Headline");
  lines.push(headlineTable(sa, sb));
  lines.push("");
  lines.push("## By stratum");
  const strata = [
    ...new Set([
      ...Object.keys(sa.byStratum),
      ...Object.keys(sb.byStratum),
    ]),
  ].sort();
  lines.push(
    [
      "stratum",
      `${a.model} pass`,
      `${b.model} pass`,
      `${a.model} $`,
      `${b.model} $`,
    ].join(" | "),
  );
  lines.push(["---", "---", "---", "---", "---"].join(" | "));
  for (const s of strata) {
    const left = sa.byStratum[s];
    const right = sb.byStratum[s];
    lines.push(
      [
        s,
        left ? pct(left.passRate) : "—",
        right ? pct(right.passRate) : "—",
        left ? usd(left.usd) : "—",
        right ? usd(right.usd) : "—",
      ].join(" | "),
    );
  }
  lines.push("");
  lines.push("## Disagreements (pass / correctness)");
  let disagreed = 0;
  for (const id of ids) {
    const ca = aCases.get(id);
    const cb = bCases.get(id);
    if (!ca || !cb) continue;
    const passDiff = ca.overallPass !== cb.overallPass;
    const qualityDiff = Math.abs(ca.meanCorrectness - cb.meanCorrectness) >= 0.5;
    if (!passDiff && !qualityDiff) continue;
    disagreed += 1;
    lines.push(
      `- ${id} [${ca.stratum}]  ${a.model}: pass=${pct(ca.passRate)} corr=${ca.meanCorrectness.toFixed(2)} $${ca.meanUsd.toFixed(4)} tools=${ca.meanToolCalls.toFixed(1)}  |  ${b.model}: pass=${pct(cb.passRate)} corr=${cb.meanCorrectness.toFixed(2)} $${cb.meanUsd.toFixed(4)} tools=${cb.meanToolCalls.toFixed(1)}`,
    );
  }
  if (disagreed === 0) lines.push("- none");
  lines.push("");
  lines.push("## Per-case");
  lines.push(
    [
      "case",
      "stratum",
      `${a.model} pass`,
      `${b.model} pass`,
      `${a.model} corr`,
      `${b.model} corr`,
      `${a.model} $`,
      `${b.model} $`,
      `${a.model} tools`,
      `${b.model} tools`,
      `${a.model} ms`,
      `${b.model} ms`,
    ].join(" | "),
  );
  lines.push(Array(12).fill("---").join(" | "));
  for (const id of ids) {
    const ca = aCases.get(id);
    const cb = bCases.get(id);
    lines.push(
      [
        id,
        ca?.stratum ?? cb?.stratum ?? "other",
        ca ? pct(ca.passRate) : "—",
        cb ? pct(cb.passRate) : "—",
        ca ? ca.meanCorrectness.toFixed(2) : "—",
        cb ? cb.meanCorrectness.toFixed(2) : "—",
        ca ? usd(ca.meanUsd) : "—",
        cb ? usd(cb.meanUsd) : "—",
        ca ? ca.meanToolCalls.toFixed(1) : "—",
        cb ? cb.meanToolCalls.toFixed(1) : "—",
        ca ? String(Math.round(ca.meanLatencyMs)) : "—",
        cb ? String(Math.round(cb.meanLatencyMs)) : "—",
      ].join(" | "),
    );
  }
  return lines.join("\n");
}

function headlineTable(a: ModelSummary, b: ModelSummary): string {
  const rows: [string, string, string][] = [
    ["cases / runs", `${a.cases} / ${a.runs}`, `${b.cases} / ${b.runs}`],
    ["pass rate", pct(a.passRate), pct(b.passRate)],
    ["daily pass rate", pct(a.dailyPassRate), pct(b.dailyPassRate)],
    ["hard pass rate", pct(a.hardPassRate), pct(b.hardPassRate)],
    ["mean correctness", a.meanCorrectness.toFixed(2), b.meanCorrectness.toFixed(2)],
    [
      "mean inference",
      a.meanRubric.inference_flagging.toFixed(2),
      b.meanRubric.inference_flagging.toFixed(2),
    ],
    [
      "mean mechanics",
      a.meanRubric.mechanics_precision.toFixed(2),
      b.meanRubric.mechanics_precision.toFixed(2),
    ],
    [
      "mean scope",
      a.meanRubric.scope_adherence.toFixed(2),
      b.meanRubric.scope_adherence.toFixed(2),
    ],
    [
      "mean transparency",
      a.meanRubric.transparency.toFixed(2),
      b.meanRubric.transparency.toFixed(2),
    ],
    ["total agent $", usd(a.totalUsd), usd(b.totalUsd)],
    ["$ / run", usd(a.usdPerRun), usd(b.usdPerRun)],
    ["$ / passing run", usd(a.usdPerPassingRun), usd(b.usdPerPassingRun)],
    ["mean tool calls", a.meanToolCalls.toFixed(2), b.meanToolCalls.toFixed(2)],
    ["mean latency", `${Math.round(a.meanLatencyMs)}ms`, `${Math.round(b.meanLatencyMs)}ms`],
    [
      "cached tokens",
      String(a.usage.cachedInputTokens),
      String(b.usage.cachedInputTokens),
    ],
    [
      "output tokens",
      String(a.usage.outputTokens),
      String(b.usage.outputTokens),
    ],
  ];
  const lines = [
    `metric | ${a.model} | ${b.model} | Δ (${b.model} − ${a.model})`,
    "--- | --- | --- | ---",
  ];
  for (const [label, left, right] of rows) {
    lines.push(`${label} | ${left} | ${right} | ${delta(left, right)}`);
  }
  return lines.join("\n");
}

function delta(left: string, right: string): string {
  const ln = Number(left.replace(/[%$ms,]/g, ""));
  const rn = Number(right.replace(/[%$ms,]/g, ""));
  if (!Number.isFinite(ln) || !Number.isFinite(rn)) return "—";
  const d = rn - ln;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(4).replace(/\.?0+$/, "")}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function caseNum(id: string): number {
  const n = Number.parseInt(id.replace(/^G/i, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function finite(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}
