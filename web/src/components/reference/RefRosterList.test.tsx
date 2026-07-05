import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import RefRosterList from "./RefRosterList";

describe("RefRosterList", () => {
  it("renders a heading per group", () => {
    render(
      <RefRosterList
        groups={[
          { heading: "Level-up", entries: [{ href: "/pokedex/gible", primary: "Gible" }] },
          { heading: "TM/HM", entries: [{ href: "/pokedex/garchomp", primary: "Garchomp" }] },
        ]}
      />,
    );
    expect(screen.getByText("Level-up")).toBeInTheDocument();
    expect(screen.getByText("TM/HM")).toBeInTheDocument();
  });

  it("keeps a plain link per entry (the crawl spine)", () => {
    render(
      <RefRosterList
        groups={[
          { heading: "Level-up", entries: [{ href: "/pokedex/gible", primary: "Gible" }] },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Gible" })).toHaveAttribute(
      "href",
      "/pokedex/gible",
    );
  });

  it("renders optional secondary, type badges, and meta when present", () => {
    render(
      <RefRosterList
        groups={[
          {
            heading: "Level-up",
            entries: [
              {
                href: "/pokedex/garchomp",
                primary: "Garchomp",
                secondary: "#0445",
                types: ["dragon", "ground"],
                meta: "600 BST",
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("#0445")).toBeInTheDocument();
    expect(screen.getByText("600 BST")).toBeInTheDocument();
    expect(screen.getByTestId("type-badge-dragon")).toBeInTheDocument();
    expect(screen.getByTestId("type-badge-ground")).toBeInTheDocument();
  });

  it("renders an empty container for no groups", () => {
    render(<RefRosterList groups={[]} />);
    expect(screen.getByTestId("ref-roster-list")).toBeEmptyDOMElement();
  });
});
