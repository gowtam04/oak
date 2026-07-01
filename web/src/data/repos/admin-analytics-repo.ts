/**
 * src/data/repos/admin-analytics-repo.ts — cross-account, un-scoped AGGREGATION
 * reads over the append-only recording tables (`turn_record`, `auth_event`) plus
 * `account`, backing the admin panel's observability surfaces:
 *   - getUsageSeries  — time-bucketed turns / active users / signups (ADMIN-US-2)
 *   - getCostBreakdown— token & estimated-USD rollups by model + trend (US-3)
 *   - getErrorBreakdown — the ADMIN-BR-9 failure taxonomy over the range (US-4)
 *   - getHeavyUsers   — ranked accounts & guest sessions by volume/cost/errors (US-11)
 *   - getLive         — last N turns + current-window counters (US-7)
 *
 * Design refs:
 *   - docs/features/admin-panel/architecture/design.md
 *       § Component Design › 3 (admin read repos)
 *       § Interface Definitions › admin-analytics-repo (these exact signatures)
 *       § API Design (from/to/bucket params; default last 7 days handled by the route)
 *       § Technical Decisions AD-6/ADMIN-BR-5 (cost is an ESTIMATE — `estimated:true`),
 *         AD-7 (SQL GROUP BY + date_trunc bucketing).
 *   - requirements.md ADMIN-US-2/3/4/5/7/11, ADMIN-BR-8 (date-range), BR-9 (taxonomy).
 *
 * Boundary rules (CLAUDE.md "repos are the sole Postgres readers"; mirrors
 * accounts-repo.ts / conversation-repo.ts):
 *   - `import "server-only"` — never bundled to the client.
 *   - Reads the memoized `@/data/db` singleton directly (not a per-request ctx).
 *   - NEVER mutates (ADMIN-BR-2) — every statement here is a SELECT.
 *   - Returns the camelCase wire shapes from `@/lib/admin/admin-types`; the route
 *     wraps them with the resolved `range`.
 *
 * Aggregation conventions:
 *   - Range is half-open `[from, to)` (the `to` bound is EXCLUSIVE, matching the
 *     admin-types `Range` doc) so adjacent windows don't double-count an edge turn.
 *   - Time buckets are TIMEZONE-INDEPENDENT: `date_trunc(bucket, ts AT TIME ZONE
 *     'UTC')` truncates the UTC wall clock and the result is converted back to an
 *     epoch-ms instant, so a `day`/`hour` bucket means a UTC day/hour regardless
 *     of the DB session timezone (AD-7).
 *   - node-postgres returns `bigint`/`count(*)`/`sum()` as STRINGS and the
 *     `created_at` bigint column as a STRING under raw `db.execute`; every numeric
 *     read is coerced through `num()` (the raw-SQL analogue of `.mapWith(Number)`).
 *   - Estimated USD is computed in JS via the static price table
 *     (`@/server/admin/pricing`), NOT in SQL, so pricing stays a single code
 *     constant (AD-6) and an unknown/unpriced model contributes $0.
 */

import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/data/db";
import { MODEL_PRICING, estimateCostUsd } from "@/server/admin/pricing";
import type {
  CostBreakdownResult,
  CostBucket,
  CostByModel,
  ErrorBreakdownResult,
  ErrorCategory,
  ErrorCategoryKey,
  HeavyUserRow,
  HeavyUserSort,
  HeavyUsersResult,
  LiveResponse,
  Range,
  TurnMode,
  TurnRecordStatus,
  TurnSummary,
  UsageBucket,
  UsageSeriesResult,
  UsageTotals,
} from "@/lib/admin/admin-types";

/** A raw result row from `db.execute` (loosely typed; coerced field-by-field). */
type Row = Record<string, unknown>;

/** Number of most-recent turns returned by {@link getLive}. */
const RECENT_LIMIT = 20;
const HOUR_MS = 3_600_000;

/** Coerce a possibly-string (bigint/count/sum) DB value to a finite number. */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rowsOf(res: { rows: unknown[] }): Row[] {
  return res.rows as Row[];
}

/**
 * SQL fragment: the bucket-start epoch-ms for `created_at`, truncated to a UTC
 * `day`/`hour` and converted back to an instant. TZ-independent (see header).
 */
function bucketStartMs(bucket: string) {
  return sql`(extract(epoch from (date_trunc(${bucket}::text, to_timestamp(created_at / 1000.0) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) * 1000)::bigint`;
}

/** True when the (non-null) model has a price entry (AD-6). */
function isPriced(model: string | null): boolean {
  return (
    model != null &&
    Object.prototype.hasOwnProperty.call(MODEL_PRICING, model)
  );
}

