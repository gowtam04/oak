/**
 * KpiCard — a single headline-metric tile for the admin dashboard.
 *
 * A pure, presentational leaf primitive (no hooks, no fetch, no db/repo
 * imports) composed by the observability screens (Overview / Cost / Errors,
 * Phase 7) to surface one figure each: total turns, distinct active users,
 * signups, estimated cost, error rate, etc. The caller pre-formats `value`
 * (number / currency / percent string) so this component stays
 * format-agnostic and trivially fixture-renderable.
 *
 * Conventions mirrored from the answer-card primitives: BEM class names,
 * a stable `data-testid`, default-exported component + named-exported props.
 *
 * Refs:
 *   - docs/features/admin-panel/architecture/design.md
 *       § Component Design › 5 (shared admin primitives: `KpiCard`)
 *       § Implementation Phases › Phase 6 (primitives render fixture data)
 *       § API Design (`OverviewResponse` totals / `totalEstUsd` / `errorRatePct`)
 *       § Technical Decisions AD-6 (cost is estimate-only → `estimated` badge)
 *   - requirements.md ADMIN-US-1/2/3/4, ADMIN-BR-5 (cost is an estimate).
 *
 * CLIENT-SAFE: structural props only; safe under the jsdom component project.
 */

/** Visual emphasis for the metric value (e.g. error-rate → warn/danger). */
export type KpiTone = "default" | "warn" | "danger";

export interface KpiCardProps {
  /** Metric name shown above the value (e.g. "Total turns"). */
  label: string;
  /**
   * The headline figure, pre-formatted by the caller — a number is rendered
   * as-is, a string lets the caller own currency / percent / unit formatting.
   */
  value: string | number;
  /** Optional secondary line under the value (context, breakdown, or window). */
  hint?: string;
  /**
   * When true, renders an "est." badge to mark the figure as an estimate.
   * Used for cost tiles, where pricing is a static in-code table, not billed
   * truth (ADMIN-BR-5 / AD-6).
   */
  estimated?: boolean;
  /** Emphasis tone applied to the value (defaults to "default"). */
  tone?: KpiTone;
}

export default function KpiCard({
  label,
  value,
  hint,
  estimated = false,
  tone = "default",
}: KpiCardProps) {
  const toneClass = tone === "default" ? "" : ` kpi-card--${tone}`;

  return (
    <div className={`kpi-card${toneClass}`} data-testid="kpi-card">
      <div className="kpi-card__label" data-testid="kpi-card-label">
        {label}
      </div>
      <div className="kpi-card__value" data-testid="kpi-card-value">
        {value}
        {estimated && (
          <span className="kpi-card__badge" data-testid="kpi-card-estimated">
            est.
          </span>
        )}
      </div>
      {hint != null && hint !== "" && (
        <div className="kpi-card__hint" data-testid="kpi-card-hint">
          {hint}
        </div>
      )}
    </div>
  );
}
