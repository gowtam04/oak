"use client";

import { useEffect, useRef, useState } from "react";

import DataTable, { type Column } from "./DataTable";
import KpiCard from "./KpiCard";
import type {
  LiveResponse,
  TurnRecordStatus,
  TurnSummary,
} from "@/lib/admin/admin-types";

/**
 * LivePanel — the admin "Live activity" screen (ADMIN-US-7, ADMIN-AC-7.1,
 * ADMIN-BR-10). It POLLS `GET /api/admin/live` on a short interval (~10s) and
 * renders the {@link LiveResponse} it returns: the current-window counters
 * (`lastHourTurns` / `lastHourActive`) as KPI tiles, plus the most-recent
 * `turn_record` rows as a read-only feed that drills into the per-turn detail.
 *
 * Live ≠ streaming (ADMIN-BR-10 / AD on the route): this is a periodic snapshot
 * fetched on a `setInterval`, NOT an SSE/WebSocket feed. The window (last hour)
 * and recent-row count are fixed server-side, so this view takes no date-range —
 * it deliberately ignores the global picker and shows "right now".
 *
 * WHY THIS COMPONENT OWNS ITS FETCH (unlike the pure, page-driven sibling
 * screens such as {@link UsageExplorer}): the polling loop is the load-bearing
 * behaviour to verify (the Phase-7 test focus calls out "live polling"), and the
 * jsdom component project only scans `src/components/**` — never `src/app/**`.
 * Putting the loop here keeps it testable. The page
 * (`app/admin/usage/live/page.tsx`) stays a one-line renderer. The `fetcher` and
 * `pollIntervalMs` props exist purely so the test can inject a deterministic
 * fixture source and a fast interval; production omits both and uses the default
 * same-origin fetch + 10s cadence.
 *
 * READ-ONLY (ADMIN-BR-2): a GET over the append-only turn log. The only
 * interactions are read-only drill-down links (`/admin/usage/[id]`) — no control
 * here mutates anything. Drill-down is a plain `<a>` (not `next/link`), so the
 * component stays router-free and fixture-renderable (the AdminNav convention).
 *
 * Refs:
 *   - docs/features/admin-panel/architecture/design.md
 *       § API Design (`GET /api/admin/live → LiveResponse`; "client polls this
 *         every ~10s"), § Component Design §5, § Implementation Phases Phase 7,
 *       § Unresolved ("Live poll interval: default ~10s").
 *   - requirements.md ADMIN-US-7, ADMIN-AC-7.1, ADMIN-BR-2/10.
 *
 * CLIENT-SAFE: imports only client-safe wire types + sibling client primitives;
 * never touches db/repos/runtime (jsdom component-test rule).
 */

/** The live endpoint the default fetcher polls. */
const LIVE_ENDPOINT = "/api/admin/live";

/** Default poll cadence (ADMIN-BR-10; ~10s, per the design's Unresolved note). */
const DEFAULT_POLL_INTERVAL_MS = 10_000;

/** Human-readable label per recorded turn status (mirrors the other screens). */
const STATUS_LABEL: Record<TurnRecordStatus, string> = {
  answered: "Answered",
  clarification_needed: "Clarification needed",
  resolution_failed: "Resolution failed",
  insufficient_data: "Insufficient data",
  rate_limited: "Rate limited",
};

/** Design-token color per status, applied inline (admin.css is not owned here). */
const STATUS_COLOR_VAR: Record<TurnRecordStatus, string> = {
  answered: "--success",
  clarification_needed: "--warning",
  resolution_failed: "--danger",
  insufficient_data: "--danger",
  rate_limited: "--warning",
};

/** epoch-ms → local HH:MM:SS clock; tolerant of a 0/NaN value. */
function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Integer with thousands separators; tolerant of nullish. */
function formatInt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
}

/** A single-line prompt preview, collapsed + clipped for the table cell. */
function promptPreview(text: string, imagesCount: number, max = 72): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed === "") return imagesCount > 0 ? "(image-only turn)" : "—";
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

