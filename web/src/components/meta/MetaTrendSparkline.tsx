/**
 * MetaTrendSparkline — a small static usage-over-time line for a
 * `/meta/[format]/[slug]` drill-in header. Modeled on `TimeSeriesChart`'s
 * jsdom-safe inline-SVG strategy (fixed logical viewBox, `width="100%"`,
 * `preserveAspectRatio="none"`, `vector-effect="non-scaling-stroke"`), but
 * much simpler: months are CATEGORICAL (evenly spaced by index, not scaled
 * by a time value), there is no hover/tooltip machinery, and the only marker
 * is a dot on the latest point. Renders a "not enough data" fallback below
 * two points — a single month can't show a trend.
 */

export interface MetaTrendPoint {
  month: string;
  value: number;
}

export interface MetaTrendSparklineProps {
  points: MetaTrendPoint[];
  height?: number;
}

/** Logical viewBox width — stretches to fill the container via `preserveAspectRatio="none"`. */
const VIEW_W = 240;
const DEFAULT_HEIGHT = 40;
/** Vertical padding (fraction of height) so extreme points don't clip the stroke/dot. */
const PAD_FRACTION = 0.15;

export default function MetaTrendSparkline({
  points,
  height = DEFAULT_HEIGHT,
}: MetaTrendSparklineProps) {
  if (points.length < 2) {
    return (
      <div
        className="ref-meta-spark ref-meta-spark--empty"
        data-testid="meta-trend-sparkline-empty"
      >
        Not enough data
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const yMin = Math.min(...values);
  const yMaxRaw = Math.max(...values);
  const ySpan = yMaxRaw - yMin || 1;

  const pad = height * PAD_FRACTION;
  const plotHeight = height - pad * 2;

  const sx = (i: number) => (i / (points.length - 1)) * VIEW_W;
  const sy = (v: number) => pad + plotHeight - ((v - yMin) / ySpan) * plotHeight;

  const coords = points.map((p, i) => ({ x: sx(i), y: sy(p.value) }));
  const linePoints = coords
    .map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");
  const last = coords[coords.length - 1];

  return (
    <svg
      className="ref-meta-spark"
      data-testid="meta-trend-sparkline"
      width="100%"
      height={height}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Usage trend over recent months"
    >
      <polyline
        className="ref-meta-spark__line"
        data-testid="meta-trend-sparkline-line"
        points={linePoints}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      {/* A zero-length round-capped line renders as a crisp, undistorted dot
          under preserveAspectRatio="none" (a <circle> would ellipse-distort). */}
      <line
        className="ref-meta-spark__dot"
        data-testid="meta-trend-sparkline-dot"
        x1={last.x}
        y1={last.y}
        x2={last.x}
        y2={last.y}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
