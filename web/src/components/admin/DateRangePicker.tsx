"use client";

import type { BucketSize, Range } from "@/lib/admin/admin-types";

/**
 * DateRangePicker — the admin panel's global from/to + bucket control
 * (Component Design §5; ADMIN-BR-8 date-range scoping; UI/UX "global date-range
 * picker").
 *
 * It is a pure, CONTROLLED primitive: the owning `/admin` layout holds the
 * canonical {@link Range} state (and threads it to each analytics page's
 * `/api/admin/*` fetch) and re-renders this control with the current `value`.
 * Every interaction is reported through `onChange` — the picker never holds its
 * own copy of the range, so the layout stays the single source of truth.
 *
 * Surfaces three controls, matching the "global and per-view filters
 * (date range … )" interaction pattern:
 *   - two `<input type="date">`s for the window's `from` / `to` boundaries, and
 *   - a `<select>` for the time `bucket` granularity (`day` | `hour`).
 *   - quick presets (Last 24h / 7 days / 30 days) for fast navigation.
 *
 * The DEFAULT window is the last 7 days at `day` granularity — see
 * {@link defaultRange}, which the layout uses to seed its initial state so a
 * fresh `/admin` visit lands on a sensible recent window (ADMIN-BR-8).
 *
 * CLIENT-SAFE: imports only the client-safe `Range` / `BucketSize` wire types
 * from `@/lib/admin/admin-types`; never touches db/repos/runtime (jsdom rule).
 * Visual styling (the `date-range-picker__*` BEM classes) lives in the admin
 * CSS; this file owns structure + behavior only.
 */

/** Milliseconds in one day — used for the preset spans and the default window. */
const DAY_MS = 86_400_000;

/** A quick-select window: a span (in days, back from "now") + its natural bucket. */
export interface RangePreset {
  /** Button label. */
  label: string;
  /** Window span in days, measured back from the current instant. */
  days: number;
  /** The granularity this preset switches the series to. */
  bucket: BucketSize;
}

/**
 * The quick presets, ordered shortest → longest. A 1-day window defaults to
 * `hour` buckets (you want intra-day resolution); wider windows use `day`.
 */
export const RANGE_PRESETS: readonly RangePreset[] = [
  { label: "Last 24h", days: 1, bucket: "hour" },
  { label: "Last 7 days", days: 7, bucket: "day" },
  { label: "Last 30 days", days: 30, bucket: "day" },
];

/**
 * The default analytics window: the last 7 days at `day` granularity
 * (ADMIN-BR-8 "default to a sensible recent window"). `now` is injectable for
 * deterministic tests.
 */
export function defaultRange(now: number = Date.now()): Range {
  return { from: now - 7 * DAY_MS, to: now, bucket: "day" };
}

/** Format an epoch-ms instant as the local `YYYY-MM-DD` an `<input type="date">` expects. */
export function epochToDateInput(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse a `YYYY-MM-DD` date-input value to the epoch ms of LOCAL midnight that
 * day. Returns `null` for an empty/malformed value so the caller can ignore the
 * partial edit (a `<input type="date">` emits "" mid-edit) instead of emitting a
 * `NaN` boundary.
 */
export function dateInputToEpoch(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** True when `value` is (approximately) the window a given preset produces. */
function matchesPreset(value: Range, preset: RangePreset): boolean {
  const spanDays = Math.round((value.to - value.from) / DAY_MS);
  return spanDays === preset.days && value.bucket === preset.bucket;
}

export interface DateRangePickerProps {
  /** The current window (controlled). */
  value: Range;
  /** Reports a new window on any from/to/bucket/preset change. */
  onChange: (next: Range) => void;
}

export default function DateRangePicker({
  value,
  onChange,
}: DateRangePickerProps) {
  function handleFromChange(raw: string) {
    const from = dateInputToEpoch(raw);
    if (from === null) return; // ignore partial/cleared input
    onChange({ ...value, from });
  }

  function handleToChange(raw: string) {
    const to = dateInputToEpoch(raw);
    if (to === null) return;
    onChange({ ...value, to });
  }

  function handleBucketChange(raw: string) {
    const bucket: BucketSize = raw === "hour" ? "hour" : "day";
    onChange({ ...value, bucket });
  }

  function handlePreset(preset: RangePreset) {
    const now = Date.now();
    onChange({ from: now - preset.days * DAY_MS, to: now, bucket: preset.bucket });
  }

  return (
    <div
      className="date-range-picker"
      data-testid="date-range-picker"
      role="group"
      aria-label="Date range"
    >
      <div className="date-range-picker__presets" data-testid="date-range-presets">
        {RANGE_PRESETS.map((preset) => {
          const active = matchesPreset(value, preset);
          return (
            <button
              key={preset.days}
              type="button"
              className="date-range-picker__preset"
              data-testid={`date-range-preset-${preset.days}`}
              aria-pressed={active}
              onClick={() => handlePreset(preset)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <label className="date-range-picker__field">
        <span className="date-range-picker__label">From</span>
        <input
          type="date"
          className="date-range-picker__input"
          data-testid="date-range-from"
          value={epochToDateInput(value.from)}
          onChange={(e) => handleFromChange(e.target.value)}
        />
      </label>

      <label className="date-range-picker__field">
        <span className="date-range-picker__label">To</span>
        <input
          type="date"
          className="date-range-picker__input"
          data-testid="date-range-to"
          value={epochToDateInput(value.to)}
          onChange={(e) => handleToChange(e.target.value)}
        />
      </label>

      <label className="date-range-picker__field">
        <span className="date-range-picker__label">Bucket</span>
        <select
          className="date-range-picker__select"
          data-testid="date-range-bucket"
          value={value.bucket}
          onChange={(e) => handleBucketChange(e.target.value)}
        >
          <option value="day">Day</option>
          <option value="hour">Hour</option>
        </select>
      </label>
    </div>
  );
}
