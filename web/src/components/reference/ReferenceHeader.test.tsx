import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ReferenceNav (rendered inside the header) reads `usePathname` to mark the
// active section; stub it so the header renders under jsdom (no router context)
// and each test can drive the active route via `mockPathname.mockReturnValue`.
const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => "/") }));
vi.mock("next/navigation", () => ({ usePathname: mockPathname }));

afterEach(() => {
  cleanup();
  mockPathname.mockReturnValue("/");
});

import ReferenceHeader from "./ReferenceHeader";

describe("ReferenceHeader", () => {
  it("links the wordmark home", () => {
    render(<ReferenceHeader />);
    expect(screen.getByRole("link", { name: "Oak — home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("links to all five reference sections (Usage, not Meta)", () => {
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
    expect(screen.getByRole("link", { name: "Usage" })).toHaveAttribute(
      "href",
      "/usage",
    );
    expect(screen.queryByRole("link", { name: "Meta" })).toBeNull();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/meta");
  });

  it("links to chat", () => {
    render(<ReferenceHeader />);
    expect(screen.getByRole("link", { name: "Open chat" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("marks the current section with aria-current from the pathname", () => {
    mockPathname.mockReturnValue("/moves");
    render(<ReferenceHeader />);
    expect(screen.getByRole("link", { name: "Moves" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Pokédex" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the section active on a detail route (prefix match)", () => {
    mockPathname.mockReturnValue("/pokedex/garchomp");
    render(<ReferenceHeader />);
    expect(screen.getByRole("link", { name: "Pokédex" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