// ===========================================================================
// getUsageSeries — turns / distinct active users / signups, per bucket + totals
// ===========================================================================

export async function getUsageSeries(r: Range): Promise<UsageSeriesResult> {
  // Per-bucket turns + distinct active signed accounts + distinct active guest
  // sessions. count(DISTINCT account_id) ignores NULLs (guests); the CASE
  // isolates guest sessions for the guest distinct-count.
  const turnRows = rowsOf(
    await db.execute(sql`
      SELECT ${bucketStartMs(r.bucket)} AS t,
             count(*) AS turns,
             count(DISTINCT account_id) AS active_signed,
             count(DISTINCT (CASE WHEN account_id IS NULL THEN session_id END)) AS active_guest
      FROM turn_record
      WHERE created_at >= ${r.from} AND created_at < ${r.to}
      GROUP BY 1
      ORDER BY 1
    `),
  );

  // Per-bucket signups come straight from account.created_at (design § Data Model).
  const signupRows = rowsOf(
    await db.execute(sql`
      SELECT ${bucketStartMs(r.bucket)} AS t, count(*) AS signups
      FROM account
      WHERE created_at >= ${r.from} AND created_at < ${r.to}
      GROUP BY 1
      ORDER BY 1
    `),
  );

  // Merge the two series by bucket-start (union of keys; missing → 0).
  const byT = new Map<number, UsageBucket>();
  const at = (t: number): UsageBucket => {
    let b = byT.get(t);
    if (!b) {
      b = { t, turns: 0, activeSigned: 0, activeGuest: 0, signups: 0 };
      byT.set(t, b);
    }
    return b;
  };
  for (const row of turnRows) {
    const b = at(num(row.t));
    b.turns = num(row.turns);
    b.activeSigned = num(row.active_signed);
    b.activeGuest = num(row.active_guest);
  }
  for (const row of signupRows) {
    at(num(row.t)).signups = num(row.signups);
  }
  const buckets = [...byT.values()].sort((a, b) => a.t - b.t);

  // Range totals (distinct over the WHOLE window, not the sum of per-bucket
  // distincts) + guest/signed split.
  const totalRow = rowsOf(
    await db.execute(sql`
      SELECT count(*) AS turns,
             count(DISTINCT account_id) AS active_signed,
             count(DISTINCT (CASE WHEN account_id IS NULL THEN session_id END)) AS active_guest,
             count(*) FILTER (WHERE account_id IS NULL) AS guest_turns,
             count(*) FILTER (WHERE account_id IS NOT NULL) AS signed_turns
      FROM turn_record
      WHERE created_at >= ${r.from} AND created_at < ${r.to}
    `),
  )[0];
  const signupTotalRow = rowsOf(
    await db.execute(sql`
      SELECT count(*) AS signups FROM account
      WHERE created_at >= ${r.from} AND created_at < ${r.to}
    `),
  )[0];

  const totals: UsageTotals = {
    turns: num(totalRow?.turns),
    activeSigned: num(totalRow?.active_signed),
    activeGuest: num(totalRow?.active_guest),
    signups: num(signupTotalRow?.signups),
    guestTurns: num(totalRow?.guest_turns),
    signedTurns: num(totalRow?.signed_turns),
  };

  return { buckets, totals };
}

// ===========================================================================
// getCostBreakdown — token totals & estimated USD by model + per-bucket trend
// ===========================================================================

