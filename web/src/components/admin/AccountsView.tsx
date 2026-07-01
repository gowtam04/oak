"use client";

import DataTable, { type Column } from "./DataTable";
import type { AccountSort, AccountWithActivity } from "@/lib/admin/admin-types";

/**
 * AccountsView — the render half of the admin Accounts screen
 * (`/admin/accounts`, ADMIN-US-8 view-only + ADMIN-US-11 heavy users).
 *
 * A searchable, server-sorted, keyset-paginated table of every account with its
 * DERIVED activity (turns, last-active, total tokens, estimated cost, saved
 * conversation/team counts, plus the rate-limited / failed counters that surface
 * misuse — ADMIN-AC-8.1/8.2, ADMIN-AC-11.1). Row click is a READ-ONLY drill-down
 * to the account detail (`/admin/accounts/[id]`); from there the operator can
 * pivot to that account's turns (ADMIN-AC-11.2).
 *
 * The `sort` control is the heavy-user view (ADMIN-US-11): `turns`/`cost`/
 * `errors` re-rank ACROSS ALL accounts server-side (so it is a fetch param the
 * owning page threads to `/api/admin/accounts?sort=…`, NOT a client-only
 * reorder), while `recent` (signup date) is the default ordering. It is
 * deliberately NOT a separate route (design.md: "Heavy-users is
 * `accounts?sort=…`; it is not a separate route").
 *
 * PURE + CONTROLLED (the admin component-test rule): it imports no
 * db/repos/runtime and holds no fetch/network state — the owning thin page
 * (`app/admin/accounts/page.tsx`) owns the `fetch('/api/admin/accounts')`
 * orchestration, the q/sort state, the keyset cursor, and routing, and threads
 * everything in as props so this view renders identically from fixtures in jsdom.
 *
 * READ-ONLY (ADMIN-BR-2, ADMIN-AC-8.4): the only interactions are search, sort,
 * load-more, and read-only drill-down navigation. Nothing here mutates an
 * account, its sessions, its content, or its limits.
 *
 * Refs:
 *   - docs/features/admin-panel/architecture/design.md § Component Design §5,
 *     § API Design (`GET /api/admin/accounts → AccountsResponse`; `sort`),
 *     § Implementation Phases Phase 8.
 *   - requirements.md ADMIN-US-8, ADMIN-US-11, ADMIN-AC-8.1/8.2/8.4/11.1,
 *     ADMIN-BR-2/5.
 */

/** The sort options, in display order, with human labels. */
const SORT_OPTIONS: { value: AccountSort; label: string }[] = [
  { value: "recent", label: "Most recent signup" },
  { value: "turns", label: "Most turns" },
  { value: "cost", label: "Highest est. cost" },
  { value: "errors", label: "Most errors / rate-limits" },
];

/** A heavy-user ranking is any sort other than the default signup-date order. */
const HEAVY_SORTS: ReadonlySet<AccountSort> = new Set<AccountSort>([
  "turns",
  "cost",
  "errors",
]);

