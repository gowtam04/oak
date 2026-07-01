"use client";

/**
 * `/admin/conversations` — the cross-account Conversations browser page
 * (ADMIN-US-9, ADMIN-AC-9.1).
 *
 * A THIN integrator (the design's "keep app/admin pages thin" rule): it owns the
 * `fetch('/api/admin/conversations')` orchestration, the keyset cursor, and
 * routing, then delegates ALL render logic to the tested
 * {@link ConversationsBrowser} view under `src/components/admin/` (the jsdom
 * component project does not scan `src/app/**`). It imports no db/repos — it only
 * talks to the admin HTTP surface (same-origin, session cookie auto-sent).
 *
 * Scoping: the conversation browser is NOT date-range scoped (the API takes only
 * `q` + `format`), so this page does not read the global `useAdminRange`. The
 * search/format dimensions are seeded once from the URL query, so a deep link
 * (e.g. `/admin/conversations?q=garchomp`) lands pre-filtered.
 *
 * READ-ONLY (ADMIN-BR-2 / ADMIN-AC-9.3): every request is a GET; the row click is
 * drill-down navigation to `/admin/conversations/[id]`, never a mutation.
 *
 * `runtime`/`dynamic` are not declared here — the parent `admin/layout.tsx` is
 * already `force-dynamic` + `nodejs` and server-gates the whole route group.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ConversationsBrowser, {
  type ConversationFilterValue,
} from "@/components/admin/ConversationsBrowser";
import type {
  ConversationSummary,
  ConversationsListResponse,
} from "@/lib/admin/admin-types";

/** Keyset page size for the conversations list (the repo also clamps). */
const PAGE_LIMIT = 50;

/** Build the `/api/admin/conversations` query string from the current state. */
function buildConversationsQuery(opts: {
  filter: ConversationFilterValue;
  cursor?: string | null;
}): string {
  const { filter, cursor } = opts;
  const p = new URLSearchParams();
  if (filter.q) p.set("q", filter.q);
  if (filter.format) p.set("format", filter.format);
  p.set("limit", String(PAGE_LIMIT));
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

function ConversationsBrowserPage() {
  const sp = useSearchParams();
  const router = useRouter();

  // Seed the filter once from the URL (subsequent edits are local state).
  const initialFilter = useMemo<ConversationFilterValue>(() => {
    const f: ConversationFilterValue = {};
    const q = sp.get("q");
    if (q) f.q = q;
    const format = sp.get("format");
    if (format) f.format = format;
    return f;
    // Seed only on first mount; URL→filter is one-way at entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filter, setFilter] = useState<ConversationFilterValue>(initialFilter);
  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monotonic request id: ignore a stale response that resolves after a newer
  // filter change has fired.
  const reqIdRef = useRef(0);

  // (Re)load the first page whenever the filter changes.
  useEffect(() => {
    const myReq = ++reqIdRef.current;
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const qs = buildConversationsQuery({ filter, cursor: null });
        const res = await fetch(`/api/admin/conversations?${qs}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ConversationsListResponse;
        if (!active || myReq !== reqIdRef.current) return;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setCursor(data.nextCursor ?? null);
        setHasMore(data.nextCursor != null);
      } catch {
        if (!active || myReq !== reqIdRef.current) return;
        setRows([]);
        setCursor(null);
        setHasMore(false);
        setError("Failed to load conversations.");
      } finally {
        if (active && myReq === reqIdRef.current) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [filter]);

  // Append the next keyset page.
  const loadMore = useCallback(() => {
    if (cursor == null || loadingMore) return;
    setLoadingMore(true);
    void (async () => {
      try {
        const qs = buildConversationsQuery({ filter, cursor });
        const res = await fetch(`/api/admin/conversations?${qs}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ConversationsListResponse;
        setRows((prev) => [
          ...prev,
          ...(Array.isArray(data.rows) ? data.rows : []),
        ]);
        setCursor(data.nextCursor ?? null);
        setHasMore(data.nextCursor != null);
      } catch {
        // Keep the rows already on screen; surface nothing destructive.
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [cursor, loadingMore, filter]);

  return (
    <ConversationsBrowser
      filter={filter}
      onFilterChange={setFilter}
      rows={rows}
      loading={loading}
      error={error}
      hasMore={hasMore}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      onRowClick={(conversation) =>
        router.push(`/admin/conversations/${conversation.id}`)
      }
    />
  );
}

export default function ConversationsPage() {
  // `useSearchParams` requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={<section className="admin-page" />}>
      <ConversationsBrowserPage />
    </Suspense>
  );
}
