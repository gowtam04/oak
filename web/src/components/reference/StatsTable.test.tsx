import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import StatsTable from "./StatsTable";

const STATS = [
  { label: "HP", key: "hp", value: 108 },
  { label: "Atk", key: "attack", value: 130 },
  { label: "Def", key: "defense", value: 95 },
  { label: "SpA", key: "special_attack", value: 80 },
  { label: "SpD", key: "special_defense", value: 85 },
  { label: "Spe", key: "speed", value: 102 },
];

describe("StatsTable", () => {
  it("renders a real table", () => {
    render(<StatsTable stats={STATS} total={600} />);
    expect(screen.getByTestId("stats-table").tagName).toBe("TABLE");
  });

  it("renders a row per stat plus the BST total row", () => {
    render(<StatsTable stats={STATS} total={600} />);
    for (const s of STATS) {
      expect(screen.getByTestId(`stats-row-${s.key}`)).toBeInTheDocument();
      expect(screen.getByText(s.label)).toBeInTheDocument();
      expect(screen.getByText(String(s.value))).toBeInTheDocument();
    }
    expect(screen.getByText("BST")).toBeInTheDocument();
    expect(screen.getByText("600")).toBeInTheDocument();
  });

  it("applies a tier class to each stat's bar", () => {
    render(<StatsTable stats={STATS} total={600} />);
    const row = screen.getByTestId("stats-row-attack");
    const bar = row.querySelector(".ref-stats__bar");
    expect(bar).not.toBeNull();
    expect(bar!.className).toMatch(/ref-stats__bar--(danger|warning|success|azure)/);
  });

  it("scales the --fill custom property to the stat value out of 255", () => {
    render(<StatsTable stats={[{ label: "Spe", key: "speed", value: 255 }]} total={255} />);
    const bar = screen.getByTestId("stats-row-speed").querySelector(".ref-stats__bar") as HTMLElement;
    expect(bar.style.getPropertyValue("--fill")).toBe("100%");
  });
});
