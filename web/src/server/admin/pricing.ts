/**
 * src/server/admin/pricing.ts — static, in-code per-model price table and the
 * cost ESTIMATOR for the admin panel's cost view.
 *
 * Design refs:
 *   - docs/features/admin-panel/architecture/design.md
 *       § Interface Definitions › pricing
 *       § Technical Decisions AD-6 (static in-code table, estimate-only)
 *   - requirements.md ADMIN-BR-5 (cost is an ESTIMATE).
 *
 * Why a code constant, not a DB/UI setting (AD-6 / ADMIN-BR-2): keeping pricing
 * here preserves the panel's read-only invariant — there is no editable cost
 * config. Provider billing stays authoritative; every cost the panel shows is
 * flagged `estimated: true` and an unknown/unpriced model contributes $0 (the
 * caller surfaces it as un-priced). Prices are updated by a code edit + deploy.
 *
 * NOTE: the per-1M-token prices below are reasonable PLACEHOLDERS for the three
 * models in the registry (src/agent/models.ts). They are list-style USD per 1M
 * tokens and should be reconciled against the providers' current public pricing
 * when accuracy matters; until then they yield order-of-magnitude estimates.
 * `thinkingPer1M` prices reasoning/thinking tokens (billed like output tokens on
 * all three providers today, hence equal to `outputPer1M`).
 *
 * No `server-only` import: this is a pure constant + pure function (no DB/SDK),
 * but it lives under server/admin alongside the analytics repo that consumes it.
 */

import type { ModelKey } from "@/agent/models";

/** USD price per 1,000,000 tokens, split by token role. */
export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
  thinkingPer1M: number;
}

/**
 * Static price table keyed by {@link ModelKey}. A model absent from this map is
 * treated as unpriced (estimate → $0; the caller flags it). Placeholder list
 * prices — see the file header.
 */
export const MODEL_PRICING: Record<ModelKey, ModelPrice> = {
  // xAI Grok 4.3 (primary/default).
  "grok-4.3": { inputPer1M: 3, outputPer1M: 15, thinkingPer1M: 15 },
  // Anthropic Claude Sonnet 4.6.
  claude: { inputPer1M: 3, outputPer1M: 15, thinkingPer1M: 15 },
  // OpenAI GPT-5.5.
  "gpt-5.5": { inputPer1M: 1.25, outputPer1M: 10, thinkingPer1M: 10 },
};

/**
 * Estimate the USD cost of one turn from its token counts (ADMIN-BR-5). An
 * unknown or null `model` (e.g. a "rate_limited" row with no resolved model) has
 * no price entry and returns 0 — the caller (cost view) flags such rows as
 * un-priced. Non-finite token counts are treated as 0 so the result is never
 * NaN. The number is a raw USD float; callers round for display.
 */
export function estimateCostUsd(m: {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}): number {
  const price =
    m.model == null ? undefined : MODEL_PRICING[m.model as ModelKey];
  if (!price) return 0;

  const input = tokens(m.inputTokens);
  const output = tokens(m.outputTokens);
  const thinking = tokens(m.thinkingTokens);

  return (
    (input / 1_000_000) * price.inputPer1M +
    (output / 1_000_000) * price.outputPer1M +
    (thinking / 1_000_000) * price.thinkingPer1M
  );
}

/** Coerce a token count to a finite non-negative number (defaults 0). */
function tokens(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
