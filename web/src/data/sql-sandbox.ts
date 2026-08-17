/**
 * SQL sandbox — the guarded, read-only executor behind the T18 `run_sql` tool.
 *
 * This is the ONLY place the model's own SQL touches Postgres, and it is
 * deliberately isolated from the app's main `db.ts` pool:
 *
 *   - Its OWN small `pg.Pool` (max 2) over DATABASE_URL, memoized on globalThis
 *     the same way `db.ts` memoizes the app pool (survives Next hot-reload). A
 *     test seam (`installSandboxPool`) swaps in a fixture-schema pool, mirroring
 *     how `test/support/pg.ts` installs the app db singleton.
 *   - Every call runs inside `BEGIN TRANSACTION READ ONLY … ROLLBACK` — the
 *     transaction-level read-only mode is the REAL write barrier (no INSERT/
 *     UPDATE/DELETE/DDL can run, whatever the SQL says).
 *   - `SET LOCAL statement_timeout = 3000` caps runtime per call.
 *   - When the cluster has the `oak_readonly` role (created by migration 0009),
 *     `SET LOCAL ROLE oak_readonly` restricts reads to the allowlisted warehouse
 *     tables at the DB level. If that role can't be assumed (e.g. the Fly attach
 *     role lacked CREATEROLE, so the migration logged a NOTICE and skipped it),
 *     the executor falls back to READ ONLY + a defense-in-depth deny-list regex
 *     that blocks the sensitive user/auth tables from being named. The pool
 *     probes its capability once at init and picks the configuration.
 *   - The query is wrapped as `SELECT * FROM ( <query> ) oak_sub LIMIT $1`,
 *     which caps the result and forces a SELECT-shaped statement (DDL/DML/
 *     EXPLAIN won't parse inside a subquery). The `$1` bind parameter is the
 *     load-bearing safety detail: a real parameter makes node-postgres use the
 *     EXTENDED query protocol (Parse/Bind — `requiresPreparation()` is true only
 *     when `values.length > 0`, so an EMPTY array would silently fall back to
 *     the simple protocol and run multiple `;`-separated commands). Under the
 *     extended protocol Postgres rejects ANY multi-command string outright
 *     ("cannot insert multiple commands into a prepared statement"), which also
 *     defeats a paren-escape that breaks out of the subquery wrap
 *     (`1) oak_sub LIMIT 1; RESET ROLE; SELECT …`).
 *
 * Never throws in-domain: bad SQL / permission errors become
 * `{ error: "query_failed", hint }`, a statement_timeout becomes
 * `{ error: "query_timeout", hint }`. Only genuine infrastructure faults (pool
 * cannot connect at all) propagate.
 */

import "server-only";

import { Pool, type PoolClient } from "pg";

import { env } from "@/env";
import type { RunSqlOutput } from "@/agent/schemas";

/** Hard row cap — the outer wrap's LIMIT and the truncation signal. */
const ROW_LIMIT = 200;
/** Per-query server-side timeout (ms). */
const STATEMENT_TIMEOUT_MS = 3000;
/** Any single returned cell longer than this is clipped (with an ellipsis). */
const MAX_CELL_CHARS = 400;
/** The DB role that restricts reads to the warehouse allowlist (migration 0009). */
const READONLY_ROLE = "oak_readonly";

/**
 * Sensitive tables that carry user / auth / operator data. The READ ONLY
 * transaction already blocks any WRITE to them; this deny-list is a
 * defense-in-depth guard against SELECT-exfiltration and is the enforced floor
 * when the `oak_readonly` role is unavailable. Matched as whole identifiers.
 */
const DENIED_TABLES = [
  "account",
  "account_scope_mru",
  "auth_session",
  "otp_code",
  "conversation",
  "conversation_folder",
  "conversation_message",
  "shared_answer",
  "team",
  "turn_record",
  "auth_event",
];

const DENY_RE = new RegExp(`\\b(?:${DENIED_TABLES.join("|")})\\b`, "i");

/**
 * True when the query names a restricted user/auth/operator table as a whole
 * identifier. Whole-word matched, so a warehouse column like `teammate` (which
 * merely contains "team") is NOT flagged. Exported for direct unit testing.
 */
export function referencesRestrictedTable(query: string): boolean {
  return DENY_RE.test(query);
}

/** A sandbox pool plus the config the init probe resolved for it. */
interface SandboxBundle {
  pool: Pool;
  /** True ⇒ `SET LOCAL ROLE oak_readonly` is applied per call. */
  useRole: boolean;
  /** Resolves once the capability probe has run. */
  ready: Promise<void>;
}

const globalForSandbox = globalThis as typeof globalThis & {
  __oakSqlSandbox?: SandboxBundle;
};

/**
 * Probe whether this pool can assume the read-only role: try `SET LOCAL ROLE`
 * inside a throwaway READ ONLY transaction. Success ⇒ the role exists AND the
 * connecting user may switch to it. Any failure ⇒ fall back to the deny-list.
 */
