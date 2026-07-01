"use client";

/**
 * `/admin/teams` — the cross-account saved-team browser page (ADMIN-US-10,
 * ADMIN-AC-10.1).
 *
 * A THIN integrator (the design's "keep app/admin pages thin" rule): it owns the
 * `fetch('/api/admin/teams')` list orchestration, the team-name/format query,
 * the keyset cursor, AND the `fetch('/api/admin/teams/[id]')` detail load for the
 * selected team, then delegates ALL render logic to the tested
 * {@link TeamsBrowser} view under `src/components/admin/` (the jsdom component
 * project does not scan `src/app/**`). This file imports no db/repos — it only
 * talks to the admin HTTP surface (same-origin, session cookie auto-sent).
 *
 * There is no separate `teams/[id]` route (design.md File Structure lists only
 * `teams/page.tsx`), so the screen is a master-detail page: selecting a row
 * fetches that team's full members and shows them in the read-only detail panel.
 *
 * NOT date-range scoped: the teams browser is a content surface, not an analytics
 * view, so it does not read `useAdminRange` (mirrors the accounts/conversations
 * browsers — their list opts carry no `from`/`to`).
 *
 * READ-ONLY (ADMIN-BR-2): every request is a GET; the search/format controls only
 * refine the query and the row click is read-only navigation to view a team's
 * members — never a mutation.
 *
 * `runtime`/`dynamic` are not declared here — the parent `admin/layout.tsx` is
 * already `force-dynamic` + `nodejs` and server-gates the whole route group.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import TeamsBrowser from "@/components/admin/TeamsBrowser";
import type {
  TeamDetail,
  TeamDetailResponse,
  TeamSummary,
  TeamsListResponse,
} from "@/lib/admin/admin-types";

/** Keyset page size for the teams list (the repo also clamps). */
const PAGE_LIMIT = 50;

/** Debounce (ms) before a typed search query triggers a refetch. */
const SEARCH_DEBOUNCE_MS = 300;

/** Build the `/api/admin/teams` list query string from the current state. */
function buildTeamsQuery(opts: {
  q: string;
  format: string;
  cursor?: string | null;
}): string {
  const { q, format, cursor } = opts;
  const p = new URLSearchParams();
  if (q.trim() !== "") p.set("q", q.trim());
  if (format !== "") p.set("format", format);
  p.set("limit", String(PAGE_LIMIT));
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

export default function TeamsPage() {
  // Search/filter controls (the typed value is `query`; the fetch keys off the
  // debounced `appliedQuery` so we don't refetch on every keystroke).
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [format, setFormat] = useState("");

  // List state.
  const [rows, setRows] = useState<TeamSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected-team detail state (master-detail on this one page).
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Monotonic request ids: ignore a stale response that resolves after a newer
  // query/selection has fired.
  const listReqRef = useRef(0);
  const detailReqRef = useRef(0);

  // Debounce the typed query → appliedQuery.
  useEffect(() => {
    const handle = setTimeout(() => setAppliedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  // (Re)load the first page whenever the applied search or the format changes.
  useEffect(() => {
    const myReq = ++listReqRef.current;
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const qs = buildTeamsQuery({ q: appliedQuery, format, cursor: null });
        const res = await fetch(`/api/admin/teams?${qs}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TeamsListResponse;
        if (!active || myReq !== listReqRef.current) return;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setCursor(data.nextCursor ?? null);
        setHasMore(data.nextCursor != null);
      } catch {
        if (!active || myReq !== listReqRef.current) return;
        setRows([]);
        setCursor(null);
        setHasMore(false);
        setError("Failed to load teams.");
      } finally {
        if (active && myReq === listReqRef.current) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [appliedQuery, format]);

  // Append the next keyset page.
  const loadMore = useCallback(() => {
    if (cursor == null || loadingMore) return;
    setLoadingMore(true);
    void (async () => {
      try {
        const qs = buildTeamsQuery({ q: appliedQuery, format, cursor });
        const res = await fetch(`/api/admin/teams?${qs}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TeamsListResponse;
        setRows((prev) => [...prev, ...(Array.isArray(data.rows) ? data.rows : [])]);
        setCursor(data.nextCursor ?? null);
        setHasMore(data.nextCursor != null);
      } catch {
        // Keep the rows already on screen; surface nothing destructive.
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [cursor, loadingMore, appliedQuery, format]);

  // Read-only selection: fetch a team's full members for the detail panel.
  const selectTeam = useCallback((team: TeamSummary) => {
    const myReq = ++detailReqRef.current;
    setSelectedTeamId(team.id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/teams/${encodeURIComponent(team.id)}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (res.status === 404) {
          if (myReq === detailReqRef.current) {
            setDetail(null);
            setDetailError("Team not found.");
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TeamDetailResponse;
        if (myReq !== detailReqRef.current) return;
        setDetail(data.team);
      } catch {
        if (myReq === detailReqRef.current) {
          setDetail(null);
          setDetailError("Failed to load this team.");
        }
      } finally {
        if (myReq === detailReqRef.current) setDetailLoading(false);
      }
    })();
  }, []);

  const closeDetail = useCallback(() => {
    ++detailReqRef.current; // invalidate any in-flight detail fetch
    setSelectedTeamId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  return (
    <TeamsBrowser
      query={query}
      onQueryChange={setQuery}
      format={format}
      onFormatChange={setFormat}
      teams={rows}
      loading={loading}
      error={error}
      hasMore={hasMore}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      selectedTeamId={selectedTeamId}
      onSelectTeam={selectTeam}
      detail={detail}
      detailLoading={detailLoading}
      detailError={detailError}
      onCloseDetail={closeDetail}
    />
  );
}
