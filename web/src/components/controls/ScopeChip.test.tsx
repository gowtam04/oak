import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
import ScopeChip from "./ScopeChip";
import { FORMATS } from "@/data/formats";
import { scopeLabelShort } from "@/lib/scope/scope-label";

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

  describe("interactive (onSelect provided)", () => {
    it("renders a button rather than the plain display-only span", () => {
      render(<ScopeChip format="champions" onSelect={vi.fn()} />);
      const chip = screen.getByTestId("scope-chip");
      expect(chip.tagName).toBe("BUTTON");
      expect(chip).toHaveAttribute("aria-haspopup", "menu");
      expect(chip).toHaveAttribute("aria-expanded", "false");
    });

    it("opens a menu listing all six formats on click, each as a two-line row", () => {
      render(<ScopeChip format="champions" onSelect={vi.fn()} />);
      fireEvent.click(screen.getByTestId("scope-chip"));
      const menu = screen.getByTestId("scope-chip-menu");
      expect(menu).toBeInTheDocument();
      // Header instrument label.
      expect(menu).toHaveTextContent("Answer scope");
      for (const f of FORMATS) {
        // Row shows the short name…
        expect(screen.getByTestId(`scope-chip-option-${f}`)).toHaveTextContent(
          scopeLabelShort(f),
        );
      }
    });

    it("each row carries a one-line description under the name", () => {
      render(<ScopeChip format="champions" onSelect={vi.fn()} />);
      fireEvent.click(screen.getByTestId("scope-chip"));
      // A representative sample of the per-scope descriptions.
      expect(
        screen.getByTestId("scope-chip-option-gen-7"),
      ).toHaveTextContent("Ultra Sun / Ultra Moon");
      expect(
        screen.getByTestId("scope-chip-option-gen-8"),
      ).toHaveTextContent("Sword / Shield");
      // Champions rides the live regulation constant.
      expect(
        screen.getByTestId("scope-chip-option-champions"),
      ).toHaveTextContent("Regulation");
    });

    it("marks the current scope's row as checked (the red-rail selection)", () => {
      render(<ScopeChip format="gen-7" onSelect={vi.fn()} />);
      fireEvent.click(screen.getByTestId("scope-chip"));
      expect(screen.getByTestId("scope-chip-option-gen-7")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(
        screen.getByTestId("scope-chip-option-champions"),
      ).toHaveAttribute("aria-checked", "false");
    });

    it("honors a custom testId so a second instance stays uniquely queryable", () => {
      render(
        <ScopeChip format="champions" onSelect={vi.fn()} testId="scope-chip-hero" />,
      );
      const chip = screen.getByTestId("scope-chip-hero");
      expect(chip.tagName).toBe("BUTTON");
      fireEvent.click(chip);
      expect(screen.getByTestId("scope-chip-hero-menu")).toBeInTheDocument();
      expect(
        screen.getByTestId("scope-chip-hero-option-gen-5"),
      ).toBeInTheDocument();
      // The default testid is NOT present for this instance.
      expect(screen.queryByTestId("scope-chip")).toBeNull();
    });

    it("picking an option fires onSelect and closes the menu", () => {
      const onSelect = vi.fn();
      render(<ScopeChip format="champions" onSelect={onSelect} />);
      fireEvent.click(screen.getByTestId("scope-chip"));
      fireEvent.click(screen.getByTestId("scope-chip-option-gen-5"));
      expect(onSelect).toHaveBeenCalledWith("gen-5");
      expect(screen.queryByTestId("scope-chip-menu")).not.toBeInTheDocument();
    });

    it("disabled prevents opening the menu", () => {
      render(<ScopeChip format="champions" onSelect={vi.fn()} disabled />);
      const chip = screen.getByTestId("scope-chip");
      expect(chip).toBeDisabled();
      fireEvent.click(chip);
      expect(screen.queryByTestId("scope-chip-menu")).not.toBeInTheDocument();
    });

    it("Escape closes the menu", () => {
      render(<ScopeChip format="champions" onSelect={vi.fn()} />);
      fireEvent.click(screen.getByTestId("scope-chip"));
      expect(screen.getByTestId("scope-chip-menu")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByTestId("scope-chip-menu")).not.toBeInTheDocument();
    });
  });
});
