/**
 * Route-adapter tests for GET /api/auth/me (account-creation design.md
 * § API Design; AUTH-US-1, AC-1.2, BR-A11; chat-qol api-design.md + ADR-8).
 *
 * The route is a THIN adapter; these tests pin both states: a resolved account →
 * `{ signedIn: true, email, lastUsedScope?, lastUsedScopes }`, and a guest
 * (`getCurrentAccount` returns null) → `{ signedIn: false }` — always 200,
 * never an error path (guests are first-class, BR-A11). `current-user` and
 * `scope-mru-repo.list` are mocked so neither cookie nor DB is needed.
 *
 * `lastUsedScopes` is additive (SCOPE-US-2): signed-in bodies include the MRU
 * list (may be `[]`); guests omit it. Singular `lastUsedScope` stays as today.
 *
 * `answerDensity` is additive (COMPACT-US-2 / ADR-9): `"full" | "compact"`.
 * Omit or `"full"` when the account column is NULL (COMPACT-BR-2). Guests
 * omit it (COMPACT-BR-4). Existing exact `toEqual` fixtures stay valid when
 * the field is omitted for unset accounts.
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

describe("GET /api/auth/me", () => {
  it("reports a signed-in account → 200 { signedIn: true, email, lastUsedScopes: [] }", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: null,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      signedIn: true,
      email: "ash@pallet.town",
      lastUsedScopes: [],
    });
    expect(mru.list).toHaveBeenCalledWith("acct-1");
  });

  it("includes lastUsedScope when the account has a remembered preference", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: "gen-7",
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      signedIn: true,
      email: "ash@pallet.town",
      lastUsedScope: "gen-7",
      lastUsedScopes: [],
    });
  });

  it("includes lastUsedScopes in MRU order (SCOPE-US-2, SCOPE-AC-2.1)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: "gen-7",
    });
    mru.list.mockResolvedValue(["gen-7", "scarlet-violet", "national-dex"]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      signedIn: true,
      email: "ash@pallet.town",
      lastUsedScope: "gen-7",
      lastUsedScopes: ["gen-7", "scarlet-violet", "national-dex"],
    });
    expect(mru.list).toHaveBeenCalledWith("acct-1");
  });

  it("does not put a never-picked scope in lastUsedScopes (SCOPE-AC-2.3)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: "champions",
    });
    // Only Champions has been picked/resolved — gen-1 is not in the MRU group.
    mru.list.mockResolvedValue(["champions"]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { lastUsedScopes: string[] };
    expect(body.lastUsedScopes).toEqual(["champions"]);
    expect(body.lastUsedScopes).not.toContain("gen-1");
  });

  it("reports a guest → 200 { signedIn: false } (never errors — BR-A11)", async () => {
    cu.getCurrentAccount.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: false });
    expect(mru.list).not.toHaveBeenCalled();
  });

  it("fail-softs lastUsedScopes to [] when list throws (never 500s /me)", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: "gen-7",
    });
    mru.list.mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      signedIn: true,
      email: "ash@pallet.town",
      lastUsedScope: "gen-7",
      lastUsedScopes: [],
    });
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
    expect(await res.json()).toEqual({
      signedIn: true,
      email: "ash@pallet.town",
      lastUsedScopes: [],
      answerDensity: "compact",
    });
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
    expect(await res.json()).toEqual({
      signedIn: true,
      email: "ash@pallet.town",
      lastUsedScopes: [],
      answerDensity: "full",
    });
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
    const body = (await res.json()) as { answerDensity?: string };
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

  it("drops unknown formats from lastUsedScopes", async () => {
    cu.getCurrentAccount.mockResolvedValue({
      id: "acct-1",
      email: "ash@pallet.town",
      createdAt: 1_700_000_000_000,
      lastUsedScope: "gen-7",
    });
    mru.list.mockResolvedValue(["gen-7", "gen9ou", "national-dex"]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      signedIn: true,
      email: "ash@pallet.town",
      lastUsedScope: "gen-7",
      lastUsedScopes: ["gen-7", "national-dex"],
    });
  });
});
