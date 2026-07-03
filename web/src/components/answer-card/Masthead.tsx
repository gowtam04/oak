import type { AnswerStatus, GenerationBasis } from "@/components/types";
import { statusIndicator } from "@/components/answer-card/status-indicator";
import { formatScopeTag } from "@/components/answer-card/scope-tag";

export interface MastheadProps {
  status: AnswerStatus;
  generationBasis: GenerationBasis;
}

/**
 * Masthead — the slim status row at the top of every answer card (UI
 * strategy doc §4 screen 04): a status indicator derived from `status`
 * (see `status-indicator.ts`) plus the turn's scope tag derived from
 * `generation_basis` (see `scope-tag.ts`). Always rendered — every OakAnswer
 * carries both fields.
 */
export default function Masthead({ status, generationBasis }: MastheadProps) {
  const indicator = statusIndicator(status);
  const scope = formatScopeTag(generationBasis);

  return (
    <div className="answer-masthead" data-testid="answer-masthead">
      <span
        className={`answer-masthead__status answer-masthead__status--${indicator.tone}`}
        data-testid="answer-masthead-status"
      >
        <span className="answer-masthead__status-symbol" aria-hidden="true">
          {indicator.symbol}
        </span>
        {indicator.label}
      </span>
      <span
        className="answer-masthead__scope ilabel"
        data-testid="answer-masthead-scope"
      >
        {scope}
      </span>
    </div>
  );
}
