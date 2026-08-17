/**
 * Oracle tests for src/data/repos/settings-repo.ts — the operator-controlled
 * `app_setting` key/value store (first consumer: the active-model switch).
 *
 * Harness (mirrors usage-repo.oracle.test.ts): the repo reads the `@/data/db`
 * SINGLETON via a dynamic import, so we migrate an isolated Postgres schema
 * (seed "none"), installAsSingleton(fix) BEFORE the first dynamic import of the
 * repo, and neutralize `server-only` (it throws under the vitest node env).
 *
 * Coverage (plan Phase 1):
 *   - empty table → default (grok-4.6, source "default", null audit fields).
 *   - set → get roundtrip records source "db" + audit fields.
 *   - a second set overwrites (upsert) and bumps audit fields.
 *   - a hand-inserted invalid value fails soft to the default.
 *   - a DB error (missing table) fails soft to the default, never rejects.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// settings-repo.ts / db.ts `import "server-only"` (throws under node).
// Neutralize it; the real Postgres handle is supplied via installAsSingleton.
vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

type Repo = typeof import("./settings-repo");

let fix: PgFixture;
let repo: Repo;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  // Install BEFORE importing the repo so its dynamic `await import("@/data/db")`
  // resolves to this schema's handle.
  await installAsSingleton(fix);
  repo = await import("./settings-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(sql`TRUNCATE TABLE app_setting`);
});

describe("resolveActiveModel", () => {
  it("defaults to grok-4.6 when the table is empty", async () => {
    const setting = await repo.resolveActiveModel();
    expect(setting).toEqual({
      key: "grok-4.6",
      source: "default",
      updatedBy: null,
      updatedAt: null,
    });
  });

  it("getActiveModelKey returns the default key directly when empty", async () => {
    expect(await repo.getActiveModelKey()).toBe("grok-4.6");
  });
});

describe("setActiveModelKey / resolveActiveModel roundtrip", () => {
  it("records a stored selection with source db + audit fields", async () => {
    const before = Date.now();
    await repo.setActiveModelKey("grok-4.3", "admin@example.com");

    const setting = await repo.resolveActiveModel();
    expect(setting.key).toBe("grok-4.3");
    expect(setting.source).toBe("db");
    expect(setting.updatedBy).toBe("admin@example.com");
    expect(setting.updatedAt).not.toBeNull();
    expect(setting.updatedAt as number).toBeGreaterThanOrEqual(before);
    expect(setting.updatedAt as number).toBeLessThanOrEqual(Date.now());

    expect(await repo.getActiveModelKey()).toBe("grok-4.3");
  });

  it("a second set overwrites (upsert) and bumps the audit fields", async () => {
    await repo.setActiveModelKey("grok-4.3", "first@example.com");
    const first = await repo.resolveActiveModel();

    // Ensure the timestamp can visibly advance even on fast machines.
    await new Promise((r) => setTimeout(r, 5));

    await repo.setActiveModelKey("gpt-5.5", "second@example.com");
    const second = await repo.resolveActiveModel();

    expect(second.key).toBe("gpt-5.5");
    expect(second.source).toBe("db");
    expect(second.updatedBy).toBe("second@example.com");
    expect(second.updatedAt as number).toBeGreaterThanOrEqual(
      first.updatedAt as number,
    );

    // Still exactly one row (upsert, not a duplicate insert).
    const rows = await fix.db.execute(sql`SELECT * FROM app_setting`);
    expect(rows.rows).toHaveLength(1);
  });
});

describe("fail-soft degradation", () => {
  it("falls back to the default when the stored value is invalid", async () => {
    await fix.db.execute(
      sql`INSERT INTO app_setting (key, value, updated_by, updated_at)
          VALUES ('active_model', 'gpt-9000', 'admin@example.com', ${Date.now()})`,
    );

    const setting = await repo.resolveActiveModel();
    expect(setting).toEqual({
      key: "grok-4.6",
      source: "default",
      updatedBy: null,
      updatedAt: null,
    });
  });

  it("falls back to the default when the table itself is missing (DB error)", async () => {
    await fix.db.execute(sql`DROP TABLE app_setting`);
    try {
      await expect(repo.resolveActiveModel()).resolves.toEqual({
        key: "grok-4.6",
        source: "default",
        updatedBy: null,
        updatedAt: null,
      });
    } finally {
      // Restore the table for subsequent tests in this file.
      await fix.db.execute(sql`
        CREATE TABLE app_setting (
          "key" text PRIMARY KEY NOT NULL,
          "value" text NOT NULL,
          "updated_by" text,
          "updated_at" bigint NOT NULL
        )
      `);
    }
  });
});
