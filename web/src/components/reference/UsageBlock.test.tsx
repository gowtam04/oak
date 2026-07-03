import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import UsageBlock from "./UsageBlock";

describe("UsageBlock", () => {
  it("renders season, overall usage, and per-category lists", () => {
    render(
      <UsageBlock
        usage={{
          season: "Reg M-B, Season 3",
          usagePercent: 12.4,
          topMoves: [{ name: "Earthquake", pct: 60 }],
          topItems: [{ name: "Choice Scarf", pct: 30 }],
          topTeammates: [{ name: "Rotom-Wash", pct: 20 }],
          attribution: "Usage data via Pokémon Champions ranked ladder.",
        }}
      />,
    );
    expect(screen.getByText("Reg M-B, Season 3")).toBeInTheDocument();
    expect(screen.getByText("12.4% usage")).toBeInTheDocument();
    expect(screen.getByText("Top moves")).toBeInTheDocument();
    expect(screen.getByText("Earthquake")).toBeInTheDocument();
    expect(screen.getByText("Choice Scarf")).toBeInTheDocument();
    expect(screen.getByText("Rotom-Wash")).toBeInTheDocument();
  });

  it("always renders the attribution line", () => {
    render(
      <UsageBlock
        usage={{
          topMoves: [],
          topItems: [],
          topTeammates: [],
          attribution: "Usage data via Pokémon Champions ranked ladder.",
        }}
      />,
    );
    expect(
      screen.getByText("Usage data via Pokémon Champions ranked ladder."),
    ).toBeInTheDocument();
  });

  it("omits an empty category list", () => {
    render(
      <UsageBlock
        usage={{
          topMoves: [],
          topItems: [],
          topTeammates: [],
          attribution: "attribution",
        }}
      />,
    );
    expect(screen.queryByText("Top moves")).not.toBeInTheDocument();
  });
});
