"use client";

import DataTable, { type Column } from "./DataTable";
import KpiCard, { type KpiTone } from "./KpiCard";
import type {
  ErrorCategory,
  ErrorCategoryKey,
  ErrorsResponse,
  Range,
} from "@/lib/admin/admin-types";

/**
 * ErrorsView — the presentational body of the admin Errors & Failures screen
 * (ADMIN-US-4, ADMIN-AC-4.1/4.2; ADMIN-BR-9 failure taxonomy; ADMIN-BR-8
 * date-range scoping). It renders the data fetched by `app/admin/errors/page.tsx`
 * from `GET /api/admin/errors` ({@link ErrorsResponse}) and owns ALL testable
 * render logic — the page itself is a thin client shell that does the fetch,
 * because the jsdom component project only scans `src/components/**` (CLAUDE.md
 * test-placement rule). This component therefore takes the resolved payload as
 * props and never imports db/repos/runtime.
 *
 * What it shows (ADMIN-AC-4.1 — "counts and rates of: non-`answered` turn
 * outcomes, tool errors, OTP delivery failures, and rate-limit rejections"):
 *   - A KPI row: total turns over the range (the rate denominator), the combined
 *     non-`answered` failure rate, and the rate-limit rejection count.
 *   - A complete breakdown table — one row per category in the canonical
 *     {@link CATEGORY_ORDER}, with its count and rate% — so EVERY taxonomy
 *     category is shown even at zero (a "no tool errors" reading is informative).
 *
 * Click-through (ADMIN-AC-4.2 — "view the underlying individual turns/events"):
 * each category name is a link into the Usage turns explorer, built by
 * {@link usageHrefForCategory}. Status-keyed categories seed the explorer's
 * `status` filter; every link carries the current `from`/`to` so the explorer
 * lands on the same window (ADMIN-BR-8). See {@link usageHrefForCategory} for the
 * `tool_error` / `otp_email_failed` caveat.
 *
 * READ-ONLY (ADMIN-BR-2): the only interactions are navigation links and the
 * shared `DataTable`'s client-side sort — nothing here mutates any state.
 *
 * CLIENT-SAFE: imports only client-safe wire types + sibling client primitives.
 */

/** Human-readable label for each failure category (ADMIN-BR-9 taxonomy). */
export const CATEGORY_LABELS: Record<ErrorCategoryKey, string> = {
  resolution_failed: "Resolution failed",
  clarification_needed: "Clarification needed",
  insufficient_data: "Insufficient data",
  tool_error: "Tool errors",
  otp_email_failed: "OTP delivery failures",
  rate_limited: "Rate-limit rejections",
};

/** One-line description giving each category context in the breakdown table. */
export const CATEGORY_DESCRIPTIONS: Record<ErrorCategoryKey, string> = {
  resolution_failed: "Entity resolution failed — Oak couldn't resolve what was asked.",
  clarification_needed: "Oak asked the user to clarify rather than answering.",
  insufficient_data: "Oak lacked the data to answer with confidence.",
  tool_error: "A tool call inside the turn errored (turn may still have answered).",
  otp_email_failed: "An OTP sign-in code failed to deliver (auth event).",
  rate_limited: "A request was rejected before running by the per-session limit.",
};

/**
 * Canonical display order: the three non-`answered` turn statuses first, then
 * the orthogonal categories (tool errors, OTP failures), then rate-limit
 * rejections. Driving the table off this order (rather than the response's array
 * order) keeps the render deterministic and guarantees every category appears.
 */
export const CATEGORY_ORDER: readonly ErrorCategoryKey[] = [
  "resolution_failed",
  "clarification_needed",
  "insufficient_data",
  "tool_error",
  "otp_email_failed",
  "rate_limited",
];

/**
 * The categories whose key is also a recorded {@link
 * import("@/lib/admin/admin-types").TurnRecordStatus} — these map cleanly to the
 * turns explorer's `status` filter. `tool_error` (orthogonal to status — a tool
 * can error on an otherwise-answered turn) and `otp_email_failed` (an
 * `auth_event`, not a turn) have no `status` filter, so their link opens the
 * range-scoped explorer unfiltered; the turns explorer surfaces tool-error
 * counts there. This is the closest drill-down the frozen `TurnFilter`
 * dimensions allow (ADMIN-AC-4.2, best-effort for the two non-status keys).
 */
const STATUS_CATEGORY_KEYS: ReadonlySet<ErrorCategoryKey> = new Set<ErrorCategoryKey>([
  "resolution_failed",
  "clarification_needed",
  "insufficient_data",
  "rate_limited",
]);

/**
 * Build the click-through URL into the Usage turns explorer for a failure
 * category, carrying the current window so the explorer scopes to the same
 * range (ADMIN-BR-8). Status-keyed categories also seed the explorer's `status`
 * filter (ADMIN-AC-4.2). Exported for direct unit testing.
 */
export function usageHrefForCategory(key: ErrorCategoryKey, range: Range): string {
  const params = new URLSearchParams();
  if (STATUS_CATEGORY_KEYS.has(key)) params.set("status", key);
  params.set("from", String(range.from));
  params.set("to", String(range.to));
  return `/admin/usage?${params.toString()}`;
}

