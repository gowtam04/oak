import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import ScopeChip from "./ScopeChip";

/**
 * jsdom project — fixture props ONLY (never imports db/repos/runtime). Pins the
 * chip's per-format copy, which is sourced from the portable `scopeLabel` helper
 * so the same strings render on web and a future iOS client.
 */
describe("ScopeChip", () => {
  it("renders the Champions label with the short regulation", () => {
    render(<ScopeChip format="champions" />);
    const chip = screen.getByTestId("scope-chip");
    expect(chip).toHaveTextContent("Champions · Reg M-B");
    expect(chip).toHaveAttribute("data-format", "champions");
  });

  it("renders the Gen 9 / Scarlet-Violet label", () => {
    render(<ScopeChip format="scarlet-violet" />);
    const chip = screen.getByTestId("scope-chip");
    expect(chip).toHaveTextContent("Gen 9 · Scarlet/Violet");
    expect(chip).toHaveAttribute("data-format", "scarlet-violet");
  });

  it("renders a mainline gen scope label (gen-7)", () => {
    render(<ScopeChip format="gen-7" />);
    const chip = screen.getByTestId("scope-chip");
    expect(chip).toHaveTextContent("Gen 7 · USUM");
    expect(chip).toHaveAttribute("data-format", "gen-7");
  });

  it("exposes an explanatory title tied to the resolved scope", () => {
    render(<ScopeChip format="gen-5" />);
    expect(screen.getByTestId("scope-chip")).toHaveAttribute(
      "title",
      "Answers are scoped to Gen 5 · Black/White",
    );
  });
});
