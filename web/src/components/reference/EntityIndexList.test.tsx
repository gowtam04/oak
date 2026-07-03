import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import EntityIndexList from "./EntityIndexList";

describe("EntityIndexList", () => {
  it("renders a heading per group and a link per entry", () => {
    render(
      <EntityIndexList
        groups={[
          {
            heading: "Generation 1",
            entries: [
              { href: "/pokedex/bulbasaur", primary: "Bulbasaur", types: ["grass", "poison"] },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("Generation 1")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Bulbasaur/ });
    expect(link).toHaveAttribute("href", "/pokedex/bulbasaur");
    expect(screen.getByTestId("type-badge-grass")).toBeInTheDocument();
    expect(screen.getByTestId("type-badge-poison")).toBeInTheDocument();
  });

  it("renders secondary and meta text when provided", () => {
    render(
      <EntityIndexList
        groups={[
          {
            heading: "Moves",
            entries: [
              {
                href: "/moves/earthquake",
                primary: "Earthquake",
                secondary: "Ground",
                meta: "100 BP",
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("Ground")).toBeInTheDocument();
    expect(screen.getByText("100 BP")).toBeInTheDocument();
  });

  it("renders a large number of entries efficiently with flat markup", () => {
    const entries = Array.from({ length: 1200 }, (_, i) => ({
      href: `/pokedex/mon-${i}`,
      primary: `Mon ${i}`,
    }));
    render(<EntityIndexList groups={[{ heading: "All", entries }]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1200);
  });
});
