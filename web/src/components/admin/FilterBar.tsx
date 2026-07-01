"use client";

import { MODELS } from "@/agent/models";
import type {
  TurnFilter,
  TurnKind,
  TurnMode,
  TurnRecordStatus,
} from "@/lib/admin/admin-types";

/**
 * FilterBar — the model / mode / status / kind / search filter controls for the
 * admin turns explorer (ADMIN-AC-5.1).
 *
 * CONTROLLED + STATELESS, mirroring the existing control components
 * (`ChampionsToggle`, `SidebarToggle`): the parent page owns the current filter
 * object and its persistence; this component only renders the controls for the
 * given `value` and reports intent by emitting the FULL next filter object via
 * `onChange`. It holds no internal state.
 *
 * Scope: the time/date dimension is owned by the separate global
 * `DateRangePicker` (ADMIN-BR-8), and `accountId`/`sessionId`/`limit`/`cursor`
 * are wiring the parent supplies — so the value here is the searchable subset of
 * the wire `TurnFilter` ({@link FilterBarValue}). Keeping it a `Pick<TurnFilter,
 * …>` means the shape a page sends to `/api/admin/turns` can never drift from
 * what this bar emits.
 *
 * READ-ONLY (ADMIN-BR-2): every control is a query refinement — nothing here
 * mutates a turn, account, or any server state.
 *
 * Visual styling lives in `admin.css` (`.filter-bar*`); this component only
 * emits BEM class names and `data-testid`s (the codebase convention).
 */

/**
 * The searchable/filterable subset of the wire {@link TurnFilter} that this bar
 * controls. An absent (undefined) field means "no constraint" on that
 * dimension (the API treats it as the un-filtered default).
 */
export type FilterBarValue = Pick<
  TurnFilter,
  "model" | "mode" | "status" | "kind" | "q"
>;

export interface FilterBarProps {
  /** The current filter (controlled). An empty object means "no filters". */
  value: FilterBarValue;
  /** Emits the complete next filter object whenever any control changes. */
  onChange: (next: FilterBarValue) => void;
}

/** Static option lists for the bounded-union dimensions (labels for display). */
const MODE_OPTIONS: { value: TurnMode; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "champions", label: "Champions" },
];

const STATUS_OPTIONS: { value: TurnRecordStatus; label: string }[] = [
  { value: "answered", label: "Answered" },
  { value: "clarification_needed", label: "Clarification needed" },
  { value: "resolution_failed", label: "Resolution failed" },
  { value: "insufficient_data", label: "Insufficient data" },
  { value: "rate_limited", label: "Rate limited" },
];

const KIND_OPTIONS: { value: TurnKind; label: string }[] = [
  { value: "guest", label: "Guest" },
  { value: "signed", label: "Signed-in" },
];

/** A labelled <select> with an "all" (empty-value) option at the top. */
function SelectField({
  testId,
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  testId: string;
  label: string;
  allLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (raw: string) => void;
}) {
  return (
    <label className="filter-bar__field">
      <span className="filter-bar__label">{label}</span>
      <select
        className="filter-bar__select"
        data-testid={testId}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function FilterBar({ value, onChange }: FilterBarProps) {
  // Emit the full next object. An empty raw value ("all" / cleared search)
  // DROPS the dimension so the API sees no constraint there.
  function update<K extends keyof FilterBarValue>(key: K, raw: string) {
    const next: FilterBarValue = { ...value };
    if (raw === "") {
      delete next[key];
    } else {
      next[key] = raw as FilterBarValue[K];
    }
    onChange(next);
  }

  const modelOptions = MODELS.map((m) => ({ value: m.key, label: m.label }));
  const hasAnyFilter = Object.values(value).some(
    (v) => v !== undefined && v !== "",
  );

  return (
    <div className="filter-bar" data-testid="filter-bar">
      <SelectField
        testId="filter-model"
        label="Model"
        allLabel="All models"
        value={value.model ?? ""}
        options={modelOptions}
        onChange={(v) => update("model", v)}
      />
      <SelectField
        testId="filter-mode"
        label="Mode"
        allLabel="All modes"
        value={value.mode ?? ""}
        options={MODE_OPTIONS}
        onChange={(v) => update("mode", v)}
      />
      <SelectField
        testId="filter-status"
        label="Status"
        allLabel="All statuses"
        value={value.status ?? ""}
        options={STATUS_OPTIONS}
        onChange={(v) => update("status", v)}
      />
      <SelectField
        testId="filter-kind"
        label="User"
        allLabel="Guests + signed-in"
        value={value.kind ?? ""}
        options={KIND_OPTIONS}
        onChange={(v) => update("kind", v)}
      />
      <label className="filter-bar__field filter-bar__field--search">
        <span className="filter-bar__label">Search</span>
        <input
          type="search"
          className="filter-bar__search"
          data-testid="filter-search"
          aria-label="Search prompt or answer text"
          placeholder="Search prompt or answer…"
          value={value.q ?? ""}
          onChange={(e) => update("q", e.target.value)}
        />
      </label>
      {hasAnyFilter && (
        <button
          type="button"
          className="filter-bar__clear"
          data-testid="filter-clear"
          onClick={() => onChange({})}
        >
          Clear
        </button>
      )}
    </div>
  );
}
