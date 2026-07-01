"use client";

import type { ReactNode } from "react";

import DataTable, { type Column } from "./DataTable";
import FilterBar, { type FilterBarValue } from "./FilterBar";
import type { TurnRecordStatus, TurnSummary } from "@/lib/admin/admin-types";

/**
 * UsageExplorer — the render half of the admin Usage screen (ADMIN-US-5,
 * ADMIN-AC-5.1): a searchable / filterable / keyset-paginated table of recorded
 * chat turns, with a row click that drills into the per-turn breakdown
 * (`/admin/usage/[id]`, ADMIN-AC-5.2).
 *
 * Deliberately PURE + CONTROLLED (the admin component-test rule): it imports no
 * db/repos/runtime and holds no fetch/network state. The owning thin page
 * (`app/admin/usage/page.tsx`) owns the global date range (`useAdminRange`), the
 * `fetch('/api/admin/turns')` orchestration, the keyset cursor, and routing; it
 * threads everything in as props so this view renders identically from fixtures
 * in jsdom. That keeps the screen's render logic fully testable while the page
 * stays a thin integrator.
 *
 * Composition:
 *   - {@link FilterBar} for model / mode / status / kind / search (ADMIN-AC-5.1).
 *     The date-range dimension is the global header picker (ADMIN-BR-8), not here.
 *   - {@link DataTable} for the turn rows — client-side sortable over the current
 *     page, with a keyset "Load more" affordance and a read-only `onRowClick`
 *     drill-down (ADMIN-BR-2: navigation only, never a mutation).
 *   - An optional `scopeNote` banner surfaces an account/session scope passed
 *     through from a click-through (ADMIN-AC-4.2 / ADMIN-AC-11.2), since those
 *     dimensions live outside the FilterBar.
 *
 * Refs:
 *   - docs/features/admin-panel/architecture/design.md § Component Design §5,
 *     § API Design (`GET /api/admin/turns → TurnsListResponse`; keyset cursor),
 *     § Implementation Phases Phase 7.
 *   - requirements.md ADMIN-US-5, ADMIN-AC-5.1, ADMIN-BR-2/8.
 */

/** Human-readable label per recorded turn status (mirrors the drill-down view). */
const STATUS_LABEL: Record<TurnRecordStatus, string> = {
  answered: "Answered",
  clarification_needed: "Clarification needed",
  resolution_failed: "Resolution failed",
  insufficient_data: "Insufficient data",
  rate_limited: "Rate limited",
};

/** Compact epoch-ms → local datetime; tolerant of a 0/NaN value. */
function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Estimated USD cost to a readable precision (ADMIN-BR-5). */
function formatUsd(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(4)}`;
}

/** Integer with thousands separators; tolerant of nullish. */
function formatInt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
}

/** A single-line prompt preview, collapsed + clipped for the table cell. */
function promptPreview(text: string, max = 80): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed === "") return "—";
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

export interface UsageExplorerProps {
  /** Current FilterBar value (controlled by the page). */
  filter: FilterBarValue;
  /** Emits the full next filter object on any control change. */
  onFilterChange: (next: FilterBarValue) => void;
  /** The turn rows fetched for the current filter/range/page. */
  rows: TurnSummary[];
  /** True while the first page is loading (filter/range change). */
  loading?: boolean;
  /** A transport/HTTP error message, or null when healthy. */
  error?: string | null;
  /** True when another keyset page is available. */
  hasMore?: boolean;
  /** Invoked when "Load more" is activated. */
  onLoadMore?: () => void;
  /** True while a load-more fetch is in flight. */
  loadingMore?: boolean;
  /** Read-only drill-down navigation: open a turn's detail (never a mutation). */
  onRowClick?: (turn: TurnSummary) => void;
  /**
   * Optional banner describing an out-of-FilterBar scope (e.g. "account X" /
   * "session Y") applied to the fetch via a click-through (ADMIN-AC-4.2/11.2).
   */
  scopeNote?: ReactNode;
}

export default function UsageExplorer({
  filter,
  onFilterChange,
  rows,
  loading = false,
  error = null,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  onRowClick,
  scopeNote,
}: UsageExplorerProps) {
  const columns: Column<TurnSummary>[] = [
    {
      key: "created",
      header: "Time",
      sortValue: (r) => r.createdAt,
      render: (r) => (
        <span className="usage-explorer__time">{formatTimestamp(r.createdAt)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      render: (r) => (
        <span
          className="usage-explorer__status"
          data-status={r.status}
          data-testid={`usage-status-${r.id}`}
        >
          {STATUS_LABEL[r.status]}
        </span>
      ),
    },
    {
      key: "user",
      header: "User",
      sortValue: (r) => r.accountEmail ?? "￿", // guests sort last
      render: (r) =>
        r.accountEmail ?? (r.accountId ? r.accountId : "Guest"),
    },
    {
      key: "model",
      header: "Model",
      sortValue: (r) => r.model ?? "￿",
      render: (r) => r.model ?? "—",
    },
    {
      key: "mode",
      header: "Mode",
      sortValue: (r) => r.mode,
      render: (r) => r.mode,
    },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      sortValue: (r) => r.inputTokens + r.outputTokens + r.thinkingTokens,
      render: (r) =>
        formatInt(r.inputTokens + r.outputTokens + r.thinkingTokens),
    },
    {
      key: "cost",
      header: "Est. cost",
      align: "right",
      sortValue: (r) => r.estUsd,
      render: (r) => formatUsd(r.estUsd),
    },
    {
      key: "latency",
      header: "Latency",
      align: "right",
      sortValue: (r) => r.turnLatencyMs,
      render: (r) => `${formatInt(r.turnLatencyMs)} ms`,
    },
    {
      key: "prompt",
      header: "Prompt",
      sortValue: (r) => r.promptText.toLowerCase(),
      render: (r) => (
        <span className="usage-explorer__prompt" title={r.promptText}>
          {promptPreview(r.promptText)}
        </span>
      ),
    },
  ];

  const emptyMessage = loading
    ? "Loading turns…"
    : error
      ? "Could not load turns."
      : "No turns match these filters.";

  return (
    <section className="admin-page usage-explorer" data-testid="usage-explorer">
      <h1 className="admin-page__title">Usage</h1>

      {scopeNote != null && scopeNote !== "" && (
        <div
          className="usage-explorer__scope"
          data-testid="usage-explorer-scope"
          style={{
            padding: "var(--space-2, 8px) var(--space-3, 12px)",
            border: "1px solid var(--border, #e9e0d8)",
            borderRadius: "var(--radius-md, 8px)",
            background: "var(--surface-sunken, #f5efe8)",
            color: "var(--text-muted, #6e625a)",
            fontSize: "var(--text-sm, 13px)",
          }}
        >
          {scopeNote}
        </div>
      )}

      <FilterBar value={filter} onChange={onFilterChange} />

      {error != null && error !== "" && (
        <div
          className="usage-explorer__error"
          data-testid="usage-explorer-error"
          role="alert"
          style={{
            padding: "var(--space-3, 12px) var(--space-4, 16px)",
            border: "1px solid var(--danger, #ee5a5a)",
            borderRadius: "var(--radius-md, 8px)",
            color: "var(--danger, #ee5a5a)",
            fontSize: "var(--text-sm, 13px)",
          }}
        >
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
        initialSort={{ key: "created", dir: "desc" }}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        loadingMore={loadingMore}
        emptyMessage={emptyMessage}
        caption="Recorded chat turns"
      />
    </section>
  );
}
