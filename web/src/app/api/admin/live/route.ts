/**
 * `GET /api/admin/live` — the live-activity feed (admin-panel design.md
 * § API Design "GET /api/admin/live", Phase 5 / p5; ADMIN-US-7, ADMIN-AC-7.1,
 * ADMIN-BR-10).
 *
 * Returns a {@link LiveResponse}: the last N `turn_record` rows (most-recent
 * first, as `TurnSummary` projections) plus current-window counters
 * (`lastHourTurns`, `lastHourActive`). The admin UI POLLS this endpoint every
 * ~10s — it is a periodic snapshot, deliberately NOT an SSE/streaming feed
 * (ADMIN-BR-10): live ≠ streaming.
 *
 * Admin-gated like every `/api/admin/*` route: `requireAdminRequest` is the real
 * authorization boundary (ADMIN-AC-1.4) — no session → 401 `unauthorized`,
 * signed-in non-admin → 403 `forbidden` (ADMIN-AC-1.2), and only then does any
 * data load. Read-only (ADMIN-BR-2): a GET over the append-only turn log, never
 * a mutation.
 *
 * This route takes no query params — the window (last hour) and recent-row limit
 * are fixed inside the analytics repo's `getLive`.
 *
 * The guard and the analytics repo are reached via DYNAMIC import inside the
 * handler so `next build`'s page-data collection never eagerly evaluates the
 * env/db-touching chain (CLAUDE.md "API ROUTES" rule); `json` is pure and stays
 * a top-level import. Mirrors `api/auth/me` and `api/conversations`.
 */

import { json } from "@/app/api/auth/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("@/app/api/admin/_lib/guard");

  const gate = await requireAdminRequest(req);
  if ("response" in gate) return gate.response;

  const { getLive } = await import("@/data/repos/admin-analytics-repo");
  const live = await getLive();
  return json(200, live);
}
