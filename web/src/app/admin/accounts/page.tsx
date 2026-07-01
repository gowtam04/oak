"use client";

/**
 * `/admin/accounts` — the cross-account Accounts list page (ADMIN-US-8 view-only
 * + ADMIN-US-11 heavy users).
 *
 * A THIN integrator (the design's "keep app/admin pages thin" rule): it owns the
 * `fetch('/api/admin/accounts')` orchestration, the search/sort query, the keyset
 * cursor, and routing, then delegates ALL render logic to the tested
 * {@link AccountsView} view under `src/components/admin/` (the jsdom component
 * project does not scan `src/app/**`). It imports no db/repos — it only talks to
 * the admin HTTP surface (same-origin, session cookie auto-sent).
 *
 * Scoping: the accounts list is NOT date-range scoped — derived activity is over
 * each account's full lifetime (admin-types `AccountWithActivity`; the API takes
 * only `q`/`sort`/`limit`/`cursor`), so this page does not read the global
 * `useAdminRange`. The `q` (email) and `sort` dimensions are seeded once from the
 * URL query, so a heavy-user deep link (e.g. `/admin/accounts?sort=cost`,
 * ADMIN-US-11) lands pre-sorted.
 *
 * The `sort` is a SERVER fetch param (the heavy-user ranking re-ranks across ALL
 * accounts server-side, ADMIN-AC-11.1) — not a client-only reorder — and changing
 * it resets pagination. It is NOT a separate route (design.md: "Heavy-users is
 * `accounts?sort=…`; it is not a separate route").
 *
 * READ-ONLY (ADMIN-BR-2 / ADMIN-AC-8.4): every request is a GET; the row click is
 * drill-down navigation to `/admin/accounts/[id]`, never a mutation.
 *
 * `runtime`/`dynamic` are not declared here — the parent `admin/layout.tsx` is
 * already `force-dynamic` + `nodejs` and server-gates the whole route group.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AccountsView from "@/components/admin/AccountsView";
import type {
  AccountSort,
  AccountWithActivity,
  AccountsResponse,
} from "@/lib/admin/admin-types";

/** Keyset page size for the accounts list (the repo also clamps). */
const PAGE_LIMIT = 50;

/** The valid `sort` values (mirrors `AccountSort`); anything else → default. */
const ACCOUNT_SORTS: ReadonlySet<AccountSort> = new Set<AccountSort>([
  "recent",
  "turns",
  "cost",
  "errors",
]);

/** Build the `/api/admin/accounts` query string from the current state. */
function buildAccountsQuery(opts: {
  q: string;
  sort: AccountSort;
  cursor?: string | null;
}): string {
  const { q, sort, cursor } = opts;
  const p = new URLSearchParams();
  if (q.trim() !== "") p.set("q", q.trim());
  // `recent` is the API default; only send a non-default sort.
  if (sort !== "recent") p.set("sort", sort);
  p.set("limit", String(PAGE_LIMIT));
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

function AccountsListPage() {
  const sp = useSearchParams();
  const router = useRouter();

  // Seed q + sort once from the URL (subsequent edits are local state).
  const initial = useMemo<{ q: string; sort: AccountSort }>(() => {
    const q = sp.get("q") ?? "";
    const sortRaw = sp.get("sort");
    const sort: AccountSort =
      sortRaw && ACCOUNT_SORTS.has(sortRaw as AccountSort)
        ? (sortRaw as AccountSort)
        : "recent";
    return { q, sort };
    // Seed only on first mount; URL→state is one-way at entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [q, setQ] = useState<string>(initial.q);
  const [sort, setSort] = useState<AccountSort>(initial.sort);
  const [rows, setRows] = useState<AccountWithActivity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monotonic request id: ignore a stale response that resolves after a newer
  // search/sort change has fired.
  const reqIdRef = useRef(0);

  // (Re)load the first page whenever the search or the sort changes.
  useEffect(() => {
    const myReq = ++reqIdRef.current;
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const qs = buildAccountsQuery({ q, sort, cursor: null });
        const res = await fetch(`/api/admin/accounts?${qs}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AccountsResponse;
        if (!active || myReq !== reqIdRef.current) return;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setCursor(data.nextCursor ?? null);
        setHasMore(data.nextCursor != null);
      } catch {
        if (!active || myReq !== reqIdRef.current) return;
        setRows([]);
        setCursor(null);
        setHasMore(false);
        setError("Failed to load accounts.");
      } finally {
        if (active && myReq === reqIdRef.current) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [q, sort]);

  // Append the next keyset page.
  const loadMore = useCallback(() => {
    if (cursor == null || loadingMore) return;
    setLoadingMore(true);
    void (async () => {
      try {
        const qs = buildAccountsQuery({ q, sort, cursor });
        const res = await fetch(`/api/admin/accounts?${qs}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AccountsResponse;
        setRows((prev) => [...prev, ...(Array.isArray(data.rows) ? data.rows : [])]);
        setCursor(data.nextCursor ?? null);
        setHasMore(data.nextCursor != null);
      } catch {
        // Keep the rows already on screen; surface nothing destructive.
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [cursor, loadingMore, q, sort]);

  return (
    <AccountsView
      rows={rows}
      q={q}
      onQChange={setQ}
      sort={sort}
      onSortChange={setSort}
      loading={loading}
      error={error}
      hasMore={hasMore}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      onRowClick={(account) => router.push(`/admin/accounts/${account.id}`)}
    />
  );
}

export default function AccountsPage() {
  // `useSearchParams` requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={<section className="admin-page" />}>
      <AccountsListPage />
    </Suspense>
  );
}
