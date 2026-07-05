import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import RefToolbar, { type ChipGroupSpec } from "./RefToolbar";

function makeGroup(selected: Set<string>, onToggle = vi.fn()): ChipGroupSpec {
  return {
    id: "type",
    label: "Filter by type",
    options: [
      { value: "fire", label: "fire", swatch: "fire" },
      { value: "water", label: "water", swatch: "water" },
    ],
    selected,
    onToggle,
  };
}

describe("RefToolbar", () => {
  it("reflects selection via aria-pressed and calls onToggle on click", () => {
    const onToggle = vi.fn();
    render(
      <RefToolbar
        query=""
        onQuery={() => {}}
        searchPlaceholder="Search"
        groups={[makeGroup(new Set(["fire"]), onToggle)]}
        count={3}
        noun="MOVES"
        active
        onClear={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "fire" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "water" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "water" }));
    expect(onToggle).toHaveBeenCalledWith("water");
  });

  it("shows the Clear button only when active and fires onClear", () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <RefToolbar
        query=""
        onQuery={() => {}}
        searchPlaceholder="Search"
        groups={[]}
        count={10}
        noun="ITEMS"
        active={false}
        onClear={onClear}
      />,
    );
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();

    rerender(
      <RefToolbar
        query=""
        onQuery={() => {}}
        searchPlaceholder="Search"
        groups={[]}
        count={2}
        noun="ITEMS"
        active
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders the idle noun and the active RESULTS count", () => {
    const { rerender } = render(
      <RefToolbar
        query=""
        onQuery={() => {}}
        searchPlaceholder="Search"
        groups={[]}
        count={1025}
        noun="POKÉMON"
        active={false}
        onClear={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("1,025 POKÉMON");

    rerender(
      <RefToolbar
        query=""
        onQuery={() => {}}
        searchPlaceholder="Search"
        groups={[]}
        count={27}
        noun="POKÉMON"
        active
        onClear={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("27 RESULTS");
  });

  it("calls onQuery as the user types", () => {
    const onQuery = vi.fn();
    render(
      <RefToolbar
        query=""
        onQuery={onQuery}
        searchPlaceholder="Search moves"
        groups={[]}
        count={5}
        noun="MOVES"
        active={false}
        onClear={() => {}}
      />,
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "ember" },
    });
    expect(onQuery).toHaveBeenCalledWith("ember");
  });
});
