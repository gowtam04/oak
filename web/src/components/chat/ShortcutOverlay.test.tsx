/**
 * ShortcutOverlay — web `?` / Account chord list (NAV-US-2, ADR-15).
 *
 * Expected props:
 *   open: boolean
 *   onClose: () => void
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import ShortcutOverlay from "./ShortcutOverlay";

const ACTIONS = [
  /palette/i,
  /new chat/i,
  /focus composer/i,
  /stop/i,
  /history search/i,
  /pin(\/unpin)? conversation/i,
];

const CHORDS = [
  /⌘\s*K|Ctrl\+K/i,
  /⌘⇧O|Ctrl\+Shift\+O/i,
  /⌘⇧J|Ctrl\+Shift\+J/i,
  /⌘\.|Ctrl\+\./i,
  /⌘⇧F|Ctrl\+Shift\+F/i,
  /⌘⇧P|Ctrl\+Shift\+P/i,
];

describe("ShortcutOverlay (NAV-US-2, ADR-15)", () => {
  it("renders nothing when closed", () => {
    render(<ShortcutOverlay open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId("shortcut-overlay")).toBeNull();
  });

  it("lists the documented daily-chat actions (NAV-AC-2.1, NAV-AC-2.2)", () => {
    render(<ShortcutOverlay open onClose={vi.fn()} />);
    const overlay = screen.getByTestId("shortcut-overlay");
    expect(overlay).toBeInTheDocument();
    for (const action of ACTIONS) {
      expect(overlay).toHaveTextContent(action);
    }
    expect(overlay).not.toHaveTextContent(/scope picker/i);
    expect(overlay.textContent).not.toMatch(/⌘⇧S|Ctrl\+Shift\+S/i);
  });

  it("documents macOS and other-desktop chords from ADR-15", () => {
    render(<ShortcutOverlay open onClose={vi.fn()} />);
    const overlay = screen.getByTestId("shortcut-overlay");
    for (const chord of CHORDS) {
      expect(overlay.textContent).toMatch(chord);
    }
  });

  it("closes from the overlay", () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay open onClose={onClose} />);
    const closer =
      screen.queryByRole("button", { name: /close/i }) ??
      screen.getByTestId("shortcut-overlay");
    fireEvent.click(closer);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
