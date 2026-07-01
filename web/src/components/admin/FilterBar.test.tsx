import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import FilterBar, { type FilterBarValue } from "./FilterBar";
import { MODELS } from "@/agent/models";

function setup(value: FilterBarValue = {}) {
  const onChange = vi.fn();
  render(<FilterBar value={value} onChange={onChange} />);
  return { onChange };
}

describe("FilterBar", () => {
  it("renders the bar and all five filter controls", () => {
    setup();
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
    expect(screen.getByTestId("filter-model")).toBeInTheDocument();
    expect(screen.getByTestId("filter-mode")).toBeInTheDocument();
    expect(screen.getByTestId("filter-status")).toBeInTheDocument();
    expect(screen.getByTestId("filter-kind")).toBeInTheDocument();
    expect(screen.getByTestId("filter-search")).toBeInTheDocument();
  });

  it("renders one model option per registry entry, plus an 'all' option", () => {
    setup();
    // every model label from the registry is present as an option…
    for (const m of MODELS) {
      expect(screen.getByRole("option", { name: m.label })).toBeInTheDocument();
    }
    // …plus the un-filtered default.
    expect(
      screen.getByRole("option", { name: "All models" }),
    ).toBeInTheDocument();
  });

  it("reflects the controlled value on every control", () => {
    setup({
      model: "claude",
      mode: "champions",
      status: "resolution_failed",
      kind: "guest",
      q: "garchomp",
    });
    expect(
      (screen.getByTestId("filter-model") as HTMLSelectElement).value,
    ).toBe("claude");
    expect((screen.getByTestId("filter-mode") as HTMLSelectElement).value).toBe(
      "champions",
    );
    expect(
      (screen.getByTestId("filter-status") as HTMLSelectElement).value,
    ).toBe("resolution_failed");
    expect((screen.getByTestId("filter-kind") as HTMLSelectElement).value).toBe(
      "guest",
    );
    expect(
      (screen.getByTestId("filter-search") as HTMLInputElement).value,
    ).toBe("garchomp");
  });

  it("emits the full filter object with the chosen model", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByTestId("filter-model"), {
      target: { value: "grok-4.3" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ model: "grok-4.3" });
  });

  it("emits the chosen mode / status / kind", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByTestId("filter-mode"), {
      target: { value: "champions" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ mode: "champions" });

    fireEvent.change(screen.getByTestId("filter-status"), {
      target: { value: "insufficient_data" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ status: "insufficient_data" });

    fireEvent.change(screen.getByTestId("filter-kind"), {
      target: { value: "signed" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "signed" });
  });

  it("emits the search text via onChange", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByTestId("filter-search"), {
      target: { value: "trick room" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ q: "trick room" });
  });

  it("merges a new dimension into the existing filter, preserving the rest", () => {
    const { onChange } = setup({ status: "answered", q: "tera" });
    fireEvent.change(screen.getByTestId("filter-model"), {
      target: { value: "claude" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      status: "answered",
      q: "tera",
      model: "claude",
    });
  });

  it("selecting the 'all' option drops that dimension from the emitted filter", () => {
    const { onChange } = setup({ model: "claude", kind: "guest" });
    fireEvent.change(screen.getByTestId("filter-model"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "guest" });
  });

  it("clearing the search drops `q`", () => {
    const { onChange } = setup({ q: "garchomp", model: "grok-4.3" });
    fireEvent.change(screen.getByTestId("filter-search"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ model: "grok-4.3" });
  });

  it("hides the Clear button when no filter is active", () => {
    setup({});
    expect(screen.queryByTestId("filter-clear")).toBeNull();
  });

  it("shows the Clear button when a filter is active and resets to an empty filter", () => {
    const { onChange } = setup({ model: "claude" });
    const clear = screen.getByTestId("filter-clear");
    expect(clear).toBeInTheDocument();
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("renders selects as native <select> elements (keyboard-accessible)", () => {
    setup();
    expect(screen.getByTestId("filter-model").tagName).toBe("SELECT");
    expect(screen.getByTestId("filter-search").tagName).toBe("INPUT");
  });
});
