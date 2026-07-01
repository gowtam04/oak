"use client";

import { useMemo, useState, type ReactNode } from "react";

/**
 * DataTable — the admin panel's shared, generic, READ-ONLY table primitive
 * (design.md § Component Design › 5: a shared admin primitive rendered by every
 * list screen — turns, accounts, conversations, teams, heavy users).
 *
 * It is deliberately presentation-only:
 *   - Sorting is CLIENT-SIDE over the rows already on screen (a column opts in by
 *     supplying `sortValue`). It never re-queries — the parent owns fetching.
 *   - Pagination is a keyset "Load more" affordance (design.md API Design:
 *     keyset cursor on `(created_at, id)`). The cursor itself lives in the parent;
 *     this component only surfaces the button when `hasMore` and calls
 *     `onLoadMore`.
 *   - There are NO mutating row controls (ADMIN-BR-2 read-only): the only
 *     interactions are sort (reorders the view), load-more (fetches more rows),
 *     and an OPTIONAL `onRowClick` used purely for read-only drill-down
 *     navigation (e.g. open a turn's detail). Nothing here edits, deletes, or
 *     otherwise changes data.
 *
 * Generic over the row type so each screen passes its own `admin-types` row
 * (`TurnSummary`, `AccountWithActivity`, …) plus column descriptors.
 */

/** Direction of a client-side sort. */
export type SortDir = "asc" | "desc";

/** The active client-side sort: a column `key` + direction (null = unsorted). */
export interface SortState {
  key: string;
  dir: SortDir;
}

/**
 * A single column descriptor.
 *
 * - `render` controls the cell body; when omitted the cell falls back to the
 *   row's own value at `key` (stringified). Computed/joined columns supply
 *   `render` and may use a `key` that is not a row field.
 * - `sortValue` opts the column into client-side sorting. Returning a number
 *   sorts numerically; anything else sorts by locale string compare; null/
 *   undefined always sort to the end. A column with no `sortValue` is not
 *   sortable (its header is plain text, not a button).
 */
export interface Column<Row> {
  /** Stable identity for the column — React key, default cell accessor, sort id. */
  key: string;
  /** Header label (string or node). */
  header: ReactNode;
  /** Cell renderer. Defaults to `String(row[key] ?? "")`. */
  render?: (row: Row) => ReactNode;
  /** Supply to make the column sortable; returns the comparable value. */
  sortValue?: (row: Row) => number | string | null | undefined;
  /** Cell/header text alignment. */
  align?: "left" | "right" | "center";
  /** Optional fixed column width (any CSS length). */
  width?: string;
}

export interface DataTableProps<Row> {
  /** Column descriptors, in display order. */
  columns: Column<Row>[];
  /** The rows currently fetched by the parent. */
  rows: Row[];
  /** Stable per-row key (e.g. `(r) => r.id`). */
  rowKey: (row: Row) => string;
  /** Optional READ-ONLY row click — drill-down navigation only, never a mutation. */
  onRowClick?: (row: Row) => void;
  /** Initial client-side sort (must reference a sortable column's `key`). */
  initialSort?: SortState;
  /** True when the parent has another keyset page to fetch. */
  hasMore?: boolean;
  /** Invoked when the "Load more" affordance is activated. */
  onLoadMore?: () => void;
  /** True while a load-more fetch is in flight (disables the button). */
  loadingMore?: boolean;
  /** Shown in place of the body when `rows` is empty. */
  emptyMessage?: ReactNode;
  /** Optional accessible table caption. */
  caption?: string;
  /** Extra className on the wrapper. */
  className?: string;
}

/** nulls-last, numbers numeric, everything else locale string compare. */
function compareValues(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
): number {
  const aNull = a == null;
  const bNull = b == null;
  if (aNull && bNull) return 0;
  if (aNull) return 1; // a sorts after b
  if (bNull) return -1; // b sorts after a
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export default function DataTable<Row,>({
  columns,
  rows,
  rowKey,
  onRowClick,
  initialSort,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  emptyMessage = "No rows.",
  caption,
  className,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);

  const sortableByKey = useMemo(() => {
    const m = new Map<string, (row: Row) => number | string | null | undefined>();
    for (const c of columns) if (c.sortValue) m.set(c.key, c.sortValue);
    return m;
  }, [columns]);

  // Sorted view of the current page. A stable sort keeps the parent's fetch order
  // for ties (and is a no-op when no sortable column is active).
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const accessor = sortableByKey.get(sort.key);
    if (!accessor) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) => dir * compareValues(accessor(a), accessor(b)),
    );
  }, [rows, sort, sortableByKey]);

  function toggleSort(key: string) {
    if (!sortableByKey.has(key)) return;
    setSort((prev) =>
      prev && prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  const hasRows = sortedRows.length > 0;

  return (
    <div
      className={`admin-table${className ? ` ${className}` : ""}`}
      data-testid="admin-data-table"
    >
      <div className="admin-table__scroll">
        <table className="admin-table__table">
          {caption && <caption className="admin-table__caption">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((col) => {
                const sortable = sortableByKey.has(col.key);
                const active = sort?.key === col.key;
                const ariaSort: "ascending" | "descending" | "none" = active
                  ? sort!.dir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none";
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={`admin-table__th${
                      col.align ? ` admin-table__th--${col.align}` : ""
                    }${sortable ? " admin-table__th--sortable" : ""}`}
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={sortable ? ariaSort : undefined}
                    data-testid={`admin-th-${col.key}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className="admin-table__sort-btn"
                        onClick={() => toggleSort(col.key)}
                        data-testid={`admin-sort-${col.key}`}
                      >
                        <span className="admin-table__th-label">{col.header}</span>
                        <span
                          className="admin-table__sort-indicator"
                          aria-hidden="true"
                          data-testid={`admin-sort-indicator-${col.key}`}
                        >
                          {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      <span className="admin-table__th-label">{col.header}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {hasRows ? (
              sortedRows.map((row) => {
                const key = rowKey(row);
                const clickable = onRowClick != null;
                return (
                  <tr
                    key={key}
                    className={`admin-table__row${
                      clickable ? " admin-table__row--clickable" : ""
                    }`}
                    onClick={clickable ? () => onRowClick!(row) : undefined}
                    data-testid={`admin-row-${key}`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`admin-table__td${
                          col.align ? ` admin-table__td--${col.align}` : ""
                        }`}
                        data-testid={`admin-cell-${key}-${col.key}`}
                      >
                        {col.render
                          ? col.render(row)
                          : defaultCell(row, col.key)}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr className="admin-table__row admin-table__row--empty">
                <td
                  className="admin-table__empty"
                  colSpan={columns.length || 1}
                  data-testid="admin-table-empty"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="admin-table__footer">
          <button
            type="button"
            className="admin-table__load-more"
            onClick={onLoadMore}
            disabled={loadingMore}
            data-testid="admin-table-load-more"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Default cell body: the row's own value at `key`, stringified (null → ""). */
function defaultCell<Row>(row: Row, key: string): ReactNode {
  const v = (row as Record<string, unknown>)[key];
  return v == null ? "" : String(v);
}
