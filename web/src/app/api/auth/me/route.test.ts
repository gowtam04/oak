/**
 * Route-adapter tests for GET /api/auth/me (account-creation design.md
 * § API Design; AUTH-US-1, AC-1.2, BR-A11; Champions-first P1 TurnScope).
 *
 * The route is a THIN adapter; these tests pin both states: a resolved account →
 * `{ signedIn: true, email, lastUsedScope: "champions", lastUsedScopes }` and a
 * guest (`getCurrentAccount` returns null) → `{ signedIn: false }` — always 200,
 * never an error path (guests are first-class, BR-A11). `current-user` and
 * `scope-mru-repo.list` are mocked so neither cookie nor DB is needed.
 *
 * Champions-first (CF-DATA-BR-21): `lastUsedScope` is always `"champions"` even
 * if the account row stored gen-7. `lastUsedScopes` is empty or `["champions"]`.
 * Empty UIs must never seed another game.
 *
 * `answerDensity` is additive (COMPACT-US-2 / ADR-9): `"full" | "compact"`.
 * Omit or `"full"` when the account column is NULL (COMPACT-BR-2). Guests
 * omit it (COMPACT-BR-4).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

const mru = vi.hoisted(() => ({
  list: vi.fn<(accountId: string) => Promise<string[]>>(),
}));
vi.mock("@/data/repos/scope-mru-repo", () => ({
  list: (...args: [string]) => mru.list(...args),
}));

import { GET } from "./route";

beforeEach(() => {
  cu.getCurrentAccount.mockReset();
  mru.list.mockReset();
  mru.list.mockResolvedValue([]);
});

function expectChampionsScope(body: {
  lastUsedScope?: unknown;
  lastUsedScopes?: unknown;
}): void {
  expect(body.lastUsedScope).toBe("champions");
  expect(Array.isArray(body.lastUsedScopes)).toBe(true);
  const scopes = body.lastUsedScopes as string[];
  expect(scopes.every((s) => s === "champions")).toBe(true);
  expect(scopes.length).toBeLessThanOrEqual(1);
}

describe("GET /api/auth/me", () => {
  it("reports a signed-in account → 200 Champions scope (CF-DATA-BR-21)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: null,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      signedIn: boolean;
      email: string;
      lastUsedScope?: string;
      lastUsedScopes?: string[];
    };
    expect(body.signedIn).toBe(true);
    expect(body.email).toBe("ash@pallet.town");
    expectChampionsScope(body);
  });

  it("returns lastUsedScope: champions even if the account row stored gen-7 (CF-DATA-BR-21)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: "gen-7",
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      signedIn: boolean;
      email: string;
      lastUsedScope?: string;
      lastUsedScopes?: string[];
    };
    expect(body.signedIn).toBe(true);
    expect(body.email).toBe("ash@pallet.town");
    expectChampionsScope(body);
    expect(body.lastUsedScope).not.toBe("gen-7");
  });

  it("lastUsedScopes is empty or [champions] — never other games (CF-DATA-BR-21)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: "gen-7",
    });
    mru.list.mockResolvedValue(["gen-7", "scarlet-violet", "national-dex"]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lastUsedScope?: string;
      lastUsedScopes?: string[];
    };
    expectChampionsScope(body);
    expect(body.lastUsedScopes).not.toContain("gen-7");
    expect(body.lastUsedScopes).not.toContain("scarlet-violet");
    expect(body.lastUsedScopes).not.toContain("national-dex");
  });

  it("does not seed another game when MRU is already champions (CF-DATA-BR-21)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: "champions",
    });
    mru.list.mockResolvedValue(["champions"]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { lastUsedScopes?: string[] };
    expectChampionsScope(body);
    expect(body.lastUsedScopes).not.toContain("gen-1");
  });

  it("reports a guest → 200 { signedIn: false } (never errors — BR-A11, CF-AUTH-AC-1.1)", async () => {
    cu.getCurrentAccount.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: false });
    expect(mru.list).not.toHaveBeenCalled();
  });

  it("fail-softs lastUsedScopes to [] or [champions] when list throws (never 500s /me)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: "gen-7",
    });
    mru.list.mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      signedIn: boolean;
      email: string;
      lastUsedScope?: string;
      lastUsedScopes?: string[];
    };
    expect(body.signedIn).toBe(true);
    expect(body.email).toBe("ash@pallet.town");
    expectChampionsScope(body);
  });

  it("includes answerDensity when the account has compact (COMPACT-US-2)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: null,
      answerDensity: "compact",
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      signedIn: boolean;
      email: string;
      lastUsedScope?: string;
      lastUsedScopes?: string[];
      answerDensity?: string;
    };
    expect(body.signedIn).toBe(true);
    expect(body.email).toBe("ash@pallet.town");
    expectChampionsScope(body);
    expect(body.answerDensity).toBe("compact");
  });

  it("includes answerDensity: 'full' when the account stored full (COMPACT-US-2)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: null,
      answerDensity: "full",
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      signedIn: boolean;
      email: string;
      lastUsedScope?: string;
      lastUsedScopes?: string[];
      answerDensity?: string;
    };
    expect(body.signedIn).toBe(true);
    expect(body.email).toBe("ash@pallet.town");
    expectChampionsScope(body);
    expect(body.answerDensity).toBe("full");
  });

  it("omits answerDensity or reports 'full' when the column is NULL (COMPACT-BR-2)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: null,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lastUsedScope?: string;
      lastUsedScopes?: string[];
      answerDensity?: string;
    };
    expectChampionsScope(body);
    if (body.answerDensity !== undefined) {
      expect(body.answerDensity).toBe("full");
    }
  });

  it("does not put answerDensity on a guest body (COMPACT-BR-4)", async () => {
    cu.getCurrentAccount.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: false });
  });

  it("drops unknown formats and other games from lastUsedScopes (CF-DATA-BR-21)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: "gen-7",
    });
    mru.list.mockResolvedValue(["gen-7", "gen9ou", "national-dex", "champions"]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lastUsedScope?: string;
      lastUsedScopes?: string[];
    };
    expectChampionsScope(body);
    expect(body.lastUsedScopes).not.toContain("gen-7");
    expect(body.lastUsedScopes).not.toContain("gen9ou");
    expect(body.lastUsedScopes).not.toContain("national-dex");
  });
});
