// prune-turn-records.mjs — B-26 turn_record fat-column strip.
//
// Plain ESM (no TypeScript, no `@/` alias, no src/env.ts) so it runs in the
// production image next to migrate.mjs. Keep the SQL / windows in sync with
// web/src/data/repos/turn-record-retention.ts (oracle-tested).
//
//   node prune-turn-records.mjs     operator CLI (force run)
//   start.mjs                       daily in-process tick on the web machine
import { fileURLToPath } from "node:url";
import path from "node:path";

import pg from "pg";

export const SIGNED_IN_FULL_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const GUEST_FULL_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const PRUNE_BATCH_SIZE = 1000;
export const PRUNE_LAST_RUN_SETTING_KEY = "turn_record_prune_last_run";
export const PRUNE_ADVISORY_LOCK_KEY = 0x4f414b26;
export const PRUNE_STATEMENT_TIMEOUT_MS = 120_000;

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

async function stripBatch(client, sql, params) {
  const res = await client.query(sql, params);
  return res.rowCount ?? 0;
}

export async function pruneTurnRecordsOn(client, now = Date.now()) {
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

export async function runPruneExclusive(pool, opts = {}) {
  const now = opts.now ?? Date.now();
  const client = await pool.connect();
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [
      PRUNE_ADVISORY_LOCK_KEY,
    ]);
    if (!lock.rows[0]?.ok) {
      return { skipped: "lock" };
    }
    try {
      if (!opts.force) {
        const last = await client.query(
          "SELECT value FROM app_setting WHERE key = $1 LIMIT 1",
          [PRUNE_LAST_RUN_SETTING_KEY],
        );
        const lastRunAt = last.rows[0]
          ? Number.parseInt(last.rows[0].value, 10)
          : Number.NaN;
        if (Number.isFinite(lastRunAt) && now - lastRunAt < PRUNE_INTERVAL_MS) {
          return { skipped: "interval", lastRunAt };
        }
      }
      await client.query(
        `SET statement_timeout = ${PRUNE_STATEMENT_TIMEOUT_MS}`,
      );
      const result = await pruneTurnRecordsOn(client, now);
      await client.query(
        `INSERT INTO app_setting (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXCLUDED.updated_at`,
        [PRUNE_LAST_RUN_SETTING_KEY, String(now), "turn-record-prune", now],
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

function logInfo(msg, extra) {
  // eslint-disable-next-line no-console
  console.log(`[turn-record-prune] ${msg}`, extra ?? "");
}

function logError(msg, extra) {
  // eslint-disable-next-line no-console
  console.error(`[turn-record-prune] ${msg}`, extra ?? "");
}

export async function runScheduledTurnRecordPrune(pool, now = Date.now()) {
  try {
    const outcome = await runPruneExclusive(pool, { now });
    if (outcome.skipped === "lock") {
      logInfo("skipped: another prune is running");
      return;
    }
    if (outcome.skipped === "interval") {
      logInfo("skipped: last run within 24h", {
        last_run_at: outcome.lastRunAt,
      });
      return;
    }
    logInfo("ok", outcome.result);
  } catch (err) {
    logError("failed", err instanceof Error ? err.message : String(err));
  }
}

let started = false;

/** Daily tick for the always-on web process. Fail-soft. No-op without DATABASE_URL. */
export function startTurnRecordPruneScheduler() {
  if (started) return;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logError("DATABASE_URL is not set; prune scheduler not started");
    return;
  }
  started = true;
  const pool = new pg.Pool({ connectionString, max: 1 });
  const tick = () => {
    void runScheduledTurnRecordPrune(pool);
  };
  tick();
  const timer = setInterval(tick, PRUNE_INTERVAL_MS);
  timer.unref();
}

const thisFile = fileURLToPath(import.meta.url);
const invokedAsCli =
  process.argv[1] != null && path.resolve(process.argv[1]) === thisFile;

if (invokedAsCli) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logError("DATABASE_URL is not set");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString });
  try {
    const outcome = await runPruneExclusive(pool, {
      now: Date.now(),
      force: true,
    });
    if (outcome.skipped === "lock") {
      logInfo("skipped: another prune is running");
    } else {
      logInfo(
        `scanned=${outcome.result.scanned} strippedGuest=${outcome.result.strippedGuest} strippedSigned=${outcome.result.strippedSigned}`,
      );
    }
  } catch (err) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    logError("failed:", detail);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
