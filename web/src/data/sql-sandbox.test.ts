/**
 * Pure unit tests for the SQL sandbox — the branches that resolve BEFORE any
 * pool is touched, so no Postgres/Docker is needed:
 *   - the deny-list refuses a query that names a restricted user/auth table,
 *     with no DB access at all,
 *   - an empty / whitespace / semicolon-only query is refused,
 *   - dropped other-game warehouse tables are not sandbox-queryable
 *     (CF-DATA-BR-3, CF-INT-BR-3, ADR-4).
 *
 * P3 deletes T18 `run_sql`. This file must not import that tool or pin a
 * barrel slot. The DB-backed behaviour (READ ONLY txn, role/timeout) is out
 * of scope here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  runSandboxedQuery,
  resetSandboxPool,
  referencesRestrictedTable,
} from "./sql-sandbox";

beforeEach(() => {
  // No pool installed — the branches under test must not reach getBundle().
  resetSandboxPool();
});

afterEach(() => {
  resetSandboxPool();
});

function isError(
  out: unknown,
): out is { error: "query_failed" | "query_timeout"; hint?: string } {
  return typeof out === "object" && out !== null && "error" in out;
}

/** Other-game reference tables DROPped by 0023 — must not remain allowlisted. */
const DROPPED_WAREHOUSE_TABLES = [
  "wiki_page",
  "wiki_chunk",
  "natdex_species",
  "natdex_machines",
  "natdex_moves",
  "classic_encounters",
  "pmd_recruits",
  "meta_snapshot",
  "meta_usage",
] as const;

/** Remaining index + operator item tables the sandbox may still name. */
const REMAINING_INDEX_TABLES = [
  "pokemon",
  "learnset",
  "reference_cache",
  "searchable_names",
  "ingest_meta",
  "champions_item_exclusion",
] as const;

describe("sql-sandbox — deny-list (no DB access)", () => {
  const denied = [
    "SELECT * FROM account",
    "SELECT email FROM auth_session",
    "SELECT * FROM otp_code",
    "SELECT id FROM conversation",
    "SELECT * FROM conversation_message",
    "SELECT * FROM conversation_folder",
    "SELECT format FROM account_scope_mru",
    "SELECT * FROM shared_answer",
    "SELECT name FROM team",
    "SELECT * FROM turn_record",
    "SELECT * FROM auth_event",
    "SELECT * FROM account_denylist",
    "SELECT * FROM account_cap_exempt",
    "SELECT * FROM spend_daily_usage",
    "SELECT p.id FROM pokemon p, account a WHERE a.id = p.id",
  ];

  for (const q of denied) {
    it(`refuses: ${q}`, async () => {
      const out = await runSandboxedQuery(q);
      expect(isError(out)).toBe(true);
      if (!isError(out)) return;
      expect(out.error).toBe("query_failed");
      expect(out.hint).toContain("restricted");
    });
  }

  it("word-boundary matches — a column like 'teammate' is NOT flagged", () => {
    expect(referencesRestrictedTable("SELECT * FROM account")).toBe(true);
    expect(referencesRestrictedTable("SELECT teammate FROM pokemon")).toBe(false);
    expect(referencesRestrictedTable("SELECT accounts FROM x")).toBe(false);
    expect(referencesRestrictedTable("SELECT * FROM pokemon")).toBe(false);
    // Underscore-suffixed chat-qol tables are their own identifiers;
    // `\bconversation\b` / `\baccount\b` do not match them.
    expect(referencesRestrictedTable("SELECT * FROM conversation_folder")).toBe(
      true,
    );
    expect(referencesRestrictedTable("SELECT * FROM account_scope_mru")).toBe(
      true,
    );
    expect(referencesRestrictedTable("SELECT * FROM shared_answer")).toBe(true);
    // Spend-control tables are their own identifiers (`\baccount\b` does not
    // match `account_denylist` / `account_cap_exempt`); all three must be on
    // DENIED_TABLES.
    expect(referencesRestrictedTable("SELECT * FROM account_denylist")).toBe(
      true,
    );
    expect(referencesRestrictedTable("SELECT * FROM account_cap_exempt")).toBe(
      true,
    );
    expect(referencesRestrictedTable("SELECT * FROM spend_daily_usage")).toBe(
      true,
    );
  });
});

describe("sql-sandbox — empty query", () => {
  it("refuses an empty query", async () => {
    const out = await runSandboxedQuery("   ");
    expect(isError(out)).toBe(true);
    if (!isError(out)) return;
    expect(out.error).toBe("query_failed");
  });

  it("refuses a semicolon-only query", async () => {
    const out = await runSandboxedQuery(" ; ");
    expect(isError(out)).toBe(true);
  });
});

describe("sql-sandbox — remaining index allowlist (CF-DATA-BR-3)", () => {
  it("does not treat remaining Champions index tables as restricted", () => {
    for (const table of REMAINING_INDEX_TABLES) {
      expect(referencesRestrictedTable(`SELECT * FROM ${table}`)).toBe(false);
    }
  });
});

describe("sql-sandbox — dropped other-game tables are not allowlisted (CF-DATA-BR-3, CF-INT-BR-3, ADR-4)", () => {
  for (const table of DROPPED_WAREHOUSE_TABLES) {
    it(`treats ${table} as restricted so the pool is never reached`, async () => {
      expect(referencesRestrictedTable(`SELECT * FROM ${table}`)).toBe(true);
      const out = await runSandboxedQuery(`SELECT * FROM ${table}`);
      expect(isError(out)).toBe(true);
      if (!isError(out)) return;
      expect(out.error).toBe("query_failed");
      expect(out.hint).toContain("restricted");
    });
  }
});
