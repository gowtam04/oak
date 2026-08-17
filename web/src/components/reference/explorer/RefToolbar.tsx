"use client";

/**
 * RefToolbar — the sticky instrument toolbar shared by every reference index
 * explorer: a sunken search field, machined filter-chip groups, a live mono
 * result count (role="status", so screen readers hear "27 RESULTS" as it
 * changes), and a Clear affordance shown only while something is active.
 *
 * Purely presentational — it holds no filter state and runs no matching. The
 * owning explorer drives it entirely through props (query + chip selection +
 * count), so this component is trivially testable and the filter logic lives in
 * one place (useRefFilter).
 */

import type { ChangeEvent } from "react";

export interface ChipOption {
  value: string;
  label: string;
  /** A type slug ("fire") → the chip shows an 8px swatch in that --type-* color. */
  swatch?: string;
}

export interface ChipGroupSpec {
  id: string;
  /** Accessible group label (also the visually-hidden legend). */
  label: string;
  options: ChipOption[];
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
}

export interface RefToolbarProps {
  query: string;
  onQuery: (value: string) => void;
  searchPlaceholder: string;
  groups: ChipGroupSpec[];
  /** The number shown in the count readout. */
  count: number;
  /** Idle noun ("POKÉMON", "MOVES") — shown when nothing is active. */
  noun: string;
  /** Anything active (query or a facet) → the readout reads "N RESULTS". */
  active: boolean;
  onClear: () => void;
}

export default function RefToolbar({
  query,
  onQuery,
  searchPlaceholder,
  groups,
  count,
  noun,
  active,
  onClear,
}: RefToolbarProps) {
  return (
    <div className="ref-toolbar" data-testid="ref-toolbar">
      <div className="ref-toolbar__top">
        <input
          type="search"
          className="ref-toolbar__search"
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onQuery(e.target.value)}
        />
        <span className="ref-toolbar__count" role="status" aria-live="polite">
          {count.toLocaleString()} {active ? "RESULTS" : noun}
        </span>
        {active && (
          <button
            type="button"
            className="ref-toolbar__clear"
            onClick={onClear}
          >
            Clear filters
          </button>
        )}
      </div>

      {groups.length > 0 && (
        <div className="ref-toolbar__facets">
          {groups.map((group) => (
            <div
              key={group.id}
              className="ref-chipgroup"
              role="group"
              aria-label={group.label}
            >
              {group.options.map((opt) => {
                const pressed = group.selected.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className="ref-chip"
                    data-type={opt.swatch}
                    aria-pressed={pressed}
                    onClick={() => group.onToggle(opt.value)}
                  >
                    {opt.swatch && (
                      <span
                        className="ref-chip__swatch"
                        data-type={opt.swatch}
                        aria-hidden="true"
                      />
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
