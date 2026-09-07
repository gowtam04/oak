/**
 * Oracle tests for src/data/repos/spend-repo.ts — denylist CRUD, daily-cap
 * get/set, and the atomic UTC-day increment (`tryAdmit`).
 *
 * Harness (mirrors settings-repo.oracle.test.ts): the repo reads the `@/data/db`
 * SINGLETON via a dynamic import, so we migrate an isolated Postgres schema
 * (seed "none"), installAsSingleton(fix) BEFORE the first dynamic import of the
 * repo, and neutralize `server-only` (it throws under the vitest node env).
 *
 * Coverage (spend-controls Phase 1):
 *   - email normalize on add; mixed-case isDenylisted; getDenylist shape (SC-BR-2)
 *   - add/remove idempotent
 *   - empty/invalid app_setting *row* → caps 25/10 per key (SC-AC-4.1); DROP TABLE
 *     (DB throw) rejects, never defaults (SC-BR-8)
 *   - setCaps roundtrip; 0 / negative / non-integer throw, previous remains
 *     (SC-AC-4.3, SC-BR-13); setCaps does not truncate spend_daily_usage
 *   - tryAdmit from 0 up to cap, then refuse without increment (SC-BR-4, SC-BR-11)
 *   - independent subject keys (SC-BR-5) and independent UTC days (SC-BR-10)
 *   - concurrent tryAdmit at cap−1 admits exactly one
 *
 * Not covered here: SC-AC-1.3 (409 admin_exempt) — that is the admin HTTP route
 * in Phase 3. `addDenylistEmail` has no isAdmin parameter.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// spend-repo.ts / db.ts `import "server-only"` (throws under node).
// Neutralize it; the real Postgres handle is supplied via installAsSingleton.
vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

type Repo = typeof import("./spend-repo");

let fix: PgFixture;
let repo: Repo;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  // Install BEFORE importing the repo so its dynamic `await import("@/data/db")`
  // resolves to this schema's handle.
  await installAsSingleton(fix);
  repo = await import("./spend-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE account_denylist, account_cap_exempt, spend_daily_usage, app_setting`,
  );
});

describe("denylist (SC-BR-2)", () => {
  it("normalizes email on add; isDenylisted is case-insensitive; getDenylist returns lowercase + addedAt + addedBy", async () => {
    const before = Date.now();
    await repo.addDenylistEmail("  Ash@Example.COM  ", "admin@oak.ai");
    const after = Date.now();

    expect(await repo.isDenylisted("ASH@EXAMPLE.COM")).toBe(true);
    expect(await repo.isDenylisted("ash@example.com")).toBe(true);
    expect(await repo.isDenylisted("misty@cerulean.gym")).toBe(false);

    const list = await repo.getDenylist();
    expect(list).toHaveLength(1);
    expect(list[0]!.email).toBe("ash@example.com");
    expect(list[0]!.addedBy).toBe("admin@oak.ai");
    expect(list[0]!.addedAt).toBeGreaterThanOrEqual(before);
    expect(list[0]!.addedAt).toBeLessThanOrEqual(after);
  });

  it("add is idempotent; remove is idempotent; after remove, isDenylisted is false", async () => {
    await repo.addDenylistEmail("Ash@Example.COM", "admin@oak.ai");
    await repo.addDenylistEmail("ash@example.com", "admin@oak.ai");
    expect(await repo.getDenylist()).toHaveLength(1);

    await repo.removeDenylistEmail("ASH@EXAMPLE.COM");
    expect(await repo.isDenylisted("ash@example.com")).toBe(false);
    expect(await repo.getDenylist()).toEqual([]);

    await expect(
      repo.removeDenylistEmail("ash@example.com"),
    ).resolves.toBeUndefined();
    expect(await repo.isDenylisted("ash@example.com")).toBe(false);
  });
});

describe("caps (SC-AC-4.1, SC-AC-4.3, SC-BR-13)", () => {
  it("getCaps with empty app_setting returns launch defaults { signedCap: 25, guestCap: 10 }", async () => {
    expect(await repo.getCaps()).toEqual({ signedCap: 25, guestCap: 10 });
  });

  it("getCaps returns launch defaults when stored cap rows are invalid (not fail-closed)", async () => {
    await fix.db.execute(
      sql`INSERT INTO app_setting (key, value, updated_by, updated_at)
          VALUES
            ('daily_cap_signed', 'nope', 'admin@example.com', ${Date.now()}),
            ('daily_cap_guest', '0', 'admin@example.com', ${Date.now()})`,
    );
    expect(await repo.getCaps()).toEqual({ signedCap: 25, guestCap: 10 });
  });

  it("getCaps defaults only the invalid/missing key (signed valid, guest invalid)", async () => {
    await fix.db.execute(
      sql`INSERT INTO app_setting (key, value, updated_by, updated_at)
          VALUES
            ('daily_cap_signed', '40', 'admin@example.com', ${Date.now()}),
            ('daily_cap_guest', 'nope', 'admin@example.com', ${Date.now()})`,
    );
    expect(await repo.getCaps()).toEqual({ signedCap: 40, guestCap: 10 });
  });

  it("getCaps defaults only the invalid/missing key (signed invalid, guest valid)", async () => {
    await fix.db.execute(
      sql`INSERT INTO app_setting (key, value, updated_by, updated_at)
          VALUES
            ('daily_cap_signed', 'nope', 'admin@example.com', ${Date.now()}),
            ('daily_cap_guest', '8', 'admin@example.com', ${Date.now()})`,
    );
    expect(await repo.getCaps()).toEqual({ signedCap: 25, guestCap: 8 });
  });

  it("setCaps then getCaps roundtrips the stored integers", async () => {
    await repo.setCaps({ signedCap: 40, guestCap: 15 }, "admin@example.com");
    expect(await repo.getCaps()).toEqual({ signedCap: 40, guestCap: 15 });
  });

  it("setCaps rejects 0 and leaves the previous stored caps in force", async () => {
    await repo.setCaps({ signedCap: 40, guestCap: 15 }, "admin@example.com");
    await expect(
      repo.setCaps({ signedCap: 0, guestCap: 15 }, "admin@example.com"),
    ).rejects.toThrow();
    expect(await repo.getCaps()).toEqual({ signedCap: 40, guestCap: 15 });
  });

  it("setCaps rejects a negative cap and leaves the previous stored caps in force", async () => {
    await repo.setCaps({ signedCap: 40, guestCap: 15 }, "admin@example.com");
    await expect(
      repo.setCaps({ signedCap: 40, guestCap: -1 }, "admin@example.com"),
    ).rejects.toThrow();
    expect(await repo.getCaps()).toEqual({ signedCap: 40, guestCap: 15 });
  });

  it("setCaps rejects a non-integer cap and leaves the previous stored caps in force", async () => {
    await repo.setCaps({ signedCap: 40, guestCap: 15 }, "admin@example.com");
    await expect(
      repo.setCaps({ signedCap: 1.5, guestCap: 15 }, "admin@example.com"),
    ).rejects.toThrow();
    expect(await repo.getCaps()).toEqual({ signedCap: 40, guestCap: 15 });
  });

  it("setCaps does not truncate spend_daily_usage; next admit uses the new cap (SC-BR-13)", async () => {
    expect(await repo.tryAdmit("acct:hist", "1970-01-01", 10)).toEqual({
      admitted: true,
      count: 1,
    });
    expect(await repo.tryAdmit("acct:hist", "1970-01-01", 10)).toEqual({
      admitted: true,
      count: 2,
    });
    expect(await repo.tryAdmit("acct:hist", "1970-01-01", 10)).toEqual({
      admitted: true,
      count: 3,
    });

    await repo.setCaps({ signedCap: 5, guestCap: 10 }, "admin@example.com");

    const rows = await fix.db.execute(
      sql`SELECT admitted_count FROM spend_daily_usage
          WHERE subject_key = 'acct:hist' AND day_utc = '1970-01-01'`,
    );
    expect(rows.rows).toHaveLength(1);
    expect(Number((rows.rows[0] as { admitted_count: number }).admitted_count)).toBe(
      3,
    );

    expect(await repo.tryAdmit("acct:hist", "1970-01-01", 5)).toEqual({
      admitted: true,
      count: 4,
    });
  });
});

describe("cap-exempt (SC-US-9, SC-BR-16)", () => {
  it("normalizes email on add; isCapExempt is case-insensitive; getCapExempt returns lowercase + addedAt + addedBy", async () => {
    const before = Date.now();
    await repo.addCapExemptEmail("  Ash@Example.COM  ", "admin@oak.ai");
    const after = Date.now();

    expect(await repo.isCapExempt("ASH@EXAMPLE.COM")).toBe(true);
    expect(await repo.isCapExempt("ash@example.com")).toBe(true);
    expect(await repo.isCapExempt("misty@cerulean.gym")).toBe(false);

    const list = await repo.getCapExempt();
    expect(list).toHaveLength(1);
    expect(list[0]!.email).toBe("ash@example.com");
    expect(list[0]!.addedBy).toBe("admin@oak.ai");
    expect(list[0]!.addedAt).toBeGreaterThanOrEqual(before);
    expect(list[0]!.addedAt).toBeLessThanOrEqual(after);
  });

  it("add is idempotent; remove is idempotent; after remove, isCapExempt is false", async () => {
    await repo.addCapExemptEmail("Ash@Example.COM", "admin@oak.ai");
    await repo.addCapExemptEmail("ash@example.com", "admin@oak.ai");
    expect(await repo.getCapExempt()).toHaveLength(1);

    await repo.removeCapExemptEmail("ASH@EXAMPLE.COM");
    expect(await repo.isCapExempt("ash@example.com")).toBe(false);
    expect(await repo.getCapExempt()).toEqual([]);

    await expect(
      repo.removeCapExemptEmail("ash@example.com"),
    ).resolves.toBeUndefined();
    expect(await repo.isCapExempt("ash@example.com")).toBe(false);
  });

  it("getCapExempt is empty at launch", async () => {
    expect(await repo.getCapExempt()).toEqual([]);
  });
});

describe("recordAdmit (SC-BR-16)", () => {
  it("increments with no cap: 26th call still admitted and count is 26", async () => {
    for (let i = 1; i <= 25; i++) {
      expect(await repo.recordAdmit("acct:exempt", "1970-01-01")).toEqual({
        count: i,
      });
    }
    expect(await repo.recordAdmit("acct:exempt", "1970-01-01")).toEqual({
      count: 26,
    });
  });

  it("shares the spend_daily_usage row with tryAdmit so a later cap still sees today's count", async () => {
    await repo.recordAdmit("acct:exempt", "1970-01-01");
    await repo.recordAdmit("acct:exempt", "1970-01-01");
    expect(await repo.tryAdmit("acct:exempt", "1970-01-01", 2)).toEqual({
      admitted: false,
      count: 2,
    });
  });
});

describe("tryAdmit (SC-BR-4, SC-BR-5, SC-BR-10, SC-BR-11)", () => {
  it("from 0: first call admitted with count 1; at cap the next call is refused and count stays", async () => {
    const first = await repo.tryAdmit("acct:a1", "1970-01-01", 2);
    expect(first).toEqual({ admitted: true, count: 1 });

    const second = await repo.tryAdmit("acct:a1", "1970-01-01", 2);
    expect(second).toEqual({ admitted: true, count: 2 });

    const third = await repo.tryAdmit("acct:a1", "1970-01-01", 2);
    expect(third).toEqual({ admitted: false, count: 2 });
  });

  it("independent keys: acct:a1 at cap does not block ip:1.1.1.1 (SC-BR-5)", async () => {
    expect(await repo.tryAdmit("acct:a1", "1970-01-01", 1)).toEqual({
      admitted: true,
      count: 1,
    });
    expect(await repo.tryAdmit("acct:a1", "1970-01-01", 1)).toEqual({
      admitted: false,
      count: 1,
    });

    expect(await repo.tryAdmit("ip:1.1.1.1", "1970-01-01", 1)).toEqual({
      admitted: true,
      count: 1,
    });
  });

  it("UTC days are independent counters (SC-BR-10)", async () => {
    expect(await repo.tryAdmit("acct:a1", "1970-01-01", 1)).toEqual({
      admitted: true,
      count: 1,
    });
    expect(await repo.tryAdmit("acct:a1", "1970-01-02", 1)).toEqual({
      admitted: true,
      count: 1,
    });
    expect(await repo.tryAdmit("acct:a1", "1970-01-01", 1)).toEqual({
      admitted: false,
      count: 1,
    });
  });
});

describe("tryAdmit concurrent (SC-BR-4)", () => {
  it("two parallel tryAdmit from count 24 with cap 25 admit exactly one", async () => {
    for (let i = 0; i < 24; i++) {
      const step = await repo.tryAdmit("acct:race", "1970-01-01", 25);
      expect(step.admitted).toBe(true);
      expect(step.count).toBe(i + 1);
    }

    const [a, b] = await Promise.all([
      repo.tryAdmit("acct:race", "1970-01-01", 25),
      repo.tryAdmit("acct:race", "1970-01-01", 25),
    ]);

    expect([a, b].filter((r) => r.admitted)).toHaveLength(1);
    expect(a.count).toBe(25);
    expect(b.count).toBe(25);
  });
});

describe("fail-closed on DB throw (SC-BR-8)", () => {
  // Last in the file: DROP + restore. Missing/invalid *rows* default (SC-AC-4.1);
  // a thrown DB error (missing table) must reject, not return 25/10.
  it("getCaps rejects when app_setting is dropped, not the 25/10 defaults", async () => {
    await fix.db.execute(sql`DROP TABLE app_setting`);
    try {
      await expect(repo.getCaps()).rejects.toThrow();
    } finally {
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

  it("isDenylisted rejects when account_denylist is dropped", async () => {
    await fix.db.execute(sql`DROP TABLE account_denylist`);
    try {
      await expect(repo.isDenylisted("ash@example.com")).rejects.toThrow();
    } finally {
      await fix.db.execute(sql`
        CREATE TABLE account_denylist (
          email text PRIMARY KEY NOT NULL,
          added_at bigint NOT NULL,
          added_by text
        )
      `);
    }
  });

  it("isCapExempt rejects when account_cap_exempt is dropped", async () => {
    await fix.db.execute(sql`DROP TABLE account_cap_exempt`);
    try {
      await expect(repo.isCapExempt("ash@example.com")).rejects.toThrow();
    } finally {
      await fix.db.execute(sql`
        CREATE TABLE account_cap_exempt (
          email text PRIMARY KEY NOT NULL,
          added_at bigint NOT NULL,
          added_by text
        )
      `);
    }
  });

  it("tryAdmit rejects when spend_daily_usage is dropped", async () => {
    await fix.db.execute(sql`DROP TABLE spend_daily_usage`);
    try {
      await expect(
        repo.tryAdmit("acct:a1", "1970-01-01", 25),
      ).rejects.toThrow();
    } finally {
      await fix.db.execute(sql`
        CREATE TABLE spend_daily_usage (
          subject_key text NOT NULL,
          day_utc text NOT NULL,
          admitted_count integer NOT NULL,
          PRIMARY KEY (subject_key, day_utc)
        )
      `);
    }
  });
});
