/**
 * HTTP tests for `PATCH /api/account/preferences` (COMPACT-US-2, ADR-9).
 *
 *   { answer_density: "full" | "compact" } → 200 { answerDensity }
 *
 * Signed-in only. Guest → 401 (AUTH-BR-1, COMPACT-BR-4). Account-scoped
 * write via `accounts-repo.updateAnswerDensity` (AUTH-BR-2). Production
 * route is not required yet — failed resolve is the intended red (P5 TDD).
 *
 * Real migrated Postgres (Testcontainers); only `getCurrentAccount` is mocked.
 *
 * Requirement refs: COMPACT-US-2, COMPACT-AC-2.1, COMPACT-BR-2, COMPACT-BR-4,
 * AUTH-BR-1, AUTH-BR-2. ADR-9.
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../../test/support/pg";

const EMAIL_A = "ash@pallet.town";
const EMAIL_B = "misty@cerulean.gym";

type PrefsRoute = typeof import("./route");

let fix: PgFixture;
let route: PrefsRoute;
let accounts: typeof import("@/data/repos/accounts-repo");

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  route = await import("./route");
  accounts = await import("@/data/repos/accounts-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE account, auth_session, otp_code RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
});

function signedIn(id: string, email: string): void {
  cu.getCurrentAccount.mockResolvedValue({
    id,
    email,
    createdAt: 1_700_000_000_000,
    lastUsedScope: null,
  });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

function patch(body: unknown): Promise<Response> {
  return route.PATCH(
    new Request("http://t/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function seedAccount(email: string): Promise<string> {
  const id = randomUUID();
  await accounts.createAccount(email, id, 1_700_000_000_000);
  return id;
}

describe("PATCH /api/account/preferences (COMPACT-US-2)", () => {
  it("guest → 401 and writes nothing (AUTH-BR-1, COMPACT-BR-4)", async () => {
    const id = await seedAccount(EMAIL_A);
    guest();

    const res = await patch({ answer_density: "compact" });
    expect(res.status).toBe(401);
    expect(
      ((await accounts.findAccountByEmail(EMAIL_A)) as { answerDensity?: string | null })
        .answerDensity ?? null,
    ).toBeNull();
    expect(id).toEqual(expect.any(String));
  });

  it("writes compact and returns 200 { answerDensity: 'compact' } (COMPACT-AC-2.1)", async () => {
    const id = await seedAccount(EMAIL_A);
    signedIn(id, EMAIL_A);

    const res = await patch({ answer_density: "compact" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answerDensity: "compact" });
    expect(
      ((await accounts.findAccountByEmail(EMAIL_A)) as { answerDensity?: string })
        .answerDensity,
    ).toBe("compact");
  });

  it("writes full and returns 200 { answerDensity: 'full' } (COMPACT-BR-2)", async () => {
    const id = await seedAccount(EMAIL_A);
    signedIn(id, EMAIL_A);
    await accounts.updateAnswerDensity(id, "compact");

    const res = await patch({ answer_density: "full" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answerDensity: "full" });
    expect(
      ((await accounts.findAccountByEmail(EMAIL_A)) as { answerDensity?: string })
        .answerDensity,
    ).toBe("full");
  });

  it("is account-scoped — another account's density is unchanged (AUTH-BR-2)", async () => {
    const a = await seedAccount(EMAIL_A);
    await seedAccount(EMAIL_B);
    signedIn(a, EMAIL_A);

    expect((await patch({ answer_density: "compact" })).status).toBe(200);

    expect(
      ((await accounts.findAccountByEmail(EMAIL_A)) as { answerDensity?: string })
        .answerDensity,
    ).toBe("compact");
    expect(
      ((await accounts.findAccountByEmail(EMAIL_B)) as { answerDensity?: string | null })
        .answerDensity ?? null,
    ).toBeNull();
  });

  it("400s a missing or invalid answer_density", async () => {
    const id = await seedAccount(EMAIL_A);
    signedIn(id, EMAIL_A);

    expect((await patch({})).status).toBe(400);
    expect((await patch({ answer_density: "dense" })).status).toBe(400);
    expect((await patch({ answer_density: null })).status).toBe(400);
    expect(
      ((await accounts.findAccountByEmail(EMAIL_A)) as { answerDensity?: string | null })
        .answerDensity ?? null,
    ).toBeNull();
  });
});
