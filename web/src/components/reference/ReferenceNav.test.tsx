/**
 * ReferenceNav — Usage, not Meta / not /meta (P6c leftover from P5).
 *
 * Requirement refs: CF-USAGE-AC-1.7, CF-UI-US-6, CF-DEX-US-1 (reference island).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { mockPathname } = vi.hoisted(() => ({
  mockPathname: vi.fn(() => "/pokedex"),
}));
vi.mock("next/navigation", () => ({ usePathname: mockPathname }));

afterEach(() => {
  cleanup();
  mockPathname.mockReturnValue("/pokedex");
});

import ReferenceNav, { isSectionActive, NAV_ITEMS } from "./ReferenceNav";

describe("ReferenceNav — Usage not Meta (P5 leftover)", () => {
  it("lists Usage (not Meta) as the last section, href /usage (not /meta)", () => {
    const keys = NAV_ITEMS.map((i) => i.key as string);
    const labels = NAV_ITEMS.map((i) => i.label);
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(keys).toEqual(["pokedex", "moves", "abilities", "items", "usage"]);
    expect(keys).not.toContain("meta");
    expect(labels).toContain("Usage");
    expect(labels).not.toContain("Meta");
    expect(hrefs).toContain("/usage");
    expect(hrefs).not.toContain("/meta");
  });

  it("renders a Usage link to /usage and no Meta /meta link", () => {
    render(<ReferenceNav />);
    expect(screen.getByRole("link", { name: "Usage" })).toHaveAttribute(
      "href",
      "/usage",
    );
    expect(screen.queryByRole("link", { name: "Meta" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Usage" })?.getAttribute("href"),
    ).not.toBe("/meta");
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/meta");
  });

  it("marks Usage current on /usage and /usage/:slug", () => {
    expect(isSectionActive("/usage", "/usage")).toBe(true);
    expect(isSectionActive("/usage", "/usage/garchomp")).toBe(true);
    expect(isSectionActive("/usage", "/pokedex")).toBe(false);
    expect(isSectionActive("/meta", "/usage")).toBe(false);
  });

  it("lights the Usage tab on a drill-in pathname", () => {
    mockPathname.mockReturnValue("/usage/garchomp");
    render(<ReferenceNav />);
    expect(screen.getByRole("link", { name: "Usage" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Pokédex" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
