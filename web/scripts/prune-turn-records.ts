/**
 * `npm run db:prune-turns` — operator-run strip of aged `turn_record` blobs.
 *
 * Opens its own pg.Pool over DATABASE_URL (no `src/env.ts`, so no XAI_API_KEY).
 * Always runs (ignores the 24h last-run skip). Takes the same advisory lock as
 * the in-process tick so the two cannot overlap; if the lock is busy, logs and
 * exits 0. Not hooked to Fly `release_command`.
 */

import process from "node:process";

import { Pool } from "pg";

import {
  PRUNE_ADVISORY_LOCK_KEY,
  PRUNE_STATEMENT_TIMEOUT_MS,
  pruneTurnRecordsOn,
} from "../src/data/repos/turn-record-retention";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // eslint-disable-next-line no-console
  console.error("[db:prune-turns] DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const client = await pool.connect();
try {
  const lock = await client.query<{ ok: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS ok",
    [PRUNE_ADVISORY_LOCK_KEY],
  );
  if (!lock.rows[0]?.ok) {
    // eslint-disable-next-line no-console
    console.log("[db:prune-turns] skipped: another prune is running");
  } else {
    try {
      await client.query(
        `SET statement_timeout = ${PRUNE_STATEMENT_TIMEOUT_MS}`,
      );
      const result = await pruneTurnRecordsOn(client, Date.now());
      // eslint-disable-next-line no-console
      console.log(
        `[db:prune-turns] scanned=${result.scanned} strippedGuest=${result.strippedGuest} strippedSigned=${result.strippedSigned}`,
      );
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
  }
} catch (err) {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  // eslint-disable-next-line no-console
  console.error("[db:prune-turns] failed:", detail);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
