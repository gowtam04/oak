import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import MetaTrendSparkline from "./MetaTrendSparkline";

describe("MetaTrendSparkline", () => {
  it("renders a polyline and an end-point dot for two or more points", () => {
    render(
      <MetaTrendSparkline
        points={[
          { month: "2026-03", value: 40 },
          { month: "2026-04", value: 44 },
          { month: "2026-05", value: 46.1 },
        ]}
      />,
    );
    expect(screen.getByTestId("meta-trend-sparkline")).toBeInTheDocument();
    expect(screen.getByTestId("meta-trend-sparkline-line")).toBeInTheDocument();
    expect(screen.getByTestId("meta-trend-sparkline-dot")).toBeInTheDocument();
  });

  it("renders a fallback for fewer than two points", () => {
    render(<MetaTrendSparkline points={[{ month: "2026-05", value: 46.1 }]} />);
    expect(screen.getByTestId("meta-trend-sparkline-empty")).toHaveTextContent(
      "Not enough data",
    );
    expect(screen.queryByTestId("meta-trend-sparkline")).not.toBeInTheDocument();
  });

  it("renders a fallback for zero points", () => {
    render(<MetaTrendSparkline points={[]} />);
    expect(screen.getByTestId("meta-trend-sparkline-empty")).toBeInTheDocument();
  });

  it("respects a custom height", () => {
    render(
      <MetaTrendSparkline
        points={[
          { month: "2026-04", value: 40 },
          { month: "2026-05", value: 44 },
        ]}
        height={60}
      />,
    );
    expect(screen.getByTestId("meta-trend-sparkline")).toHaveAttribute(
      "height",
      "60",
    );
  });
});