export async function getCostBreakdown(r: Range): Promise<CostBreakdownResult> {
  // Per-model token sums over the range.
  const modelRows = rowsOf(
    await db.execute(sql`
      SELECT model,
             COALESCE(sum(input_tokens), 0) AS input_tokens,
             COALESCE(sum(output_tokens), 0) AS output_tokens,
             COALESCE(sum(thinking_tokens), 0) AS thinking_tokens
      FROM turn_record
      WHERE created_at >= ${r.from} AND created_at < ${r.to}
      GROUP BY model
      ORDER BY model
    `),
  );

  let totalEstUsd = 0;
  const byModel: CostByModel[] = modelRows.map((row) => {
    const model = (row.model as string | null) ?? null;
    const inputTokens = num(row.input_tokens);
    const outputTokens = num(row.output_tokens);
    const thinkingTokens = num(row.thinking_tokens);
    const estUsd = estimateCostUsd({
      model,
      inputTokens,
      outputTokens,
      thinkingTokens,
    });
    totalEstUsd += estUsd;
    return {
      model: model ?? "n/a", // null model (rate_limited rows) → "n/a"
      inputTokens,
      outputTokens,
      thinkingTokens,
      estUsd,
      priced: isPriced(model),
    };
  });

  // Per-(bucket, model) token sums → priced per model, then summed per bucket so
  // each model is costed at its own rate (AD-6).
  const seriesRows = rowsOf(
    await db.execute(sql`
      SELECT ${bucketStartMs(r.bucket)} AS t,
             model,
             COALESCE(sum(input_tokens), 0) AS input_tokens,
             COALESCE(sum(output_tokens), 0) AS output_tokens,
             COALESCE(sum(thinking_tokens), 0) AS thinking_tokens
      FROM turn_record
      WHERE created_at >= ${r.from} AND created_at < ${r.to}
      GROUP BY 1, model
      ORDER BY 1
    `),
  );
  const seriesByT = new Map<number, number>();
  for (const row of seriesRows) {
    const t = num(row.t);
    const estUsd = estimateCostUsd({
      model: (row.model as string | null) ?? null,
      inputTokens: num(row.input_tokens),
      outputTokens: num(row.output_tokens),
      thinkingTokens: num(row.thinking_tokens),
    });
    seriesByT.set(t, (seriesByT.get(t) ?? 0) + estUsd);
  }
  const series: CostBucket[] = [...seriesByT.entries()]
    .map(([t, estUsd]) => ({ t, estUsd }))
    .sort((a, b) => a.t - b.t);

  return { byModel, series, totalEstUsd, estimated: true };
}

// ===========================================================================
// getErrorBreakdown — the ADMIN-BR-9 failure taxonomy over the range
// ===========================================================================

