/**
 * Oracle tests for src/data/repos/scope-mru-repo.ts — per-account scope
 * most-recently-used list (docs/features/chat-qol). Asserts behaviour
 * against a real migrated Postgres schema (Testcontainers).
 *
 * The repo reads the `@/data/db` SINGLETON, so the harness installs the
 * fixture as the singleton BEFORE the first dynamic import.
 *
 * Expected exports:
 *   touch(accountId, format, at) → void   (upsert on (account_id, format))
 *   list(accountId) → Format[]            (ORDER BY last_used_at DESC)
 */

import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

import type { Format } from "@/data/formats";

type Repo = typeof import("./scope-mru-repo");

let fix: PgFixture;
let repo: Repo;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  repo = await import("./scope-mru-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(sql`TRUNCATE TABLE account_scope_mru RESTART IDENTITY`);
});

const ACCT_A = "account-a";
const ACCT_B = "account-b";

describe("touch + list", () => {
  it("lists formats newest-first by last_used_at", async () => {
    await repo.touch(ACCT_A, "national-dex", 1000);
    await repo.touch(ACCT_A, "scarlet-violet", 2000);
    await repo.touch(ACCT_A, "gen-1", 3000);

    const listed: Format[] = await repo.list(ACCT_A);
    expect(listed).toEqual(["gen-1", "scarlet-violet", "national-dex"]);
  });

  it("upserts on (account_id, format) — a later touch moves that format to the front", async () => {
    await repo.touch(ACCT_A, "national-dex", 1000);
    await repo.touch(ACCT_A, "scarlet-violet", 2000);
    await repo.touch(ACCT_A, "national-dex", 4000);

    expect(await repo.list(ACCT_A)).toEqual(["national-dex", "scarlet-violet"]);
    const res = await fix.db.execute(
      sql`SELECT count(*)::int AS n FROM account_scope_mru WHERE account_id = ${ACCT_A}`,
    );
    expect((res.rows[0] as { n: number }).n).toBe(2);
  });

  it("is isolated per account (AUTH-BR-5)", async () => {
    await repo.touch(ACCT_A, "gen-7", 1000);
    await repo.touch(ACCT_B, "champions", 2000);
    await repo.touch(ACCT_B, "gen-1", 3000);

    expect(await repo.list(ACCT_A)).toEqual(["gen-7"]);
    expect(await repo.list(ACCT_B)).toEqual(["gen-1", "champions"]);
  });

  it("returns [] for an account with no MRU rows", async () => {
    expect(await repo.list(ACCT_A)).toEqual([]);
  });
});
