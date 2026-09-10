/**
 * src/data/repos/turn-record-retention.ts — B-26 prune writer for `turn_record`.
 *
 * Recording inserts stay in usage-repo (INSERT-only). This module is the only
 * writer that UPDATEs `turn_record`: after the guest (14d) / signed-in (90d)
 * full-detail windows it STRIPS fat columns and keeps analytics columns.
 * It never DELETEs rows and never touches `conversation_message`.
 *
 * No `server-only` / `src/env.ts` so the `db:prune-turns` CLI can import it
 * under tsx with only DATABASE_URL.
 */

import type { Pool, PoolClient } from "pg";

/** Full prompt/answer/tool-trace retained this long for signed-in turns. */
export const SIGNED_IN_FULL_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Full prompt/answer/tool-trace retained this long for guest turns. */
export const GUEST_FULL_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/** Daily in-process tick + last-run skip window. */
export const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Rows updated per statement so a large table cannot lock forever. */
export const PRUNE_BATCH_SIZE = 1000;

/** `app_setting.key` storing the last successful scheduled prune (epoch ms). */
export const PRUNE_LAST_RUN_SETTING_KEY = "turn_record_prune_last_run";

/**
 * Session-level Postgres advisory lock key for prune (cluster-wide, not
 * schema-scoped). 0x4f414b26 = ASCII "OAK&". Do not take this lock inside
 * {@link pruneTurnRecords} — parallel Testcontainers files would flake.
 */
export const PRUNE_ADVISORY_LOCK_KEY = 0x4f414b26;

/** Raised statement timeout on the prune connection (app pool default is 15s). */
export const PRUNE_STATEMENT_TIMEOUT_MS = 120_000;

export interface PruneTurnRecordsResult {
  /** Fat rows matched this run (equals strippedGuest + strippedSigned). */
  scanned: number;
  strippedGuest: number;
  strippedSigned: number;
}

const GUEST_FAT = `(answer_json IS NOT NULL OR answer_text IS NOT NULL OR tool_trace <> '[]' OR prompt_text <> '')`;
const SIGNED_FAT = `(answer_json IS NOT NULL OR answer_text IS NOT NULL OR tool_trace <> '[]')`;

const GUEST_STRIP_SQL = `
  UPDATE turn_record
  SET answer_json = NULL,
      answer_text = NULL,
      tool_trace = '[]',
      prompt_text = ''
  WHERE id IN (
    SELECT id FROM turn_record
    WHERE account_id IS NULL
      AND created_at < $1
      AND ${GUEST_FAT}
    LIMIT $2
  )
`;

const SIGNED_STRIP_SQL = `
  UPDATE turn_record
  SET answer_json = NULL,
      answer_text = NULL,
      tool_trace = '[]'
  WHERE id IN (
    SELECT id FROM turn_record
    WHERE account_id IS NOT NULL
      AND created_at < $1
      AND ${SIGNED_FAT}
    LIMIT $2
  )
`;

async function stripBatch(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<number> {
  const res = await client.query(sql, params);
  return res.rowCount ?? 0;
}

/**
 * Strip aged fat columns on `turn_record`. Idempotent. Caller supplies the
 * pool (tests: fixture pool; prod: `@/data/db` pool; CLI: its own pool).
 */
export async function pruneTurnRecords(
  pool: Pool,
  now: number = Date.now(),
): Promise<PruneTurnRecordsResult> {
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${PRUNE_STATEMENT_TIMEOUT_MS}`);
    return await pruneTurnRecordsOn(client, now);
  } finally {
    try {
      await client.query("RESET statement_timeout");
    } catch {
      // Connection may already be dead; release anyway.
    }
    client.release();
  }
}

/** Same as {@link pruneTurnRecords} on an already-checked-out client (lock holder). */
export async function pruneTurnRecordsOn(
  client: PoolClient,
  now: number = Date.now(),
): Promise<PruneTurnRecordsResult> {
  const guestCutoff = now - GUEST_FULL_RETENTION_MS;
  const signedCutoff = now - SIGNED_IN_FULL_RETENTION_MS;

  let strippedGuest = 0;
  for (;;) {
    const n = await stripBatch(client, GUEST_STRIP_SQL, [
      guestCutoff,
      PRUNE_BATCH_SIZE,
    ]);
    strippedGuest += n;
    if (n < PRUNE_BATCH_SIZE) break;
  }

  let strippedSigned = 0;
  for (;;) {
    const n = await stripBatch(client, SIGNED_STRIP_SQL, [
      signedCutoff,
      PRUNE_BATCH_SIZE,
    ]);
    strippedSigned += n;
    if (n < PRUNE_BATCH_SIZE) break;
  }

  return {
    scanned: strippedGuest + strippedSigned,
    strippedGuest,
    strippedSigned,
  };
}

export type ExclusivePruneOutcome =
  | { skipped: "lock" }
  | { skipped: "interval"; lastRunAt: number }
  | { skipped?: undefined; result: PruneTurnRecordsResult };

/**
 * Take the advisory lock, optionally skip if last run was < 24h ago, prune,
 * upsert last-run. `force` (CLI) ignores the interval. Failures throw to the
 * caller — the scheduler wraps this in try/catch.
 */
export async function runPruneExclusive(
  pool: Pool,
  opts: { now?: number; force?: boolean } = {},
): Promise<ExclusivePruneOutcome> {
  const now = opts.now ?? Date.now();
  const client = await pool.connect();
  try {
    const lock = await client.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS ok",
      [PRUNE_ADVISORY_LOCK_KEY],
    );
    if (!lock.rows[0]?.ok) {
      return { skipped: "lock" };
    }
    try {
      if (!opts.force) {
        const last = await client.query<{ value: string }>(
          "SELECT value FROM app_setting WHERE key = $1 LIMIT 1",
          [PRUNE_LAST_RUN_SETTING_KEY],
        );
        const lastRunAt = last.rows[0]
          ? Number.parseInt(last.rows[0].value, 10)
          : NaN;
        if (Number.isFinite(lastRunAt) && now - lastRunAt < PRUNE_INTERVAL_MS) {
          return { skipped: "interval", lastRunAt };
        }
      }
      await client.query(`SET statement_timeout = ${PRUNE_STATEMENT_TIMEOUT_MS}`);
      const result = await pruneTurnRecordsOn(client, now);
      await client.query(
        `INSERT INTO app_setting (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXCLUDED.updated_at`,
        [
          PRUNE_LAST_RUN_SETTING_KEY,
          String(now),
          "turn-record-prune",
          now,
        ],
      );
      return { result };
    } finally {
      try {
        await client.query("RESET statement_timeout");
      } catch {
        // ignore
      }
      await client.query("SELECT pg_advisory_unlock($1)", [
        PRUNE_ADVISORY_LOCK_KEY,
      ]);
    }
  } finally {
    client.release();
  }
}
