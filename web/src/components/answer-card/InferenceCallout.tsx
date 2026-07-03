import type { InferenceCalloutProps } from "@/components/types";
import type { Inference } from "@/agent/schemas";

/** Capitalized, bracket-free confidence word for the pill (never `[high]`). */
function confidenceLabel(confidence: Inference["confidence"]): string {
  return confidence[0].toUpperCase() + confidence.slice(1);
}

/**
 * InferenceCallout — visually distinct callouts for `inferences[]`, clearly
 * separating deductions from stated data (BR-3).
 *
 * An `.ilabel` "Inference" title heads the box; each item shows its claim, a
 * confidence PILL (a colored badge — never the literal `[high]` bracket text
 * a plain string interpolation used to produce), and an optional note on what
 * the inference hinges on. Returns null when `inferences` is empty.
 */
export default function InferenceCallout({
  inferences,
}: InferenceCalloutProps) {
  if (inferences.length === 0) return null;

  return (
    <div className="inference-callout" data-testid="inference-callout">
      <span className="inference-callout__title ilabel">Inference</span>
      {inferences.map((inference, i) => (
        <div
          key={i}
          className={`inference-callout__item inference-callout__item--${inference.confidence}`}
          data-testid={`inference-item-${i}`}
        >
          <span
            className={`inference-callout__confidence inference-callout__confidence--${inference.confidence}`}
            data-testid={`inference-confidence-${i}`}
          >
            {confidenceLabel(inference.confidence)}
          </span>{" "}
          <span className="inference-callout__claim">{inference.claim}</span>
          {inference.note && (
            <span
              className="inference-callout__note"
              data-testid={`inference-note-${i}`}
            >
              {" — "}
              {inference.note}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
