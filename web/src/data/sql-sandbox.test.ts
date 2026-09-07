/**
 * Pure unit tests for the SQL sandbox — the branches that resolve BEFORE any
 * pool is touched, so no Postgres/Docker is needed:
 *   - the deny-list refuses a query that names a restricted user/auth table,
 *     with no DB access at all,
 *   - an empty / whitespace / semicolon-only query is refused,
 *   - the run_sql tool degrades invalid input to a structured miss,
 *   - run_sql occupies its fixed append-only barrel slot (index 18).
 * The DB-backed behaviour (READ ONLY txn, role/timeout/truncation) is covered by
 * run-sql.oracle.test.ts against a real Postgres container.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentContext } from "@/agent/types";
import type { RunSqlOutput } from "@/agent/schemas";

import {
  runSandboxedQuery,
  resetSandboxPool,
  referencesRestrictedTable,
} from "./sql-sandbox";
import { runSqlTool } from "@/agent/tools/run-sql";
import { tools } from "@/agent/tools";

const ctx = { logger: console, requestId: "test" } as unknown as AgentContext;

beforeEach(() => {
  // No pool installed — the branches under test must not reach getBundle().
  resetSandboxPool();
});

afterEach(() => {
  resetSandboxPool();
});

function isError(
  out: RunSqlOutput,
): out is { error: "query_failed" | "query_timeout"; hint?: string } {
  return "error" in out;
}

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
    // Denied identifiers are matched whole-word, so warehouse identifiers that
    // merely contain a denied substring pass the gate.
    expect(referencesRestrictedTable("SELECT * FROM account")).toBe(true);
    expect(referencesRestrictedTable("SELECT teammate FROM natdex_species")).toBe(
      false,
    );
    expect(referencesRestrictedTable("SELECT accounts FROM x")).toBe(false);
    expect(referencesRestrictedTable("SELECT * FROM natdex_species")).toBe(false);
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

describe("run_sql tool — invalid input", () => {
  it("degrades missing fields to query_failed with a hint, no throw", async () => {
    const out = (await runSqlTool.run({}, ctx)) as RunSqlOutput;
    expect(isError(out)).toBe(true);
    if (!isError(out)) return;
    expect(out.error).toBe("query_failed");
    expect(out.hint).toContain("invalid input");
  });

  it("degrades an over-length query to query_failed", async () => {
    const out = (await runSqlTool.run(
      { query: "x".repeat(6000), purpose: "too long" },
      ctx,
    )) as RunSqlOutput;
    expect(isError(out)).toBe(true);
  });
});

describe("run_sql holds its fixed T18 slot (append-only order)", () => {
  it("exposes run_sql at index 17, right after get_learnset at index 16", () => {
    expect(tools[16]?.name).toBe("get_learnset");
    expect(tools[17]?.name).toBe("run_sql");
    expect(runSqlTool.name).toBe("run_sql");
  });
});