export async function getErrorBreakdown(
  r: Range,
): Promise<ErrorBreakdownResult> {
  // turn_record-sourced categories (statuses + the denormalized tool_error_count).
  const trRow = rowsOf(
    await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'resolution_failed') AS resolution_failed,
        count(*) FILTER (WHERE status = 'clarification_needed') AS clarification_needed,
        count(*) FILTER (WHERE status = 'insufficient_data') AS insufficient_data,
        count(*) FILTER (WHERE tool_error_count > 0) AS tool_error,
        count(*) FILTER (WHERE status = 'rate_limited') AS rate_limited,
        count(*) AS total_turns
      FROM turn_record
      WHERE created_at >= ${r.from} AND created_at < ${r.to}
    `),
  )[0];

  // otp_email_failed is an AUTH event, not a turn (BR-9 spans both surfaces).
  const aeRow = rowsOf(
    await db.execute(sql`
      SELECT count(*) AS otp_email_failed
      FROM auth_event
      WHERE type = 'otp_email_failed'
        AND created_at >= ${r.from} AND created_at < ${r.to}
    `),
  )[0];

  const totalTurns = num(trRow?.total_turns);
  const counts: Record<ErrorCategoryKey, number> = {
    resolution_failed: num(trRow?.resolution_failed),
    clarification_needed: num(trRow?.clarification_needed),
    insufficient_data: num(trRow?.insufficient_data),
    tool_error: num(trRow?.tool_error),
    otp_email_failed: num(aeRow?.otp_email_failed),
    rate_limited: num(trRow?.rate_limited),
  };

  // Fixed display order (mirrors the ErrorCategoryKey union in admin-types).
  const order: ErrorCategoryKey[] = [
    "resolution_failed",
    "clarification_needed",
    "insufficient_data",
    "tool_error",
    "otp_email_failed",
    "rate_limited",
  ];
  const categories: ErrorCategory[] = order.map((key) => ({
    key,
    count: counts[key],
    ratePct: totalTurns > 0 ? (counts[key] / totalTurns) * 100 : 0,
  }));

  return { categories, totalTurns };
}

// ===========================================================================
// getHeavyUsers — ranked accounts AND guest sessions (ADMIN-AC-11.1)
// ===========================================================================

export async function getHeavyUsers(
  r: Range,
  sort: HeavyUserSort,
  limit: number,
): Promise<HeavyUsersResult> {
  // Group by subject AND model so each model's tokens are priced at its own rate.
  // Subject = the account (signed) OR the session (guest, account_id IS NULL).
  const rows = rowsOf(
    await db.execute(sql`
      SELECT tr.account_id AS account_id,
             (CASE WHEN tr.account_id IS NULL THEN tr.session_id ELSE NULL END) AS guest_session,
             a.email AS email,
             tr.model AS model,
             count(*) AS turns,
             COALESCE(sum(tr.input_tokens), 0) AS input_tokens,
             COALESCE(sum(tr.output_tokens), 0) AS output_tokens,
             COALESCE(sum(tr.thinking_tokens), 0) AS thinking_tokens,
             count(*) FILTER (WHERE tr.status = 'rate_limited') AS rate_limited,
             count(*) FILTER (WHERE tr.status IN ('resolution_failed', 'clarification_needed', 'insufficient_data')) AS failed
      FROM turn_record tr
      LEFT JOIN account a ON a.id = tr.account_id
      WHERE tr.created_at >= ${r.from} AND tr.created_at < ${r.to}
      GROUP BY tr.account_id, guest_session, a.email, tr.model
    `),
  );

  // Reduce the per-(subject, model) rows to one row per subject.
  interface Acc extends HeavyUserRow {
    key: string;
  }
  const bySubject = new Map<string, Acc>();
  for (const row of rows) {
    const accountId = (row.account_id as string | null) ?? null;
    const guestSession = (row.guest_session as string | null) ?? null;
    const key = accountId ?? `guest:${guestSession}`;
    let acc = bySubject.get(key);
    if (!acc) {
      acc = {
        key,
        accountId,
        email: (row.email as string | null) ?? null,
        turns: 0,
        estUsd: 0,
        rateLimited: 0,
        failed: 0,
      };
      bySubject.set(key, acc);
    }
    acc.turns += num(row.turns);
    acc.rateLimited += num(row.rate_limited);
    acc.failed += num(row.failed);
    acc.estUsd += estimateCostUsd({
      model: (row.model as string | null) ?? null,
      inputTokens: num(row.input_tokens),
      outputTokens: num(row.output_tokens),
      thinkingTokens: num(row.thinking_tokens),
    });
  }

  const metric = (a: Acc): number => {
    if (sort === "turns") return a.turns;
    if (sort === "cost") return a.estUsd;
    return a.rateLimited + a.failed; // "errors"
  };
  // Primary by the chosen metric (desc), then deterministic tiebreaks: turns,
  // est cost, then the stable subject key.
  const ranked = [...bySubject.values()].sort(
    (a, b) =>
      metric(b) - metric(a) ||
      b.turns - a.turns ||
      b.estUsd - a.estUsd ||
      a.key.localeCompare(b.key),
  );

  const cap = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : ranked.length;
  const result: HeavyUserRow[] = ranked.slice(0, cap).map((a) => ({
    accountId: a.accountId,
    email: a.email,
    turns: a.turns,
    estUsd: a.estUsd,
    rateLimited: a.rateLimited,
    failed: a.failed,
  }));

  return { rows: result };
}

// ===========================================================================
// getLive — last N turns + current-window counters (ADMIN-US-7, BR-10 polling)
// ===========================================================================

export async function getLive(): Promise<LiveResponse> {
  const now = Date.now();
  const since = now - HOUR_MS;

  const recentRows = rowsOf(
    await db.execute(sql`
      SELECT tr.*, a.email AS account_email
      FROM turn_record tr
      LEFT JOIN account a ON a.id = tr.account_id
      ORDER BY tr.created_at DESC, tr.id DESC
      LIMIT ${RECENT_LIMIT}
    `),
  );
  const recent: TurnSummary[] = recentRows.map(toTurnSummary);

  const windowRow = rowsOf(
    await db.execute(sql`
      SELECT count(*) AS last_hour_turns,
             count(DISTINCT session_id) AS last_hour_active
      FROM turn_record
      WHERE created_at >= ${since}
    `),
  )[0];

  return {
    recent,
    window: {
      lastHourTurns: num(windowRow?.last_hour_turns),
      lastHourActive: num(windowRow?.last_hour_active),
    },
  };
}

/** Map a raw `turn_record` row (+ joined account_email) to a {@link TurnSummary}. */
function toTurnSummary(row: Row): TurnSummary {
  const model = (row.model as string | null) ?? null;
  const inputTokens = num(row.input_tokens);
  const outputTokens = num(row.output_tokens);
  const thinkingTokens = num(row.thinking_tokens);
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    accountId: (row.account_id as string | null) ?? null,
    accountEmail: (row.account_email as string | null) ?? null,
    model,
    providerModel: (row.provider_model as string | null) ?? null,
    mode: row.mode as TurnMode,
    status: row.status as TurnRecordStatus,
    inputTokens,
    outputTokens,
    thinkingTokens,
    toolErrorCount: num(row.tool_error_count),
    citationCount: num(row.citation_count),
    turnLatencyMs: num(row.turn_latency_ms),
    imagesCount: num(row.images_count),
    promptText: (row.prompt_text as string | null) ?? "",
    estUsd: estimateCostUsd({ model, inputTokens, outputTokens, thinkingTokens }),
    createdAt: num(row.created_at),
  };
}