/** Default same-origin fetch of the live snapshot. */
async function defaultFetchLive(): Promise<LiveResponse> {
  const res = await fetch(LIVE_ENDPOINT, {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`live ${res.status}`);
  return (await res.json()) as LiveResponse;
}

export interface LivePanelProps {
  /**
   * Snapshot source. Defaults to a same-origin `GET /api/admin/live`. Tests
   * inject a deterministic fixture fetcher. Keep the reference STABLE across
   * renders (module fn / `useCallback`) — it is an effect dependency, so a fresh
   * closure each render would restart the poll loop.
   */
  fetcher?: () => Promise<LiveResponse>;
  /** Poll cadence in ms (default ~10s; floored at 1s). */
  pollIntervalMs?: number;
}

export default function LivePanel({
  fetcher,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: LivePanelProps) {
  const fetchLive = fetcher ?? defaultFetchLive;
  // Guard only against a non-positive / NaN cadence (which would busy-loop or
  // never fire); any positive value is honored so tests can poll fast.
  const intervalMs = pollIntervalMs > 0 ? pollIntervalMs : DEFAULT_POLL_INTERVAL_MS;

  const [data, setData] = useState<LiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Keep the freshest fetcher in a ref so the poll loop never needs to restart
  // when the (default) closure identity changes — the interval is owned by a
  // single mount-scoped effect.
  const fetchRef = useRef(fetchLive);
  fetchRef.current = fetchLive;

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const next = await fetchRef.current();
        if (cancelled) return;
        setData(next);
        setError(null);
        setLastUpdatedAt(Date.now());
      } catch {
        if (cancelled) return;
        // Keep the last good snapshot on screen; surface a non-fatal note. A
        // recording/transport hiccup must never blank the operator's view.
        setError("Live update failed — retrying.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const id = setInterval(() => void load(), intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  const recent = data?.recent ?? [];

  const columns: Column<TurnSummary>[] = [
    {
      key: "time",
      header: "Time",
      render: (r) => (
        <a
          className="live-panel__time-link"
          href={`/admin/usage/${r.id}`}
          data-testid={`live-turn-link-${r.id}`}
        >
          {formatClock(r.createdAt)}
        </a>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span
          className="live-panel__status"
          data-status={r.status}
          data-testid={`live-status-${r.id}`}
          style={{ color: `var(${STATUS_COLOR_VAR[r.status]})`, fontWeight: 600 }}
        >
          {STATUS_LABEL[r.status]}
        </span>
      ),
    },
    {
      key: "user",
      header: "User",
      render: (r) => r.accountEmail ?? (r.accountId ? r.accountId : "Guest"),
    },
    {
      key: "model",
      header: "Model",
      render: (r) => r.model ?? "—",
    },
    {
      key: "mode",
      header: "Mode",
      render: (r) => r.mode,
    },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      render: (r) =>
        formatInt(r.inputTokens + r.outputTokens + r.thinkingTokens),
    },
    {
      key: "latency",
      header: "Latency",
      align: "right",
      render: (r) => `${formatInt(r.turnLatencyMs)} ms`,
    },
    {
      key: "prompt",
      header: "Prompt",
      render: (r) => (
        <span className="live-panel__prompt" title={r.promptText}>
          {promptPreview(r.promptText, r.imagesCount)}
        </span>
      ),
    },
  ];

  const pollSeconds = Math.max(1, Math.round(intervalMs / 1000));
  const statusText =
    loading && data == null
      ? "Connecting…"
      : lastUpdatedAt != null
        ? `Last updated ${formatClock(lastUpdatedAt)}`
        : "Live";

  return (
    <section className="admin-page live-panel" data-testid="live-panel">
      <h1 className="admin-page__title">Live activity</h1>

      <div
        className="live-panel__meta"
        data-testid="live-panel-status"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2, 8px)",
          color: "var(--text-muted, #6e625a)",
          fontSize: "var(--text-sm, 13px)",
        }}
      >
        <span
          aria-hidden="true"
          className="live-panel__dot"
          style={{
            width: 8,
            height: 8,
            borderRadius: "var(--radius-pill, 999px)",
            background: error
              ? "var(--warning, #f08c00)"
              : "var(--success, #2fb573)",
            display: "inline-block",
          }}
        />
        <span data-testid="live-panel-status-text">{statusText}</span>
        <span
          className="live-panel__cadence"
          style={{ color: "var(--text-faint, #94867a)" }}
        >
          · auto-refreshing every {pollSeconds}s
        </span>
      </div>

      {error != null && (
        <div
          className="live-panel__error"
          data-testid="live-panel-error"
          role="status"
          style={{
            padding: "var(--space-2, 8px) var(--space-3, 12px)",
            border: "1px solid var(--warning, #f08c00)",
            borderRadius: "var(--radius-md, 8px)",
            color: "var(--warning, #f08c00)",
            fontSize: "var(--text-sm, 13px)",
          }}
        >
          {error}
        </div>
      )}

      {data != null ? (
        <>
          <div className="admin-kpi-grid">
            <div data-testid="live-window-turns">
              <KpiCard
                label="Turns (last hour)"
                value={formatInt(data.window.lastHourTurns)}
                hint="Rolling 60-minute window"
              />
            </div>
            <div data-testid="live-window-active">
              <KpiCard
                label="Active sessions (last hour)"
                value={formatInt(data.window.lastHourActive)}
                hint="Distinct sessions seen"
              />
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={recent}
            rowKey={(r) => r.id}
            emptyMessage="No turns recorded yet."
            caption={`Recent turns (${recent.length})`}
          />
        </>
      ) : loading ? (
        <p
          className="live-panel__loading"
          data-testid="live-panel-loading"
          style={{
            padding: "var(--space-8, 48px)",
            textAlign: "center",
            color: "var(--text-faint, #94867a)",
          }}
        >
          Loading live activity…
        </p>
      ) : (
        <p
          className="live-panel__empty"
          data-testid="live-panel-empty"
          style={{
            padding: "var(--space-8, 48px)",
            textAlign: "center",
            color: "var(--text-faint, #94867a)",
          }}
        >
          No live activity to show yet.
        </p>
      )}
    </section>
  );
}
