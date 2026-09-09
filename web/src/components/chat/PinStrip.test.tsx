/**
 * PinStrip — compact jump list of pinned assistant cards (PIN-US-1).
 *
 * Expected props:
 *   pins: { id: string; label: string }[]   // thread order
 *   onJump: (id: string) => void
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());

import PinStrip from "./PinStrip";

const PINS = [
  { id: "a1", label: "Garchomp Speed" },
  { id: "a3", label: "Rain core" },
];

describe("PinStrip (PIN-US-1)", () => {
  it("renders nothing when there are no pins (PIN-AC-1.6)", () => {
    const { container } = render(<PinStrip pins={[]} onJump={vi.fn()} />);
    expect(screen.queryByTestId("pin-strip")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("lists pins in the given thread order, not pin time (PIN-AC-1.2)", () => {
    render(<PinStrip pins={PINS} onJump={vi.fn()} />);
    const strip = screen.getByTestId("pin-strip");
    expect(strip.tagName).not.toBe("");
    const items = within(strip).getAllByRole("link");
    expect(items.map((el) => el.textContent)).toEqual([
      "Garchomp Speed",
      "Rain core",
    ]);
  });

  it("jumps to the card when a pin is activated (PIN-AC-1.1)", () => {
    const onJump = vi.fn();
    render(<PinStrip pins={PINS} onJump={onJump} />);
    fireEvent.click(screen.getByRole("link", { name: "Rain core" }));
    expect(onJump).toHaveBeenCalledWith("a3");
  });

  it("exposes named jump links, not unlabeled icons (a11y)", () => {
    render(<PinStrip pins={PINS} onJump={vi.fn()} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAccessibleName(/.+/);
    }
  });
});
