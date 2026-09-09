/**
 * HTTP tests for conversation artifact pins (PIN-US-1–3, AUTH-BR-1–3).
 *
 *   GET    /api/conversations/:id/artifact-pins          → 200 { pinnedArtifacts }
 *   POST   /api/conversations/:id/artifact-pins          → 201 { pin, pinnedArtifacts }
 *   GET    /api/conversations/:id/artifact-pins/:pinId   → 200 { pin }
 *   DELETE /api/conversations/:id/artifact-pins/:pinId   → 200 { pinnedArtifacts }
 *
 * Signed-in conversation owner only. Guest → 401. Foreign conversation → 404
 * (AUTH-BR-2 / AUTH-BR-3 — no existence leak). 6th pin → 409
 * `{ error: "pin_cap", max: 5 }` (PIN-AC-3.1). Snapshots are stored as given
 * (PIN-BR-1). Production routes are not required yet — failed resolve is the
 * intended red (P5 TDD).
 *
 * Real migrated Postgres (Testcontainers); only `getCurrentAccount` is mocked.
 *
 * Requirement refs: PIN-US-1, PIN-US-2, PIN-US-3, PIN-AC-1.1, PIN-AC-1.4,
 * PIN-AC-2.1, PIN-AC-3.1, PIN-AC-3.2, PIN-BR-1–4, AUTH-BR-1, AUTH-BR-2,
 * AUTH-BR-3. ADR-6.
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OakAnswer } from "@/agent/schemas";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../../../test/support/pg";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";
const SV = "scarlet-violet";

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "ok",
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

const CALC_SNAP = {
  v: 1 as const,
  kind: "calc" as const,
  scenario: {
    format: SV,
    attacker: "garchomp",
    defender: "toxapex",
    move: "earthquake",
  },
  result: { min_damage: 40, max_damage: 48 },
};

const TEAM_SNAP = {
  v: 1 as const,
  kind: "team_sheet" as const,
  format: SV,
  team: { name: "Rain Offense", members: [] },
};

const CMP_SNAP = {
  v: 1 as const,
  kind: "comparison" as const,
  left: { name: "Garchomp", format: SV },
  right: { name: "Toxapex", format: SV },
};

type CollectionRoute = typeof import("./route");
type PinRoute = typeof import("./[pinId]/route");

let fix: PgFixture;
let collection: CollectionRoute;
let byId: PinRoute;
let convRepo: typeof import("@/data/repos/conversation-repo");
let pinRepo: typeof import("@/data/repos/artifact-pin-repo");

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  collection = await import("./route");
  byId = await import("./[pinId]/route");
  convRepo = await import("@/data/repos/conversation-repo");
  pinRepo = await import("@/data/repos/artifact-pin-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE conversation_artifact_pin, conversation, conversation_message, conversation_folder RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
});

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({
    id,
    email: `${id}@x.test`,
    createdAt: 0,
    lastUsedScope: null,
  });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

const convCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const pinCtx = (id: string, pinId: string) => ({
  params: Promise.resolve({ id, pinId }),
});

function errId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  if (typeof rec.error === "string") return rec.error;
  if (typeof rec.code === "string") return rec.code;
  return undefined;
}

function list(id: string): Promise<Response> {
  return collection.GET(
    new Request(`http://t/api/conversations/${id}/artifact-pins`),
    convCtx(id),
  );
}

function post(id: string, body: unknown): Promise<Response> {
  return collection.POST(
    new Request(`http://t/api/conversations/${id}/artifact-pins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    convCtx(id),
  );
}

function snapshot(id: string, pinId: string): Promise<Response> {
  return byId.GET(
    new Request(`http://t/api/conversations/${id}/artifact-pins/${pinId}`),
    pinCtx(id, pinId),
  );
}

function del(id: string, pinId: string): Promise<Response> {
  return byId.DELETE(
    new Request(`http://t/api/conversations/${id}/artifact-pins/${pinId}`, {
      method: "DELETE",
    }),
    pinCtx(id, pinId),
  );
}

async function seedConv(accountId: string, id: string): Promise<void> {
  await convRepo.appendTurnPair({
    accountId,
    conversationId: id,
    format: SV,
    userTurnId: convRepo.newTurnId(),
    userMessage: "q",
    assistantTurnId: convRepo.newTurnId(),
    answer: ANSWER,
    now: Date.now(),
  });
}

function pinBody(
  over: {
    kind?: "team_sheet" | "comparison" | "calc";
    title?: string;
    snapshot?: unknown;
  } = {},
) {
  const kind = over.kind ?? "calc";
  const snapshotJson =
    over.snapshot ??
    (kind === "team_sheet"
      ? TEAM_SNAP
      : kind === "comparison"
        ? CMP_SNAP
        : CALC_SNAP);
  return {
    kind,
    title: over.title ?? "EQ vs Toxapex",
    snapshot: snapshotJson,
  };
}

type Summary = {
  id: string;
  kind: string;
  title: string;
  created_at: number;
};

function summaries(body: unknown): Summary[] {
  if (!body || typeof body !== "object") return [];
  const list = (body as { pinnedArtifacts?: unknown }).pinnedArtifacts;
  return Array.isArray(list) ? (list as Summary[]) : [];
}

// ---------------------------------------------------------------------------
// Auth isolation (AUTH-BR-1 / AUTH-BR-2 / AUTH-BR-3)
// ---------------------------------------------------------------------------

describe("artifact-pins — guest 401 / foreign 404 (AUTH-BR-1–3)", () => {
  it("guest → 401 on list, create, snapshot, and delete (AUTH-BR-1)", async () => {
    await seedConv(ACCT_A, "c");
    guest();

    expect((await list("c")).status).toBe(401);
    expect((await post("c", pinBody())).status).toBe(401);

    signedIn(ACCT_A);
    const created = await post("c", pinBody());
    expect(created.status).toBe(201);
    const pinId = ((await created.json()) as { pin: { id: string } }).pin.id;

    guest();
    expect((await snapshot("c", pinId)).status).toBe(401);
    expect((await del("c", pinId)).status).toBe(401);
    expect(await pinRepo.get(ACCT_A, "c", pinId)).not.toBeNull();
  });

  it("another account's conversation → 404 on every verb (AUTH-BR-2, AUTH-BR-3)", async () => {
    await seedConv(ACCT_A, "c");
    signedIn(ACCT_A);
    const created = await post("c", pinBody({ title: "secret" }));
    expect(created.status).toBe(201);
    const pinId = ((await created.json()) as { pin: { id: string } }).pin.id;

    signedIn(ACCT_B);
    expect((await list("c")).status).toBe(404);
    expect((await post("c", pinBody())).status).toBe(404);
    expect((await snapshot("c", pinId)).status).toBe(404);
    expect((await del("c", pinId)).status).toBe(404);
    expect(await pinRepo.get(ACCT_A, "c", pinId)).not.toBeNull();
  });

  it("missing conversation → 404 for the owner", async () => {
    signedIn(ACCT_A);
    expect((await list(randomUUID())).status).toBe(404);
    expect((await post(randomUUID(), pinBody())).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST 201 + GET list / snapshot
// ---------------------------------------------------------------------------

describe("POST /api/conversations/:id/artifact-pins — 201 (PIN-US-1)", () => {
  it("creates a snapshot pin and returns { pin, pinnedArtifacts }", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c");

    const res = await post("c", pinBody({ kind: "calc", title: "EQ vs Toxapex" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      pin: {
        id: string;
        kind: string;
        title: string;
        snapshot: unknown;
        created_at?: number;
      };
      pinnedArtifacts: Summary[];
    };
    expect(body.pin.kind).toBe("calc");
    expect(body.pin.title).toBe("EQ vs Toxapex");
    expect(body.pin.snapshot).toEqual(CALC_SNAP);
    expect(body.pin.id).toEqual(expect.any(String));
    expect(body.pinnedArtifacts).toHaveLength(1);
    expect(body.pinnedArtifacts[0]).toEqual({
      id: body.pin.id,
      kind: "calc",
      title: "EQ vs Toxapex",
      created_at: expect.any(Number),
    });
    expect(body.pinnedArtifacts[0]).not.toHaveProperty("snapshot");
  });

  it("round-trips team_sheet and comparison snapshots (PIN-BR-2, PIN-AC-2.1)", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c");

    const team = await post(
      "c",
      pinBody({ kind: "team_sheet", title: "Rain", snapshot: TEAM_SNAP }),
    );
    const cmp = await post(
      "c",
      pinBody({ kind: "comparison", title: "Chomp vs Apex", snapshot: CMP_SNAP }),
    );
    expect(team.status).toBe(201);
    expect(cmp.status).toBe(201);

    const teamId = ((await team.json()) as { pin: { id: string } }).pin.id;
    const cmpId = ((await cmp.json()) as { pin: { id: string } }).pin.id;

    const teamSnap = await snapshot("c", teamId);
    expect(teamSnap.status).toBe(200);
    expect(await teamSnap.json()).toEqual({
      pin: {
        id: teamId,
        kind: "team_sheet",
        title: "Rain",
        snapshot: TEAM_SNAP,
      },
    });

    const cmpSnap = await snapshot("c", cmpId);
    expect(cmpSnap.status).toBe(200);
    expect((await cmpSnap.json()).pin.snapshot).toEqual(CMP_SNAP);
  });
});

describe("GET /api/conversations/:id/artifact-pins — list (PIN-US-1)", () => {
  it("lists this conversation's pin summaries in created order", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c");
    const first = await post("c", pinBody({ title: "A" }));
    const second = await post("c", pinBody({ title: "B" }));
    const firstId = ((await first.json()) as { pin: { id: string } }).pin.id;
    const secondId = ((await second.json()) as { pin: { id: string } }).pin.id;

    const res = await list("c");
    expect(res.status).toBe(200);
    const listed = summaries(await res.json());
    expect(listed.map((p) => p.id)).toEqual([firstId, secondId]);
    expect(listed[0]).toEqual({
      id: firstId,
      kind: "calc",
      title: "A",
      created_at: expect.any(Number),
    });
    expect(listed[0]).not.toHaveProperty("snapshot");
  });

  it("returns an empty list when the conversation has no pins", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c");
    const res = await list("c");
    expect(res.status).toBe(200);
    expect(summaries(await res.json())).toEqual([]);
  });
});

describe("GET snapshot — missing pin is 404 (PIN-AC-3.4)", () => {
  it("404s an unknown pin id on this conversation", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c");
    expect((await snapshot("c", randomUUID())).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Cap 5 (PIN-AC-3.1 / PIN-BR-3)
// ---------------------------------------------------------------------------

describe("POST cap — 6th pin is 409 pin_cap (PIN-AC-3.1, PIN-BR-3)", () => {
  it("inserts 5 and refuses the 6th without replacing an existing pin", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c");

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await post("c", pinBody({ title: `pin-${i}` }));
      expect(res.status).toBe(201);
      ids.push(((await res.json()) as { pin: { id: string } }).pin.id);
    }

    const sixth = await post("c", pinBody({ title: "pin-5" }));
    expect(sixth.status).toBe(409);
    expect(await sixth.json()).toEqual({ error: "pin_cap", max: 5 });

    const listed = await pinRepo.list(ACCT_A, "c");
    expect(listed).toHaveLength(5);
    expect(listed.map((p) => p.id).sort()).toEqual([...ids].sort());
  });
});

// ---------------------------------------------------------------------------
// DELETE 200 (PIN-AC-3.2 / PIN-BR-4)
// ---------------------------------------------------------------------------

describe("DELETE /api/conversations/:id/artifact-pins/:pinId (PIN-AC-3.2)", () => {
  it("unpins immediately and returns the remaining strip", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c");
    const keep = await post("c", pinBody({ title: "keep" }));
    const drop = await post("c", pinBody({ title: "drop" }));
    const keepId = ((await keep.json()) as { pin: { id: string } }).pin.id;
    const dropId = ((await drop.json()) as { pin: { id: string } }).pin.id;

    const res = await del("c", dropId);
    expect(res.status).toBe(200);
    const remaining = summaries(await res.json());
    expect(remaining.map((p) => p.id)).toEqual([keepId]);

    expect(await pinRepo.get(ACCT_A, "c", dropId)).toBeNull();
    expect((await snapshot("c", dropId)).status).toBe(404);
  });

  it("404s a missing pin id", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c");
    expect((await del("c", randomUUID())).status).toBe(404);
  });
});
