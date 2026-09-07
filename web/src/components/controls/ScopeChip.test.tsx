import type { ComponentProps } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
import ScopeChip from "./ScopeChip";
import { CHAMPIONS_REGULATION } from "@/data/formats";

/**
 * jsdom project — fixture props ONLY (never imports db/repos/runtime).
 * Champions-first: the header chip is a display-only current-regulation
 * indicator, not a National Dex / Gens 1–8 / Scarlet-Violet picker.
 */

type ChipProps = ComponentProps<typeof ScopeChip>;

function renderChip(over: Partial<ChipProps> = {}) {
  const props = { format: "champions", ...over } as ChipProps;
  return render(<ScopeChip {...props} />);
}

function chip() {
  return screen.getByTestId("scope-chip");
}

/** "Regulation M-B" → "Reg M-B" (short chip form) or the full constant. */
const REGULATION_RE = new RegExp(
  `${escapeRe(CHAMPIONS_REGULATION)}|${escapeRe(
    CHAMPIONS_REGULATION.replace(/^Regulation\b/, "Reg").trim(),
  )}`,
);

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectNoGameMenu() {
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.queryByRole("menuitemradio")).toBeNull();
  expect(screen.queryByRole("menuitem")).toBeNull();
  expect(screen.queryByTestId("scope-chip-menu")).toBeNull();
  expect(screen.queryByTestId("scope-chip-mru")).toBeNull();
  for (const format of [
    "national-dex",
    "scarlet-violet",
    "gen-1",
    "gen-2",
    "gen-3",
    "gen-4",
    "gen-5",
    "gen-6",
    "gen-7",
    "gen-8",
  ] as const) {
    expect(screen.queryByTestId(`scope-chip-option-${format}`)).toBeNull();
  }
  const body = document.body.textContent ?? "";
  expect(body).not.toMatch(/National Dex/i);
  expect(body).not.toMatch(/Scarlet/i);
  expect(body).not.toMatch(/\bGen [1-9]\b/);
  expect(body).not.toMatch(/Answer scope/i);
}

describe("ScopeChip — regulation display (CF-CHAT-AC-1.2, CF-UI-US-2)", () => {
  it("shows the current Champions regulation name", () => {
    renderChip();
    const el = chip();
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent(REGULATION_RE);
    expect(el).toHaveAttribute("data-format", "champions");
  });

  it("stays on the current regulation even if a non-Champions format is passed (CF-UI-AC-2.1)", () => {
    renderChip({ format: "national-dex" });
    const el = chip();
    expect(el).toHaveTextContent(REGULATION_RE);
    expect(el).not.toHaveTextContent(/National Dex/i);
    expect(el.getAttribute("data-format")).not.toBe("national-dex");
  });

  it("is not a menu of National Dex / Gens 1–8 / Scarlet-Violet (CF-UI-AC-1.1)", () => {
    renderChip();
    expect(chip().getAttribute("aria-haspopup")).not.toBe("menu");
    expectNoGameMenu();
  });

  it("click/tap does not switch games (CF-UI-AC-2.2)", () => {
    const onSelect = vi.fn();
    renderChip({ onSelect });
    fireEvent.click(chip());
    expect(onSelect).not.toHaveBeenCalled();
    expectNoGameMenu();
  });

  it("may expose an informational tooltip/note, not a game switcher (CF-UI-AC-2.2)", () => {
    renderChip();
    const el = chip();
    const hint = [el.getAttribute("title"), el.getAttribute("aria-label")]
      .filter(Boolean)
      .join(" ");
    if (hint.length > 0) {
      expect(hint).not.toMatch(/National Dex/i);
      expect(hint).not.toMatch(/Scarlet/i);
      expect(hint).not.toMatch(/\bGen [1-8]\b/);
    }
    fireEvent.click(el);
    // A short note about the current regulation is allowed; a game list is not.
    expectNoGameMenu();
  });
});