/** Tone the failure-rate KPI: a louder color as the rate climbs. */
function rateTone(pct: number): KpiTone {
  if (pct >= 10) return "danger";
  if (pct >= 2) return "warn";
  return "default";
}

/** Locale-grouped integer (e.g. 1,284). */
function formatInt(n: number): string {
  return n.toLocaleString();
}

/** A rate to one decimal place with a trailing percent sign. */
function formatPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

export interface ErrorsViewProps {
  /** The resolved `GET /api/admin/errors` payload; null while loading / on error. */
  data: ErrorsResponse | null;
  /** True while the initial (or range-change) fetch is in flight. */
  loading?: boolean;
  /** A transport/HTTP error message to surface in place of the data, if any. */
  error?: string | null;
}

export default function ErrorsView({
  data,
  loading = false,
  error = null,
}: ErrorsViewProps) {
  return (
    <div className="admin-page" data-testid="errors-view">
      <h1 className="admin-page__title">Errors &amp; failures</h1>

      {error != null && error !== "" ? (
        <div className="admin-page__error" role="alert" data-testid="errors-error">
          {error}
        </div>
      ) : loading && data === null ? (
        <div className="admin-page__loading" data-testid="errors-loading">
          Loading…
        </div>
      ) : data === null ? (
        <div className="admin-page__loading" data-testid="errors-empty">
          No data.
        </div>
      ) : (
        <ErrorsContent data={data} />
      )}
    </div>
  );
}

/** The loaded body — KPIs + the full per-category breakdown table. */
function ErrorsContent({ data }: { data: ErrorsResponse }) {
  const { totalTurns, range } = data;

  // Index the response's categories by key so we can render the canonical order
  // (defaulting any absent category to a zero row — ADMIN-AC-4.1 wants every
  // category shown, and "no failures of this kind" is itself a useful reading).
  const byKey = new Map<ErrorCategoryKey, ErrorCategory>();
  for (const c of data.categories) byKey.set(c.key, c);

  const rows: ErrorCategory[] = CATEGORY_ORDER.map(
    (key) => byKey.get(key) ?? { key, count: 0, ratePct: 0 },
  );

  // Combined non-`answered` failures: the three turn-status outcomes are
  // mutually exclusive (a turn has exactly one status), so summing their counts
  // is sound (ADMIN-BR-9). tool_error / otp_email_failed are orthogonal and not
  // folded in here — they have their own rows below.
  const failedCount =
    countOf(byKey, "resolution_failed") +
    countOf(byKey, "clarification_needed") +
    countOf(byKey, "insufficient_data");
  const failedRatePct = totalTurns > 0 ? (failedCount / totalTurns) * 100 : 0;
  const rateLimited = countOf(byKey, "rate_limited");

  const columns: Column<ErrorCategory>[] = [
    {
      key: "category",
      header: "Category",
      render: (row) => (
        <a
          className="errors-table__category-link"
          href={usageHrefForCategory(row.key, range)}
          data-testid={`errors-category-link-${row.key}`}
        >
          <span className="errors-table__category-name">
            {CATEGORY_LABELS[row.key]}
          </span>
          <span className="errors-table__category-desc">
            {CATEGORY_DESCRIPTIONS[row.key]}
          </span>
        </a>
      ),
    },
    {
      key: "count",
      header: "Count",
      align: "right",
      sortValue: (row) => row.count,
      render: (row) => (
        <span data-testid={`errors-count-${row.key}`}>{formatInt(row.count)}</span>
      ),
    },
    {
      key: "ratePct",
      header: "Rate",
      align: "right",
      sortValue: (row) => row.ratePct,
      render: (row) => (
        <span data-testid={`errors-rate-${row.key}`}>{formatPct(row.ratePct)}</span>
      ),
    },
  ];

  return (
    <>
      <div className="admin-kpi-grid" data-testid="errors-kpis">
        <KpiCard
          label="Total turns"
          value={formatInt(totalTurns)}
          hint="Denominator for the rates below"
        />
        <KpiCard
          label="Failed turns"
          value={formatInt(failedCount)}
          hint={`${formatPct(failedRatePct)} of turns · non-answered outcomes`}
          tone={rateTone(failedRatePct)}
        />
        <KpiCard
          label="Rate-limit rejections"
          value={formatInt(rateLimited)}
          hint="Requests rejected before running"
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        initialSort={{ key: "count", dir: "desc" }}
        caption="Failures by category (click a category to inspect its turns)"
        emptyMessage="No failure categories."
        className="errors-table"
      />

      {totalTurns === 0 && (
        <p className="admin-page__note" data-testid="errors-no-turns">
          No turns were recorded in this range, so all rates are 0%.
        </p>
      )}
    </>
  );
}

/** Count for a category key, or 0 when the response omitted it. */
function countOf(
  byKey: Map<ErrorCategoryKey, ErrorCategory>,
  key: ErrorCategoryKey,
): number {
  return byKey.get(key)?.count ?? 0;
}
