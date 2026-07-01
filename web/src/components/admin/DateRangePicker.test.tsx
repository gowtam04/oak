import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

import DateRangePicker, {
  defaultRange,
  epochToDateInput,
  dateInputToEpoch,
  RANGE_PRESETS,
} from "./DateRangePicker";
import type { Range } from "@/lib/admin/admin-types";

const DAY_MS = 86_400_000;

// A fixed, deterministic window used by interaction tests. The `to` boundary is
// local midnight on 2026-06-15 so date-input round-trips are exact.
const NOW = new Date(2026, 5, 15).getTime();
const VALUE: Range = { from: NOW - 7 * DAY_MS, to: NOW, bucket: "day" };

describe("defaultRange", () => {
  it("returns the last 7 days at day granularity (ADMIN-BR-8 default)", () => {
    const now = 1_700_000_000_000;
    const r = defaultRange(now);
    expect(r.bucket).toBe("day");
    expect(r.to).toBe(now);
    expect(r.from).toBe(now - 7 * DAY_MS);
  });

  it("uses the current instant when no `now` is supplied", () => {
    const before = Date.now();
    const r = defaultRange();
    const after = Date.now();
    expect(r.to).toBeGreaterThanOrEqual(before);
    expect(r.to).toBeLessThanOrEqual(after);
    expect(r.bucket).toBe("day");
  });
});

describe("date-input epoch helpers", () => {
  it("formats an epoch instant as local YYYY-MM-DD with zero padding", () => {
    expect(epochToDateInput(new Date(2026, 0, 5).getTime())).toBe("2026-01-05");
    expect(epochToDateInput(new Date(2026, 11, 31).getTime())).toBe(
      "2026-12-31",
    );
  });

  it("parses YYYY-MM-DD back to local midnight epoch (round-trip)", () => {
    const ms = new Date(2026, 5, 15).getTime();
    expect(dateInputToEpoch(epochToDateInput(ms))).toBe(ms);
  });

  it("returns null for empty or malformed input (partial edits ignored)", () => {
    expect(dateInputToEpoch("")).toBeNull();
    expect(dateInputToEpoch("2026-6-1")).toBeNull();
    expect(dateInputToEpoch("not-a-date")).toBeNull();
  });
});

describe("DateRangePicker", () => {
  it("renders the from/to inputs and bucket select reflecting `value`", () => {
    render(<DateRangePicker value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByTestId("date-range-from")).toHaveValue(
      epochToDateInput(VALUE.from),
    );
    expect(screen.getByTestId("date-range-to")).toHaveValue(
      epochToDateInput(VALUE.to),
    );
    expect(screen.getByTestId("date-range-bucket")).toHaveValue("day");
  });

  it("renders one button per preset", () => {
    render(<DateRangePicker value={VALUE} onChange={vi.fn()} />);
    for (const preset of RANGE_PRESETS) {
      expect(
        screen.getByTestId(`date-range-preset-${preset.days}`),
      ).toBeInTheDocument();
    }
  });

  it("changing `from` calls onChange with the new from, preserving to + bucket", () => {
    const onChange = vi.fn();
    render(<DateRangePicker value={VALUE} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("date-range-from"), {
      target: { value: "2026-06-01" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      from: new Date(2026, 5, 1).getTime(),
      to: VALUE.to,
      bucket: "day",
    });
  });

  it("changing `to` calls onChange with the new to, preserving from + bucket", () => {
    const onChange = vi.fn();
    render(<DateRangePicker value={VALUE} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("date-range-to"), {
      target: { value: "2026-06-20" },
    });
    expect(onChange).toHaveBeenCalledWith({
      from: VALUE.from,
      to: new Date(2026, 5, 20).getTime(),
      bucket: "day",
    });
  });

  it("does not emit onChange when an input is cleared (partial edit)", () => {
    const onChange = vi.fn();
    render(<DateRangePicker value={VALUE} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("date-range-from"), {
      target: { value: "" },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("changing the bucket calls onChange with the new bucket, preserving from + to", () => {
    const onChange = vi.fn();
    render(<DateRangePicker value={VALUE} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("date-range-bucket"), {
      target: { value: "hour" },
    });
    expect(onChange).toHaveBeenCalledWith({
      from: VALUE.from,
      to: VALUE.to,
      bucket: "hour",
    });
  });

  it("clicking a preset emits a window ending now with the preset's span + bucket", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const onChange = vi.fn();
    render(<DateRangePicker value={VALUE} onChange={onChange} />);

    fireEvent.click(screen.getByTestId("date-range-preset-1"));
    expect(onChange).toHaveBeenLastCalledWith({
      from: NOW - 1 * DAY_MS,
      to: NOW,
      bucket: "hour",
    });

    fireEvent.click(screen.getByTestId("date-range-preset-30"));
    expect(onChange).toHaveBeenLastCalledWith({
      from: NOW - 30 * DAY_MS,
      to: NOW,
      bucket: "day",
    });
  });

  it("marks the matching preset as pressed (the current 7-day/day window)", () => {
    render(<DateRangePicker value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByTestId("date-range-preset-7")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("date-range-preset-1")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("date-range-preset-30")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders preset buttons as keyboard-accessible <button> elements", () => {
    render(<DateRangePicker value={VALUE} onChange={vi.fn()} />);
    const btn = screen.getByTestId("date-range-preset-7");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveAttribute("type", "button");
  });
});
