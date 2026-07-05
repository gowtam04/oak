import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import MetaLeaderboardTable from "./MetaLeaderboardTable";

describe("MetaLeaderboardTable", () => {
  it("renders a linked name when href is present", () => {
    render(
      <MetaLeaderboardTable
        rows={[
          { rank: 1, name: "Gholdengo", href: "/pokedex/gholdengo", usagePct: 46.1, deltaPct: 1.9 },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Gholdengo" })).toHaveAttribute(
      "href",
      "/pokedex/gholdengo",
    );
  });

  it("renders plain text when href is null", () => {
    render(
      <MetaLeaderboardTable
        rows={[
          { rank: 1, name: "Some Unresolved Mon", href: null, usagePct: 10, deltaPct: null },
        ]}
      />,
    );
    expect(screen.getByText("Some Unresolved Mon")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders one decimal place for the usage percentage", () => {
    render(
      <MetaLeaderboardTable
        rows={[
          { rank: 1, name: "Gholdengo", href: null, usagePct: 46.14, deltaPct: null },
        ]}
      />,
    );
    expect(screen.getByText("46.1%")).toBeInTheDocument();
  });

  it("computes the bar width as a percentage of the max usagePct in the rows", () => {
    render(
      <MetaLeaderboardTable
        rows={[
          { rank: 1, name: "A", href: null, usagePct: 50, deltaPct: null },
          { rank: 2, name: "B", href: null, usagePct: 25, deltaPct: null },
        ]}
      />,
    );
    expect(screen.getByTestId("meta-leaderboard-bar-1")).toHaveStyle({
      "--fill": "100%",
    });
    expect(screen.getByTestId("meta-leaderboard-bar-2")).toHaveStyle({
      "--fill": "50%",
    });
  });

  it("renders an up delta with the up class and a plus sign", () => {
    render(
      <MetaLeaderboardTable
        rows={[{ rank: 1, name: "A", href: null, usagePct: 10, deltaPct: 1.9 }]}
      />,
    );
    const delta = screen.getByText("▲ +1.9");
    expect(delta).toHaveClass("ref-meta-table__delta--up");
  });

  it("renders a down delta with the down class and a minus sign", () => {
    render(
      <MetaLeaderboardTable
        rows={[{ rank: 1, name: "A", href: null, usagePct: 10, deltaPct: -0.8 }]}
      />,
    );
    const delta = screen.getByText("▼ −0.8");
    expect(delta).toHaveClass("ref-meta-table__delta--down");
  });

  it("renders an em dash when deltaPct is null", () => {
    render(
      <MetaLeaderboardTable
        rows={[{ rank: 1, name: "A", href: null, usagePct: 10, deltaPct: null }]}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders nothing for an empty row list", () => {
    const { container } = render(<MetaLeaderboardTable rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
