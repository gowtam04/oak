import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import Composer from "./Composer";
import type { ComposerProps } from "./types";

/** Minimal props with sensible defaults; override per test. */
function props(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    onSend: () => {},
    ...overrides,
  };
}

describe("Composer — send / stop button swap", () => {
  it("renders the Send button (not Stop) when not streaming", () => {
    render(<Composer {...props()} />);
    expect(screen.getByTestId("composer-send")).toBeInTheDocument();
    expect(screen.queryByTestId("composer-stop")).not.toBeInTheDocument();
  });

  it("renders a Stop button (not Send) while streaming", () => {
    render(<Composer {...props({ streaming: true })} />);
    expect(screen.getByTestId("composer-stop")).toBeInTheDocument();
    expect(screen.queryByTestId("composer-send")).not.toBeInTheDocument();
  });

  it("calls onStop when the Stop button is clicked", () => {
    const onStop = vi.fn();
    render(<Composer {...props({ streaming: true, onStop })} />);
    fireEvent.click(screen.getByTestId("composer-stop"));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("the Stop button is clickable even when disabled is true (input frozen)", () => {
    // While streaming, the input is disabled but Stop must stay actionable.
    const onStop = vi.fn();
    render(
      <Composer {...props({ streaming: true, disabled: true, onStop })} />,
    );
    const stop = screen.getByTestId("composer-stop");
    expect(stop).not.toBeDisabled();
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe("Composer — submit + prefill", () => {
  it("sends a trimmed message and clears the input on submit", () => {
    const onSend = vi.fn();
    render(<Composer {...props({ onSend })} />);
    const input = screen.getByTestId("composer-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Garchomp speed?  " } });
    fireEvent.submit(screen.getByTestId("composer"));
    expect(onSend).toHaveBeenCalledWith("Garchomp speed?");
    expect(input.value).toBe("");
  });

  it("loads a fresh prefill object's text into the input", () => {
    const { rerender } = render(<Composer {...props({ prefill: null })} />);
    const input = screen.getByTestId("composer-input") as HTMLInputElement;
    expect(input.value).toBe("");
    rerender(<Composer {...props({ prefill: { text: "Which Fire-types?" } })} />);
    expect(input.value).toBe("Which Fire-types?");
  });

  it("re-applies the same text when a new prefill object identity arrives", () => {
    const { rerender } = render(
      <Composer {...props({ prefill: { text: "redo me" } })} />,
    );
    const input = screen.getByTestId("composer-input") as HTMLInputElement;
    expect(input.value).toBe("redo me");
    // User edits the field away…
    fireEvent.change(input, { target: { value: "edited" } });
    expect(input.value).toBe("edited");
    // …a brand-new prefill object with the same text reloads it (identity change).
    rerender(<Composer {...props({ prefill: { text: "redo me" } })} />);
    expect(input.value).toBe("redo me");
  });
});
