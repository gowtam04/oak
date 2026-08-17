import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

afterEach(() => cleanup());
import EvolutionChain from "./EvolutionChain";
import { guessOakMediaSpriteUrl } from "@/lib/sprites";

describe("EvolutionChain", () => {
  it("renders nothing when there are no edges", () => {
    const { container } = render(<EvolutionChain edges={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links both ends of an edge and shows the condition", () => {
    render(
      <EvolutionChain
        edges={[
          {
            fromSlug: "gible",
            fromName: "Gible",
            toSlug: "gabite",
            toName: "Gabite",
            condition: "Level 24",
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Gible" })).toHaveAttribute(
      "href",
      "/pokedex/gible",
    );
    expect(screen.getByRole("link", { name: "Gabite" })).toHaveAttribute(
      "href",
      "/pokedex/gabite",
    );
    expect(screen.getByText("Level 24")).toBeInTheDocument();
  });

  it("shows a sprite for each evolution node", () => {
    render(
      <EvolutionChain
        edges={[
          {
            fromSlug: "gible",
            fromName: "Gible",
            toSlug: "gabite",
            toName: "Gabite",
            condition: "Level 24",
          },
        ]}
      />,
    );
    // Empty alt marks sprites as decorative; query the <img> DOM node.
    const gible = screen.getByRole("link", { name: "Gible" });
    const gabite = screen.getByRole("link", { name: "Gabite" });
    expect(within(gible).getByAltText("")).toHaveAttribute(
      "src",
      guessOakMediaSpriteUrl("gible"),
    );
    expect(within(gabite).getByAltText("")).toHaveAttribute(
      "src",
      guessOakMediaSpriteUrl("gabite"),
    );
  });

  it("chains multiple edges without repeating the first node's link", () => {
    const { container } = render(
      <EvolutionChain
        edges={[
          { fromSlug: "gible", fromName: "Gible", toSlug: "gabite", toName: "Gabite" },
          { fromSlug: "gabite", fromName: "Gabite", toSlug: "garchomp", toName: "Garchomp" },
        ]}
      />,
    );
    expect(screen.getAllByRole("link", { name: "Gabite" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Garchomp" })).toHaveAttribute(
      "href",
      "/pokedex/garchomp",
    );
    expect(container.querySelectorAll("img")).toHaveLength(3);
  });
});
