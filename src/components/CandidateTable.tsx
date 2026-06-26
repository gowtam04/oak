"use client";

import type { CandidateTableProps, CandidateRow } from "@/components/types";
import TypeBadge from "@/components/TypeBadge";

/**
 * CandidateTable — renders the `candidates` result set for filter/superlative
 * answers (US-1/2/3).
 *
 * Always shows an honest "N of M" header when `candidates.truncated` is true
 * (the displayed `shown.length` vs. `total_count`).  `onSelect` is optional;
 * when provided, rows are clickable and POST a follow-up for the selected name.
 *
 * Visual styling (grid vs table, column widths, hover states) deferred to
 * `frontend-design`.
 */
export default function CandidateTable({
  candidates,
  onSelect,
}: CandidateTableProps) {
  const { total_count, truncated, shown, sort } = candidates;

  const countLabel = truncated
    ? `Showing ${shown.length} of ${total_count}`
    : `${total_count} result${total_count !== 1 ? "s" : ""}`;

  const hasAbilityColumn = shown.some((row) => row.ability != null);
  const hasKeyStats = shown.some(
    (row) => row.key_stats != null && Object.keys(row.key_stats).length > 0,
  );

  return (
    <div className="candidate-table" data-testid="candidate-table">
      <div className="candidate-table__header">
        <span
          className="candidate-table__count"
          data-testid="candidate-table-count"
        >
          {countLabel}
        </span>
        {sort && (
          <span
            className="candidate-table__sort"
            data-testid="candidate-table-sort"
          >
            sorted by {sort}
          </span>
        )}
      </div>

      <table className="candidate-table__table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Types</th>
            {hasKeyStats && <th scope="col">Stats</th>}
            {hasAbilityColumn && <th scope="col">Ability</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <CandidateRow
              key={`${row.name}-${i}`}
              row={row}
              index={i}
              hasKeyStats={hasKeyStats}
              hasAbilityColumn={hasAbilityColumn}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal row component
// ---------------------------------------------------------------------------

interface CandidateRowProps {
  row: CandidateRow;
  index: number;
  hasKeyStats: boolean;
  hasAbilityColumn: boolean;
  onSelect?: (name: string) => void;
}

function CandidateRow({
  row,
  index,
  hasKeyStats,
  hasAbilityColumn,
  onSelect,
}: CandidateRowProps) {
  const clickable = onSelect != null;

  function handleClick() {
    onSelect?.(row.name);
  }

  return (
    <tr
      className={`candidate-table__row${clickable ? " candidate-table__row--clickable" : ""}`}
      onClick={clickable ? handleClick : undefined}
      data-testid={`candidate-row-${index}`}
    >
      <td className="candidate-table__name-cell">
        {row.sprite_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.sprite_url}
            alt={row.name}
            width={40}
            height={40}
            className="candidate-table__sprite"
          />
        )}
        <span>
          {row.name}
          {row.dex_number != null && (
            <span className="candidate-table__dex"> #{row.dex_number}</span>
          )}
        </span>
      </td>
      <td className="candidate-table__types-cell">
        {row.types.map((type) => (
          <TypeBadge key={type} type={type} />
        ))}
      </td>
      {hasKeyStats && (
        <td className="candidate-table__stats-cell">
          {row.key_stats != null &&
            Object.entries(row.key_stats).map(([k, v]) => (
              <span key={k} className="candidate-table__stat-item">
                {k}: {String(v)}
              </span>
            ))}
        </td>
      )}
      {hasAbilityColumn && (
        <td className="candidate-table__ability-cell">{row.ability ?? "—"}</td>
      )}
    </tr>
  );
}
