import type { InferenceCalloutProps } from "@/components/types";
import type { Inference } from "@/agent/schemas";

/**
 * Display labels for the wire `confidence` enum (TestFlight feedback AAhvrDM1 —
 * "Inference [high]" reads as meaningless to non-technical users). The wire
 * value itself, and the CSS modifier classes keyed on it, are unchanged; an
 * unrecognized value falls back to the raw string verbatim.
 */
export const CONFIDENCE_LABELS: Record<Inference["confidence"], string> = {
  high: "Solid",
  medium: "Likely",
  low: "Unsure",
};

function confidenceLabel(confidence: Inference["confidence"]): string {
  return CONFIDENCE_LABELS[confidence] ?? confidence;
}

/**
 * InferenceCallout — visually distinct callouts for `inferences[]`, clearly
 * separating deductions from stated data (BR-3).
 *
 * An `.ilabel` "Oak's deductions" title heads the box; each item shows its
 * claim, a confidence PILL (a colored badge — never the literal `[high]`
 * bracket text a plain string interpolation used to produce), and an optional
 * note on what the inference hinges on. Returns null when `inferences` is
 * empty.
 */
export default function InferenceCallout({
  inferences,
}: InferenceCalloutProps) {
  if (inferences.length === 0) return null;

  return (
    <div className="inference-callout" data-testid="inference-callout">
      {inferences.map((inference, i) => (
        <div
          key={i}
          className={`inference-callout__item inference-callout__item--${inference.confidence}`}
          data-testid={`inference-item-${i}`}
        >
          <p className="inference-callout__line">
            <em className="inference-callout__word">Inferred</em>
            {inference.note
              ? ` from ${inference.note.replace(/^from\s+/i, "")}.`
              : ` from ${inference.claim}`}
          </p>
          <span
            className={`inference-callout__confidence inference-callout__confidence--${inference.confidence}`}
            data-testid={`inference-confidence-${i}`}
          >
            {confidenceLabel(inference.confidence)}
          </span>
          <span className="inference-callout__claim">{inference.claim}</span>
          {inference.note && (
            <span
              className="inference-callout__note"
              data-testid={`inference-note-${i}`}
            >
              {inference.note}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