/** Compact epoch-ms → local datetime; tolerant of a 0/NaN value. */
function formatTimestamp(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
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

export interface AccountsViewProps {
  /** Accounts (with derived activity) for the current search/sort/page. */
  rows: AccountWithActivity[];
  /** Current email search term (controlled by the page). */
  q: string;
  /** Emits the next search term on input change. */
  onQChange: (q: string) => void;
  /** Current server sort (drives the heavy-user ranking, ADMIN-US-11). */
  sort: AccountSort;
  /** Emits the next sort on change. */
  onSortChange: (sort: AccountSort) => void;
  /** True while the first page is loading (search/sort change). */
  loading?: boolean;
  /** A transport/HTTP error message, or null when healthy. */
  error?: string | null;
  /** True when another keyset page is available. */
  hasMore?: boolean;
  /** Invoked when "Load more" is activated. */
  onLoadMore?: () => void;
  /** True while a load-more fetch is in flight. */
  loadingMore?: boolean;
  /** Read-only drill-down navigation: open an account's detail. */
  onRowClick?: (account: AccountWithActivity) => void;
}

export default function AccountsView({
  rows,
  q,
  onQChange,
  sort,
  onSortChange,
  loading = false,
  error = null,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  onRowClick,
}: AccountsViewProps) {
  const columns: Column<AccountWithActivity>[] = [
    {
      key: "email",
      header: "Email",
      sortValue: (r) => r.email.toLowerCase(),
      render: (r) => (
        <span className="accounts-view__email" title={r.email}>
          {r.email}
        </span>
      ),
    },
    {
      key: "signup",
      header: "Signup",
      sortValue: (r) => r.createdAt,
      render: (r) => formatTimestamp(r.createdAt),
    },
    {
      key: "lastActive",
      header: "Last active",
      sortValue: (r) => r.lastActiveAt ?? 0,
      render: (r) => (r.lastActiveAt == null ? "Never" : formatTimestamp(r.lastActiveAt)),
    },
    {
      key: "turns",
      header: "Turns",
      align: "right",
      sortValue: (r) => r.turns,
      render: (r) => formatInt(r.turns),
    },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      sortValue: (r) => r.totalTokens,
      render: (r) => formatInt(r.totalTokens),
    },
    {
      key: "cost",
      header: "Est. cost",
      align: "right",
      sortValue: (r) => r.estUsd,
      render: (r) => formatUsd(r.estUsd),
    },
    {
      key: "rateLimited",
      header: "Rate-limited",
      align: "right",
      sortValue: (r) => r.rateLimited,
      render: (r) => formatInt(r.rateLimited),
    },
    {
      key: "failed",
      header: "Failed",
      align: "right",
      sortValue: (r) => r.failed,
      render: (r) => formatInt(r.failed),
    },
    {
      key: "conversations",
      header: "Convs",
      align: "right",
      sortValue: (r) => r.conversations,
      render: (r) => formatInt(r.conversations),
    },
    {
      key: "teams",
      header: "Teams",
      align: "right",
      sortValue: (r) => r.teams,
      render: (r) => formatInt(r.teams),
    },
  ];

  const emptyMessage = loading
    ? "Loading accounts…"
    : error
      ? "Could not load accounts."
      : q.trim() !== ""
        ? "No accounts match that search."
        : "No accounts yet.";

  return (
    <section className="admin-page accounts-view" data-testid="accounts-view">
      <h1 className="admin-page__title">Accounts</h1>

      <div
        className="accounts-view__toolbar"
        data-testid="accounts-view-toolbar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-3, 12px)",
          alignItems: "flex-end",
          marginBottom: "var(--space-3, 12px)",
        }}
      >
        <label className="accounts-view__field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="accounts-view__label">Search</span>
          <input
            type="search"
            className="accounts-view__search"
            data-testid="accounts-search"
            aria-label="Search accounts by email"
            placeholder="Search by email…"
            value={q}
            onChange={(e) => onQChange(e.target.value)}
          />
        </label>
        <label className="accounts-view__field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="accounts-view__label">Sort</span>
          <select
            className="accounts-view__sort"
            data-testid="accounts-sort"
            aria-label="Sort accounts"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as AccountSort)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {HEAVY_SORTS.has(sort) && (
        <div
          className="accounts-view__heavy-note"
          data-testid="accounts-heavy-note"
          style={{
            padding: "var(--space-2, 8px) var(--space-3, 12px)",
            border: "1px solid var(--border, #e9e0d8)",
            borderRadius: "var(--radius-md, 8px)",
            background: "var(--surface-sunken, #f5efe8)",
            color: "var(--text-muted, #6e625a)",
            fontSize: "var(--text-sm, 13px)",
            marginBottom: "var(--space-3, 12px)",
          }}
        >
          Ranked by{" "}
          {sort === "turns"
            ? "total turns"
            : sort === "cost"
              ? "estimated cost"
              : "failures and rate-limit hits"}{" "}
          across all accounts (heavy users).
        </div>
      )}

      {error != null && error !== "" && (
        <div
          className="accounts-view__error"
          data-testid="accounts-view-error"
          role="alert"
          style={{
            padding: "var(--space-3, 12px) var(--space-4, 16px)",
            border: "1px solid var(--danger, #ee5a5a)",
            borderRadius: "var(--radius-md, 8px)",
            color: "var(--danger, #ee5a5a)",
            fontSize: "var(--text-sm, 13px)",
            marginBottom: "var(--space-3, 12px)",
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
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        loadingMore={loadingMore}
        emptyMessage={emptyMessage}
        caption="Accounts and derived activity"
      />
    </section>
  );
}
