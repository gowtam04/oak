import type { AnswerStatus } from "@/components/types";

/** Visual weight bucket for a status indicator — drives the masthead's CSS modifier. */
export type StatusTone = "ok" | "partial" | "insufficient";

export interface StatusIndicator {
  /** A single glyph shown before the label (masked as decorative via aria-hidden). */
  symbol: string;
  label: string;
  tone: StatusTone;
}

/**
 * Masthead status -> { symbol, label, tone } (UI strategy doc §4 screen 04).
 *
 * "answered" is the only clean-success status. `clarification_needed` and
 * `resolution_failed` both read as a partial/needs-attention state (the agent
 * stopped short of a full answer, either to ask a question or because
 * resolution failed) — same tone, different label so the reason stays honest.
 * `insufficient_data` is the floor: the agent could not answer at all.
 *
 * Exhaustive over `AnswerStatus` (schemas.ts `oakAnswerSchema.status`) — a
 * missing case is a TS error, not a silent fallback. Pinned by
 * `Masthead.test.tsx` for all four enum values.
 */
const STATUS_INDICATORS: Record<AnswerStatus, StatusIndicator> = {
  answered: { symbol: "✓", label: "Answered", tone: "ok" },
  clarification_needed: {
    symbol: "⚠",
    label: "Needs input",
    tone: "partial",
  },
  resolution_failed: {
    symbol: "⚠",
    label: "Couldn't resolve",
    tone: "partial",
  },
  insufficient_data: {
    symbol: "∅",
    label: "Insufficient data",
    tone: "insufficient",
  },
};

/** Map a OakAnswer `status` to its masthead indicator. */
export function statusIndicator(status: AnswerStatus): StatusIndicator {
  return STATUS_INDICATORS[status];
}
