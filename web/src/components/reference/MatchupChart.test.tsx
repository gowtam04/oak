import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import MatchupChart from "./MatchupChart";

describe("MatchupChart", () => {
  it("renders one row per non-empty group with its type badges", () => {
    render(
      <MatchupChart
        groups={[
          { label: "Weak to", multiplier: "4x", types: ["ice"] },
          { label: "Resists", multiplier: "0.5x", types: ["fire", "water"] },
        ]}
      />,
    );
    expect(screen.getByTestId("matchup-row-4x")).toBeInTheDocument();
    expect(screen.getByTestId("type-badge-ice")).toBeInTheDocument();
    expect(screen.getByTestId("matchup-row-0.5x")).toBeInTheDocument();
    expect(screen.getByTestId("type-badge-fire")).toBeInTheDocument();
    expect(screen.getByTestId("type-badge-water")).toBeInTheDocument();
  });

  it("omits empty groups", () => {
    render(
      <MatchupChart
        groups={[
          { label: "Weak to", multiplier: "4x", types: ["ice"] },
          { label: "Immune to", multiplier: "0x", types: [] },
        ]}
      />,
    );
    expect(screen.queryByTestId("matchup-row-0x")).not.toBeInTheDocument();
  });

  it("renders nothing when every group is empty", () => {
    const { container } = render(
      <MatchupChart groups={[{ label: "Weak to", multiplier: "4x", types: [] }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
