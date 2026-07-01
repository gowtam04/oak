/**
 * `GET /api/admin/cost` — token totals & estimated USD by model, plus a
 * per-bucket estimated-cost trend over a date range
 * (admin-panel design.md § API Design "GET /api/admin/cost → CostResponse";
 * § Component Design §4; ADMIN-US-3, ADMIN-AC-3.1/3.2, ADMIN-BR-5/BR-8).
 *
 * Thin handler (the §4 contract): `requireAdminRequest` → parse query → call the
 * `admin-analytics-repo` aggregation → `json(200, …)`. It adds the resolved
 * `range` to the repo's `CostBreakdownResult` to form the `CostResponse`.
 *
 * Cost is an ESTIMATE (ADMIN-BR-5 / AD-6): the repo computes `estUsd` from the
 * static in-code price table and the response carries `estimated: true`. The
 * panel never bills; provider invoices stay authoritative.
 *
 * Query params (§ API Design "Common query params"; ADMIN-BR-8 date scoping):
 *   - `from`,`to` — epoch ms; default last 7 days (half-open `[from, to)`).
 *   - `bucket`    — `day` | `hour` (default `day`) for the cost trend series.
 * Validation is LENIENT (§ API Design): bad/missing params fall back to the
 * documented defaults, never a 500.
 *
 * Conventions (CLAUDE.md "API ROUTES"):
 *   - `runtime = "nodejs"` + `dynamic = "force-dynamic"`.
 *   - The guard and the env/db-touching repo are reached via DYNAMIC import
 *     inside the handler so `next build`'s page-data collection never eagerly
 *     evaluates the env-throwing module chain. Mirrors the `/api/auth/*` and
 *     `/api/conversations` routes.
 *   - Errors ride the shared `jsonError(status, code, message)` envelope (here,
 *     via the guard's 401/403 responses).
 */

import { json } from "@/app/api/auth/_lib/http";
import type { BucketSize, CostResponse, Range } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Default analytics window when `from`/`to` are absent: last 7 days. */
const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Parse a lenient epoch-ms query param; non-finite/absent → `fallback`. */
function parseEpochMs(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Resolve `from`/`to`/`bucket` from the query string with documented defaults. */
function parseRange(url: URL): Range {
  const now = Date.now();
  const to = parseEpochMs(url.searchParams.get("to"), now);
  const from = parseEpochMs(url.searchParams.get("from"), to - DEFAULT_WINDOW_MS);
  const bucket: BucketSize =
    url.searchParams.get("bucket") === "hour" ? "hour" : "day";
  return { from, to, bucket };
}

export async function GET(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("../_lib/guard");
  const gate = await requireAdminRequest(req);
  if ("response" in gate) return gate.response;

  const { getCostBreakdown } = await import(
    "@/data/repos/admin-analytics-repo"
  );

  const range = parseRange(new URL(req.url));
  const breakdown = await getCostBreakdown(range);

  const body: CostResponse = { ...breakdown, range };
  return json(200, body);
}
