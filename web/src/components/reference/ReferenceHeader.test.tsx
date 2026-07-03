import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import ReferenceHeader from "./ReferenceHeader";

describe("ReferenceHeader", () => {
  it("links the wordmark home", () => {
    render(<ReferenceHeader />);
    expect(screen.getByRole("link", { name: "Oak — home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("links to all four reference sections", () => {
    render(<ReferenceHeader />);
    expect(screen.getByRole("link", { name: "Pokédex" })).toHaveAttribute(
      "href",
      "/pokedex",
    );
    expect(screen.getByRole("link", { name: "Moves" })).toHaveAttribute(
      "href",
      "/moves",
    );
    expect(screen.getByRole("link", { name: "Abilities" })).toHaveAttribute(
      "href",
      "/abilities",
    );
    expect(screen.getByRole("link", { name: "Items" })).toHaveAttribute(
      "href",
      "/items",
    );
  });

  it("links to chat", () => {
    render(<ReferenceHeader />);
    expect(screen.getByRole("link", { name: "Open chat" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("marks the current section with aria-current", () => {
    render(<ReferenceHeader current="moves" />);
    expect(screen.getByRole("link", { name: "Moves" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Pokédex" }),
    ).not.toHaveAttribute("aria-current");
  });
});
