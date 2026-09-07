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

  it("points at live Champions usage, not Smogon /meta (CF-DEX-AC-1.6)", () => {
    const liveHref = { slug: "garchomp" };
    render(
      <UsageBlock
        {...liveHref}
        usage={{
          season: "Reg M-B, Season 3",
          usagePercent: 12.4,
          topMoves: [{ name: "Earthquake", pct: 60 }],
          topItems: [],
          topTeammates: [],
          attribution: "Usage data via Pokémon Champions ranked ladder.",
        }}
      />,
    );
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/smogon/i);
    expect(html).not.toMatch(/\/meta/);
    expect(html).not.toMatch(/gen9ou/);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toMatch(/^\/(usage|api\/usage)\/garchomp/);
  });
});