async function probeRole(pool: Pool): Promise<boolean> {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL ROLE ${READONLY_ROLE}`);
    await client.query("ROLLBACK");
    return true;
  } catch {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return false;
  } finally {
    client?.release();
  }
}

function createBundle(): SandboxBundle {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // A tiny pool — model-authored SQL is a rare, secondary path.
    max: 2,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Session-level backstop above the per-call SET LOCAL (which wins at 3s).
    statement_timeout: 5_000,
  });
  const bundle: SandboxBundle = {
    pool,
    useRole: false,
    ready: Promise.resolve(),
  };
  bundle.ready = probeRole(pool).then((ok) => {
    bundle.useRole = ok;
  });
  return bundle;
}

function getBundle(): SandboxBundle {
  if (!globalForSandbox.__oakSqlSandbox) {
    globalForSandbox.__oakSqlSandbox = createBundle();
  }
  return globalForSandbox.__oakSqlSandbox;
}

/**
 * Test seam — install a fixture-schema pool as the sandbox singleton, mirroring
 * `installAsSingleton` in test/support/pg.ts. `forceNoRole` pins the deny-list
 * fallback configuration so the no-role path can be exercised without dropping
 * the cluster-global role that parallel tests share; otherwise the pool is
 * probed like the real one.
 */
export function installSandboxPool(
  pool: Pool,
  opts: { forceNoRole?: boolean } = {},
): void {
  const bundle: SandboxBundle = {
    pool,
    useRole: false,
    ready: opts.forceNoRole
      ? Promise.resolve()
      : probeRole(pool).then((ok) => {
          bundle.useRole = ok;
        }),
  };
  globalForSandbox.__oakSqlSandbox = bundle;
}

/** Reset the sandbox singleton (test cleanup). */
export function resetSandboxPool(): void {
  globalForSandbox.__oakSqlSandbox = undefined;
}

/** Coerce a raw pg cell value to a JSON primitive, clipping long strings. */
function coerceCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  let s: string;
  if (typeof value === "string") {
    s = value;
  } else if (value instanceof Date) {
    s = value.toISOString();
  } else {
    // bigint, Buffer, json objects/arrays, etc.
    s = typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return s.length > MAX_CELL_CHARS ? `${s.slice(0, MAX_CELL_CHARS)}…` : s;
}

/** Strip a single trailing `;` (and surrounding whitespace) before wrapping. */
function stripTrailingSemicolon(query: string): string {
  return query.trim().replace(/;\s*$/, "");
}

/**
 * Map a caught pg error to the documented miss shape. Postgres reports a
 * statement_timeout abort with SQLSTATE 57014 (query_canceled).
 */
function toErrorOutput(err: unknown): RunSqlOutput {
  const e = err as { code?: string; message?: string };
  if (e?.code === "57014") {
    return { error: "query_timeout", hint: "exceeded 3s" };
  }
  return {
    error: "query_failed",
    hint: typeof e?.message === "string" ? e.message : "unknown error",
  };
}

/**
 * Run one model-authored query against the read-only warehouse. Returns the
 * documented `RunSqlOutput` union — never throws for an in-domain failure.
 */
export async function runSandboxedQuery(query: string): Promise<RunSqlOutput> {
  const inner = stripTrailingSemicolon(query);
  if (inner.length === 0) {
    return { error: "query_failed", hint: "empty query" };
  }

  // Defense-in-depth: refuse any query that names a sensitive table, regardless
  // of the role configuration (the READ ONLY txn is the write barrier; this
  // guards SELECT-exfiltration of user/auth data).
  if (referencesRestrictedTable(inner)) {
    return {
      error: "query_failed",
      hint: "access to a restricted table is not allowed",
    };
  }

  const bundle = getBundle();
  await bundle.ready;

  const wrapped = `SELECT * FROM (${inner}) oak_sub LIMIT $1`;

  // A failure to even acquire a connection is a genuine infrastructure fault —
  // let it propagate (not an in-domain miss).
  const client: PoolClient = await bundle.pool.connect();

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    if (bundle.useRole) {
      await client.query(`SET LOCAL ROLE ${READONLY_ROLE}`);
    }
    // The `$1` bind (ROW_LIMIT) forces the EXTENDED protocol — node-postgres
    // only prepares when values.length > 0. That rejects any multi-command
    // string ("cannot insert multiple commands into a prepared statement"),
    // including a paren-escape out of the subquery wrap. An empty array here
    // would drop to the SIMPLE protocol and execute `;`-separated commands.
    const res = await client.query({ text: wrapped, values: [ROW_LIMIT] });
    const columns = res.fields.map((f) => f.name);
    const rows = res.rows.map((row) =>
      columns.map((col) => coerceCell((row as Record<string, unknown>)[col])),
    );
    return {
      columns,
      rows,
      row_count: rows.length,
      truncated: rows.length >= ROW_LIMIT,
    };
  } catch (err) {
    return toErrorOutput(err);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}
