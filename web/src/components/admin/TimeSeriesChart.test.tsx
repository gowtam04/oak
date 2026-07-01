import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import TimeSeriesChart, {
  formatValue,
  formatTime,
  type ChartSeries,
} from "./TimeSeriesChart";

// --- Fixtures (no db/repo imports — this is the jsdom project) --------------

const DAY = 86_400_000;
const BASE = Date.UTC(2026, 0, 1); // 2026-01-01

/** A realistic multi-bucket usage series (mirrors UsageBucket → series shape). */
const TURNS_SERIES: ChartSeries = {
  key: "turns",
  label: "Turns",
  points: [
    { t: BASE, value: 12 },
    { t: BASE + DAY, value: 30 },
    { t: BASE + 2 * DAY, value: 18 },
    { t: BASE + 3 * DAY, value: 41 },
  ],
};

const SIGNUPS_SERIES: ChartSeries = {
  key: "signups",
  label: "Signups",
  color: "var(--success, #2fb573)",
  points: [
    { t: BASE, value: 1 },
    { t: BASE + DAY, value: 4 },
    { t: BASE + 2 * DAY, value: 0 },
    { t: BASE + 3 * DAY, value: 2 },
  ],
};

describe("TimeSeriesChart", () => {
  it("renders without crashing on a fixture series", () => {
    render(<TimeSeriesChart series={[TURNS_SERIES]} />);
    expect(screen.getByTestId("time-series-chart")).toBeInTheDocument();
    expect(screen.getByTestId("time-series-chart-svg")).toBeInTheDocument();
  });

  it("renders without crashing on an empty series array", () => {
    render(<TimeSeriesChart series={[]} />);
    // No SVG is rendered; the empty-state placeholder is shown instead.
    expect(screen.getByTestId("time-series-chart")).toBeInTheDocument();
    expect(screen.getByTestId("time-series-chart-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("time-series-chart-svg")).toBeNull();
  });

  it("treats a series whose points array is empty as empty (no points anywhere)", () => {
    render(<TimeSeriesChart series={[{ key: "k", label: "K", points: [] }]} />);
    expect(screen.getByTestId("time-series-chart-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("time-series-chart-svg")).toBeNull();
  });

  it("shows the custom empty label", () => {
    render(<TimeSeriesChart series={[]} emptyLabel="Nothing yet" />);
    expect(screen.getByTestId("time-series-chart-empty")).toHaveTextContent(
      "Nothing yet",
    );
  });

  it("renders a polyline path for a series with multiple points", () => {
    const { container } = render(<TimeSeriesChart series={[TURNS_SERIES]} />);
    const group = screen.getByTestId("ts-series-turns");
    expect(group).toBeInTheDocument();
    expect(container.querySelector("polyline.time-series-chart__line")).not.toBeNull();
  });

  it("renders one legend entry per series", () => {
    render(<TimeSeriesChart series={[TURNS_SERIES, SIGNUPS_SERIES]} />);
    expect(screen.getByTestId("ts-legend-turns")).toHaveTextContent("Turns");
    expect(screen.getByTestId("ts-legend-signups")).toHaveTextContent("Signups");
  });

  it("plots multiple series together (multi-line)", () => {
    const { container } = render(
      <TimeSeriesChart series={[TURNS_SERIES, SIGNUPS_SERIES]} />,
    );
    expect(screen.getByTestId("ts-series-turns")).toBeInTheDocument();
    expect(screen.getByTestId("ts-series-signups")).toBeInTheDocument();
    expect(
      container.querySelectorAll("polyline.time-series-chart__line"),
    ).toHaveLength(2);
  });

  it("renders an area fill path when area={true}", () => {
    const { container } = render(
      <TimeSeriesChart series={[TURNS_SERIES]} area />,
    );
    expect(container.querySelector("path.time-series-chart__area")).not.toBeNull();
  });

  it("omits the area path by default", () => {
    const { container } = render(<TimeSeriesChart series={[TURNS_SERIES]} />);
    expect(container.querySelector("path.time-series-chart__area")).toBeNull();
  });

  it("renders a single-point series as a dot (not a line) without crashing", () => {
    const single: ChartSeries = {
      key: "solo",
      label: "Solo",
      points: [{ t: BASE, value: 7 }],
    };
    const { container } = render(<TimeSeriesChart series={[single]} />);
    expect(screen.getByTestId("ts-series-solo")).toBeInTheDocument();
    expect(container.querySelector("line.time-series-chart__dot")).not.toBeNull();
    expect(container.querySelector("polyline.time-series-chart__line")).toBeNull();
  });

  it("handles an all-zero series without dividing by zero", () => {
    const zeros: ChartSeries = {
      key: "z",
      label: "Z",
      points: [
        { t: BASE, value: 0 },
        { t: BASE + DAY, value: 0 },
      ],
    };
    const { container } = render(<TimeSeriesChart series={[zeros]} />);
    const polyline = container.querySelector("polyline.time-series-chart__line");
    expect(polyline).not.toBeNull();
    // Every coordinate must be a finite number (no NaN from a zero y-span).
    const pointsAttr = polyline!.getAttribute("points") ?? "";
    expect(pointsAttr.length).toBeGreaterThan(0);
    expect(pointsAttr).not.toMatch(/NaN/);
  });

  it("renders y-axis tick labels (default 3)", () => {
    render(<TimeSeriesChart series={[TURNS_SERIES]} />);
    expect(screen.getByTestId("ts-ytick-0")).toBeInTheDocument();
    expect(screen.getByTestId("ts-ytick-1")).toBeInTheDocument();
    expect(screen.getByTestId("ts-ytick-2")).toBeInTheDocument();
  });

  it("uses a custom yFormat for tick labels", () => {
    render(
      <TimeSeriesChart
        series={[TURNS_SERIES]}
        yFormat={(v) => `$${v.toFixed(0)}`}
      />,
    );
    // The top tick is the data max (41) → "$41".
    expect(screen.getByTestId("ts-ytick-0")).toHaveTextContent("$41");
  });

  it("renders the figure with an accessible role and label", () => {
    render(<TimeSeriesChart series={[TURNS_SERIES]} ariaLabel="Turns per day" />);
    const fig = screen.getByTestId("time-series-chart");
    expect(fig.tagName).toBe("FIGURE");
    expect(fig).toHaveAttribute("role", "img");
    expect(fig).toHaveAttribute("aria-label", "Turns per day");
  });

  it("applies an extra className alongside the base class", () => {
    render(<TimeSeriesChart series={[TURNS_SERIES]} className="cost-chart" />);
    const fig = screen.getByTestId("time-series-chart");
    expect(fig).toHaveClass("time-series-chart");
    expect(fig).toHaveClass("cost-chart");
  });
});

describe("TimeSeriesChart helpers", () => {
  it("formatValue compacts thousands and millions", () => {
    expect(formatValue(950)).toBe("950");
    expect(formatValue(12_345)).toBe("12.3k");
    expect(formatValue(2_500_000)).toBe("2.5M");
  });

  it("formatValue keeps integers whole", () => {
    expect(formatValue(0)).toBe("0");
    expect(formatValue(42)).toBe("42");
  });

  it("formatValue is safe on non-finite input", () => {
    expect(formatValue(NaN)).toBe("0");
  });

  it("formatTime returns a non-empty label for a valid epoch (day bucket)", () => {
    expect(formatTime(BASE, "day").length).toBeGreaterThan(0);
  });

  it("formatTime returns empty string for an invalid timestamp", () => {
    expect(formatTime(NaN, "day")).toBe("");
  });
});
