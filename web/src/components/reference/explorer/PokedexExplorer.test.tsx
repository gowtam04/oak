import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import PokedexExplorer from "./PokedexExplorer";
import type { PokedexIndexData } from "@/lib/reference-pages-types";

const DATA: PokedexIndexData = {
  rows: [
    {
      slug: "charmander",
      displayName: "Charmander",
      dexNumber: 4,
      types: ["fire"],
      baseStatTotal: 309,
      spriteUrl: "https://example.test/4.png",
      isNative: true,
    },
    {
      slug: "squirtle",
      displayName: "Squirtle",
      dexNumber: 7,
      types: ["water"],
      baseStatTotal: 314,
      spriteUrl: "https://example.test/7.png",
      isNative: true,
    },
    {
      slug: "chespin",
      displayName: "Chespin",
      dexNumber: 650,
      types: ["grass"],
      baseStatTotal: 313,
      spriteUrl: "https://example.test/650.png",
      isNative: true,
    },
  ],
  extras: [
    {
      slug: "charizard-mega-x",
      displayName: "Charizard (Mega X)",
      sourceFormat: "gen-6",
    },
  ],
};

describe("PokedexExplorer", () => {
  it("renders every Champions species and ignores other-format extras (CF-DEX-AC-1.1)", () => {
    render(<PokedexExplorer data={DATA} />);
    expect(screen.getByRole("link", { name: /Charmander/ })).toHaveAttribute(
      "href",
      "/pokedex/charmander",
    );
    expect(screen.getByRole("link", { name: /Squirtle/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Chespin/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Charizard/ })).toBeNull();
    expect(screen.queryByText(/Other formats/)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("3 POKÉMON");
  });

  it("drops empty generation groups and extras when a type facet is active", () => {
    render(<PokedexExplorer data={DATA} />);
    fireEvent.click(screen.getByRole("button", { name: "fire" }));

    expect(screen.getByRole("link", { name: /Charmander/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Squirtle/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Chespin/ })).toBeNull();
    // Extras are facet-exempt → gone once a facet is picked.
    expect(screen.queryByRole("link", { name: /Charizard/ })).toBeNull();
    // Generation 6 (Chespin) has no fire mon → its heading is dropped.
    expect(screen.queryByText(/Generation 6/)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("1 RESULTS");
  });

  it("flattens on a query and does not surface other-game extras (CF-DEX-AC-1.3)", async () => {
    render(<PokedexExplorer data={DATA} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "char" },
    });
    expect(await screen.findByRole("link", { name: /Charmander/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Charizard/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Squirtle/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("1 RESULTS");
  });

  it("shows a Champions-roster empty state when nothing matches (CF-UI-AC-7.2)", () => {
    render(<PokedexExplorer data={DATA} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzzznope" },
    });
    expect(screen.getByTestId("ref-empty")).toBeInTheDocument();
    expect(screen.getByTestId("ref-empty")).toHaveTextContent(
      /champions roster/i,
    );
    expect(screen.getByRole("status")).toHaveTextContent("0 RESULTS");
  });
});
