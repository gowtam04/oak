/**
 * `GET /api/admin/overview` — the dashboard headline: KPI totals + the
 * per-bucket usage series, plus a headline estimated cost and error rate, over a
 * resolved date range (admin-panel design.md § API Design "GET /api/admin/overview
 * → OverviewResponse"; § Component Design §4; ADMIN-US-2/3/4 headline,
 * ADMIN-AC-2.1/2.2, ADMIN-BR-5 cost-is-estimate, ADMIN-BR-8 date scoping,
 * ADMIN-BR-9 failure taxonomy).
 *
 * Thin handler (the §4 contract): `requireAdminRequest` → parse the window from
 * query params → call the `admin-analytics-repo` aggregations → `json(200, …)`.
 * The Overview pulls from three repo reads and stitches them into one payload:
 *   - `getUsageSeries`    → `totals` (turns / active signed / active guest /
 *                            signups / guest-vs-signed split) + per-bucket
 *                            `buckets` series (ADMIN-AC-2.1/2.2).
 *   - `getCostBreakdown`  → `totalEstUsd` headline (ADMIN-BR-5; `estimated:true`).
 *   - `getErrorBreakdown` → the headline `errorRatePct` = failed turns / total
 *                            turns × 100 (ADMIN-BR-9), where a "failed turn" is a
 *                            non-`answered` turn status (`resolution_failed`,
 *                            `clarification_needed`, `insufficient_data`) plus
 *                            rate-limit rejections (`rate_limited`, recorded as
 *                            turns per AD-4). `tool_error` (overlaps `answered`)
 *                            and `otp_email_failed` (an auth event, not a turn)
 *                            are deliberately excluded from this turn-based rate;
 *                            they remain in the dedicated `/errors` view.
 *
 * Cost is an ESTIMATE (ADMIN-BR-5 / AD-6): the repo computes it from the static
 * in-code price table and the response carries `estimated: true`.
 *
 * Query params (§ API Design "Common query params"; ADMIN-BR-8 date scoping):
 *   - `from`,`to` — epoch ms; default last 7 days (half-open `[from, to)`).
 *   - `bucket`    — `day` | `hour` (default `day`) for the series granularity.
 * Validation is LENIENT (§ API Design): bad/missing params fall back to the
 * documented defaults, never a 500.
 *
 * Gating (the REAL boundary, ADMIN-AC-1.4): the guard runs FIRST and short-
 * circuits with `401 {code:"unauthorized"}` (no session) or
 * `403 {code:"forbidden"}` (signed-in non-admin) before any data is read — a
 * non-admin never receives admin data in any form (ADMIN-AC-1.2). Read-only:
 * every path here is a SELECT (ADMIN-BR-2).
 *
 * Conventions (CLAUDE.md "API ROUTES"): `runtime = "nodejs"` +
 * `dynamic = "force-dynamic"`, and the guard + env/db-touching repo are reached
 * via DYNAMIC import inside the handler so `next build`'s page-data collection
 * never eagerly evaluates the env-throwing module chain. Mirrors
 * `src/app/api/auth/me/route.ts`, `src/app/api/conversations/route.ts`, and the
 * sibling `/api/admin/cost` + `/api/admin/errors` routes.
 */

import { json } from "@/app/api/auth/_lib/http";
import type {
  BucketSize,
  ErrorCategoryKey,
  OverviewResponse,
  Range,
} from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Default analytics window when `from`/`to` are absent (ADMIN-BR-8). */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The error categories counted into the headline `errorRatePct`. These are the
 * mutually-exclusive turn statuses (one per `turn_record`), so they sum cleanly
 * against the same total-turns denominator. `tool_error` and `otp_email_failed`
 * are excluded (see file header).
 */
const FAILURE_KEYS: ReadonlySet<ErrorCategoryKey> = new Set<ErrorCategoryKey>([
  "resolution_failed",
  "clarification_needed",
  "insufficient_data",
  "rate_limited",
]);

/** Parse an epoch-ms query param, falling back on missing/invalid input. */
function parseEpochMs(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Resolve the half-open `[from, to)` window + bucket from query params,
 * leniently (design § API Design): unparseable/missing → defaults.
 */
function parseRange(url: URL): Range {
  const now = Date.now();
  const from = parseEpochMs(url.searchParams.get("from"), now - SEVEN_DAYS_MS);
  const to = parseEpochMs(url.searchParams.get("to"), now);
  const bucket: BucketSize =
    url.searchParams.get("bucket") === "hour" ? "hour" : "day";
  return { from, to, bucket };
}

export async function GET(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("@/app/api/admin/_lib/guard");
  const auth = await requireAdminRequest(req);
  if ("response" in auth) return auth.response;

  const { getUsageSeries, getCostBreakdown, getErrorBreakdown } = await import(
    "@/data/repos/admin-analytics-repo"
  );

  const range = parseRange(new URL(req.url));

  const [usage, cost, errors] = await Promise.all([
    getUsageSeries(range),
    getCostBreakdown(range),
    getErrorBreakdown(range),
  ]);

  // Headline error rate: failed turns / total turns × 100 (ADMIN-BR-9). Use the
  // error breakdown's own total-turns count as the denominator so numerator and
  // denominator share one source (it equals `usage.totals.turns`).
  const failures = errors.categories
    .filter((c) => FAILURE_KEYS.has(c.key))
    .reduce((sum, c) => sum + c.count, 0);
  const errorRatePct =
    errors.totalTurns > 0 ? (failures / errors.totalTurns) * 100 : 0;

  const body: OverviewResponse = {
    range,
    totals: usage.totals,
    buckets: usage.buckets,
    totalEstUsd: cost.totalEstUsd,
    estimated: true,
    errorRatePct,
  };
  return json(200, body);
}
