"use client";

/**
 * `/admin/usage` — the Usage explorer page (ADMIN-US-5, ADMIN-AC-5.1).
 *
 * A THIN integrator (the design's "keep app/admin pages thin" rule): it owns the
 * `fetch('/api/admin/turns')` orchestration, the keyset cursor, and routing, then
 * delegates ALL render logic to the tested {@link UsageExplorer} view under
 * `src/components/admin/` (the jsdom component project does not scan
 * `src/app/**`). This file imports no db/repos — it only talks to the admin HTTP
 * surface (same-origin, session cookie auto-sent).
 *
 * Scoping:
 *   - The global header date range (`useAdminRange`, ADMIN-BR-8) supplies
 *     `from`/`to` so the explorer honors the panel-wide window.
 *   - The {@link FilterBar} dimensions (model/mode/status/kind/q) are seeded from
 *     the URL query so a click-through from the Errors view
 *     (`/admin/usage?status=…`, ADMIN-AC-4.2) or a heavy-user row
 *     (`?accountId=…` / `?sessionId=…`, ADMIN-AC-11.2) lands pre-filtered.
 *   - `accountId`/`sessionId` live outside the FilterBar; they're applied to the
 *     fetch and surfaced via the view's `scopeNote` banner.
 *
 * READ-ONLY (ADMIN-BR-2): every request is a GET; the row click is drill-down
 * navigation to `/admin/usage/[id]`, never a mutation.
 *
 * `runtime`/`dynamic` are not declared here — the parent `admin/layout.tsx` is
 * already `force-dynamic` + `nodejs` and server-gates the whole route group.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import UsageExplorer from "@/components/admin/UsageExplorer";
import type { FilterBarValue } from "@/components/admin/FilterBar";
import { useAdminRange } from "@/components/admin/AdminShell";
import type {
  TurnKind,
  TurnSummary,
  TurnsListResponse,
} from "@/lib/admin/admin-types";

/** Keyset page size for the turns explorer (the repo also clamps). */
const PAGE_LIMIT = 50;

/** Build the `/api/admin/turns` query string from the current state. */
function buildTurnsQuery(opts: {
  from: number;
  to: number;
  filter: FilterBarValue;
  accountId?: string;
  sessionId?: string;
  cursor?: string | null;
}): string {
  const { from, to, filter, accountId, sessionId, cursor } = opts;
  const p = new URLSearchParams();
  p.set("from", String(from));
  p.set("to", String(to));
  if (filter.model) p.set("model", filter.model);
  if (filter.mode) p.set("mode", filter.mode);
  if (filter.status) p.set("status", filter.status);
  if (filter.kind) p.set("kind", filter.kind);
  if (filter.q) p.set("q", filter.q);
  if (accountId) p.set("accountId", accountId);
  if (sessionId) p.set("sessionId", sessionId);
  p.set("limit", String(PAGE_LIMIT));
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

function UsageExplorerPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const { range } = useAdminRange();

  // Out-of-FilterBar scope from a click-through (stable for this mount).
  const accountId = sp.get("accountId") ?? undefined;
  const sessionId = sp.get("sessionId") ?? undefined;

  // Seed the FilterBar once from the URL (subsequent edits are local state).
  const initialFilter = useMemo<FilterBarValue>(() => {
    const f: FilterBarValue = {};
    const model = sp.get("model");
    if (model) f.model = model;
    const mode = sp.get("mode");
    if (mode) f.mode = mode;
    const status = sp.get("status");
    if (status) f.status = status;
    const kindRaw = sp.get("kind");
    if (kindRaw === "guest" || kindRaw === "signed") f.kind = kindRaw as TurnKind;
    const q = sp.get("q");
    if (q) f.q = q;
    return f;
    // Seed only on first mount; URL→filter is one-way at entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filter, setFilter] = useState<FilterBarValue>(initialFilter);
  const [rows, setRows] = useState<TurnSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monotonic request id: ignore a stale response that resolves after a newer
  // filter/range change has fired.
  const reqIdRef = useRef(0);

  // (Re)load the first page whenever the filter, the global range, or the
  // click-through scope changes.
  useEffect(() => {
    const myReq = ++reqIdRef.current;
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const qs = buildTurnsQuery({
          from: range.from,
          to: range.to,
          filter,
          accountId,
          sessionId,
          cursor: null,
        });
        const res = await fetch(`/api/admin/turns?${qs}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TurnsListResponse;
        if (!active || myReq !== reqIdRef.current) return;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setCursor(data.nextCursor ?? null);
        setHasMore(data.nextCursor != null);
      } catch {
        if (!active || myReq !== reqIdRef.current) return;
        setRows([]);
        setCursor(null);
        setHasMore(false);
        setError("Failed to load turns.");
      } finally {
        if (active && myReq === reqIdRef.current) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [filter, range.from, range.to, accountId, sessionId]);

  // Append the next keyset page.
  const loadMore = useCallback(() => {
    if (cursor == null || loadingMore) return;
    setLoadingMore(true);
    void (async () => {
      try {
        const qs = buildTurnsQuery({
          from: range.from,
          to: range.to,
          filter,
          accountId,
          sessionId,
          cursor,
        });
        const res = await fetch(`/api/admin/turns?${qs}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TurnsListResponse;
        setRows((prev) => [...prev, ...(Array.isArray(data.rows) ? data.rows : [])]);
        setCursor(data.nextCursor ?? null);
        setHasMore(data.nextCursor != null);
      } catch {
        // Keep the rows already on screen; surface nothing destructive.
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [cursor, loadingMore, range.from, range.to, filter, accountId, sessionId]);

  const scopeNote = accountId
    ? `Filtered to account ${accountId}`
    : sessionId
      ? `Filtered to session ${sessionId}`
      : undefined;

  return (
    <UsageExplorer
      filter={filter}
      onFilterChange={setFilter}
      rows={rows}
      loading={loading}
      error={error}
      hasMore={hasMore}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      onRowClick={(turn) => router.push(`/admin/usage/${turn.id}`)}
      scopeNote={scopeNote}
    />
  );
}

export default function UsagePage() {
  // `useSearchParams` requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={<section className="admin-page" />}>
      <UsageExplorerPage />
    </Suspense>
  );
}
