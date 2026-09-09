/**
 * Oracle tests for src/data/repos/artifact-pin-repo.ts — conversation
 * artifact pins (docs/features/answer-cards-and-artifacts).
 *
 * The pin table (`conversation_artifact_pin`) is added by
 * `web/drizzle/0020_answer_card_artifacts.sql`. Until that migration
 * exists these tests are the intended red — do not skip or mock the table.
 *
 * Expected exports (architecture data-model + implementation-plan):
 *   list / get / insert (cap 5) / delete / deleteForConversation / deleteForAccount
 *
 * Requirement refs: PIN-BR-1, PIN-BR-2, PIN-BR-3, PIN-BR-4, PIN-BR-5, AUTH-BR-2.
 */

import { randomUUID } from "node:crypto";

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

import type { OakAnswer } from "@/agent/schemas";

type PinRepo = typeof import("./artifact-pin-repo");
type ConversationRepo = typeof import("./conversation-repo");
type AccountsRepo = typeof import("./accounts-repo");

let fix: PgFixture;
let pins: PinRepo;
let conversations: ConversationRepo;
let accounts: AccountsRepo;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  pins = await import("./artifact-pin-repo");
  conversations = await import("./conversation-repo");
  accounts = await import("./accounts-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE conversation_artifact_pin, account, auth_session, otp_code, conversation, conversation_message, team, turn_record, auth_event, shared_answer, account_scope_mru, conversation_folder RESTART IDENTITY`,
  );
});

const EMAIL_A = "ash@pallet.town";
const EMAIL_B = "misty@cerulean.gym";
const SV = "scarlet-violet";

function makeAnswer(markdown: string): OakAnswer {
  return {
    status: "answered",
    answer_markdown: markdown,
    reasoning_markdown: "because reasons",
    citations: [],
    inferences: [],
    generation_basis: { generation: "gen-9", fallback: false },
  };
}

function errorText(err: unknown): string {
  if (err instanceof Error) {
    const extra = (err as Error & { code?: string }).code;
    return extra ? `${extra} ${err.message}` : err.message;
  }
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return String(err);
}

function expectCode(err: unknown, code: string): boolean {
  return errorText(err).includes(code);
}

/** PIN-BR-2 — rich types only. Stored as given JSON (PIN-BR-1). */
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

type PinRow = {
  id?: string;
  kind?: string;
  title?: string;
  snapshot?: unknown;
  snapshotJson?: unknown;
  snapshot_json?: unknown;
};

function pinSnapshot(row: PinRow | null | undefined): unknown {
  if (!row) return undefined;
  const raw = row.snapshot ?? row.snapshotJson ?? row.snapshot_json;
  if (typeof raw === "string") return JSON.parse(raw) as unknown;
  return raw;
}

async function seedAccount(email: string): Promise<string> {
  const id = randomUUID();
  await accounts.createAccount(email, id, 1_700_000_000_000);
  return id;
}

async function startConversation(
  accountId: string,
  now = 1000,
): Promise<string> {
  const id = randomUUID();
  await conversations.appendTurnPair({
    accountId,
    conversationId: id,
    format: SV,
    userTurnId: conversations.newTurnId(),
    userMessage: "pin this",
    assistantTurnId: conversations.newTurnId(),
    answer: makeAnswer("ok"),
    now,
  });
  return id;
}

async function insertPin(
  accountId: string,
  conversationId: string,
  over: {
    kind?: "team_sheet" | "comparison" | "calc";
    title?: string;
    snapshot?: unknown;
  } = {},
) {
  const kind = over.kind ?? "calc";
  const snapshot =
    over.snapshot ??
    (kind === "team_sheet"
      ? TEAM_SNAP
      : kind === "comparison"
        ? CMP_SNAP
        : CALC_SNAP);
  return pins.insert({
    accountId,
    conversationId,
    kind,
    title: over.title ?? "EQ vs Toxapex",
    snapshot,
  });
}

// ---------------------------------------------------------------------------
// insert + get — snapshot fidelity (PIN-BR-1, PIN-BR-2)
// ---------------------------------------------------------------------------

describe("insert + get — snapshot fidelity (PIN-BR-1, PIN-BR-2)", () => {
  it("stores the given snapshot_json and returns it on get without re-fetch (PIN-BR-1)", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conversationId = await startConversation(accountId);
    const created = await insertPin(accountId, conversationId, {
      kind: "calc",
      title: "EQ vs Toxapex",
      snapshot: CALC_SNAP,
    });
    expect(created.id).toEqual(expect.any(String));

    const got = (await pins.get(
      accountId,
      conversationId,
      created.id,
    )) as PinRow | null;
    expect(got).not.toBeNull();
    expect(got).toMatchObject({
      id: created.id,
      kind: "calc",
      title: "EQ vs Toxapex",
    });
    expect(pinSnapshot(got)).toEqual(CALC_SNAP);
  });

  it("round-trips team_sheet and comparison snapshots as given (PIN-BR-2)", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conversationId = await startConversation(accountId);

    const team = await insertPin(accountId, conversationId, {
      kind: "team_sheet",
      title: "Rain",
      snapshot: TEAM_SNAP,
    });
    const cmp = await insertPin(accountId, conversationId, {
      kind: "comparison",
      title: "Chomp vs Apex",
      snapshot: CMP_SNAP,
    });

    expect(
      pinSnapshot(await pins.get(accountId, conversationId, team.id)),
    ).toEqual(TEAM_SNAP);
    expect(
      pinSnapshot(await pins.get(accountId, conversationId, cmp.id)),
    ).toEqual(CMP_SNAP);
  });

  it("does not mutate the stored snapshot if the caller later mutates the object (PIN-BR-1)", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conversationId = await startConversation(accountId);
    const snapshot = { ...CALC_SNAP, result: { ...CALC_SNAP.result } };
    const created = await insertPin(accountId, conversationId, {
      snapshot,
    });
    snapshot.result.min_damage = 999;

    expect(
      pinSnapshot(await pins.get(accountId, conversationId, created.id)),
    ).toEqual(CALC_SNAP);
  });

  it("get returns null for a missing pin id", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conversationId = await startConversation(accountId);
    expect(
      await pins.get(accountId, conversationId, randomUUID()),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("list", () => {
  it("lists only this conversation's pins", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conv1 = await startConversation(accountId, 1000);
    const conv2 = await startConversation(accountId, 2000);
    const a = await insertPin(accountId, conv1, { title: "A" });
    await insertPin(accountId, conv2, { title: "B" });

    const listed = await pins.list(accountId, conv1);
    expect(listed.map((p: PinRow) => p.id)).toEqual([a.id]);
    expect(listed[0]).toMatchObject({ kind: "calc", title: "A" });
  });

  it("returns [] when the conversation has no pins", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conversationId = await startConversation(accountId);
    expect(await pins.list(accountId, conversationId)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// cap 5 — refuse the 6th (PIN-BR-3)
// ---------------------------------------------------------------------------

describe("insert cap (PIN-BR-3)", () => {
  it("inserts 5 pins and rejects the 6th with pin_cap without replacing an existing pin", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conversationId = await startConversation(accountId);

    const created: { id: string }[] = [];
    for (let i = 0; i < 5; i++) {
      created.push(
        await insertPin(accountId, conversationId, { title: `pin-${i}` }),
      );
    }
    expect(await pins.list(accountId, conversationId)).toHaveLength(5);

    await expect(
      insertPin(accountId, conversationId, { title: "pin-5" }),
    ).rejects.toSatisfy((e) => expectCode(e, "pin_cap"));

    const listed = await pins.list(accountId, conversationId);
    expect(listed).toHaveLength(5);
    expect(listed.map((p: PinRow) => p.id).sort()).toEqual(
      created.map((p) => p.id).sort(),
    );
  });

  it("the cap is per conversation — a second thread still accepts a pin (PIN-BR-1, PIN-BR-3)", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conv1 = await startConversation(accountId, 1000);
    const conv2 = await startConversation(accountId, 2000);
    for (let i = 0; i < 5; i++) {
      await insertPin(accountId, conv1, { title: `c1-${i}` });
    }
    const extra = await insertPin(accountId, conv2, { title: "c2-0" });
    expect(await pins.list(accountId, conv1)).toHaveLength(5);
    expect((await pins.list(accountId, conv2)).map((p: PinRow) => p.id)).toEqual(
      [extra.id],
    );
  });
});

// ---------------------------------------------------------------------------
// delete — immediate unpin (PIN-BR-4)
// ---------------------------------------------------------------------------

describe("delete (PIN-BR-4)", () => {
  it("removes the pin immediately; get is null and list no longer includes it", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conversationId = await startConversation(accountId);
    const created = await insertPin(accountId, conversationId);

    await pins.delete(accountId, conversationId, created.id);

    expect(await pins.get(accountId, conversationId, created.id)).toBeNull();
    expect(await pins.list(accountId, conversationId)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isolation — other account ≡ missing (AUTH-BR-2)
// ---------------------------------------------------------------------------

describe("account isolation (AUTH-BR-2)", () => {
  it("list / get treat another account as missing", async () => {
    const accountA = await seedAccount(EMAIL_A);
    const accountB = await seedAccount(EMAIL_B);
    const conversationId = await startConversation(accountA);
    const created = await insertPin(accountA, conversationId, {
      title: "secret calc",
    });

    expect(await pins.get(accountB, conversationId, created.id)).toBeNull();
    expect(await pins.list(accountB, conversationId)).toEqual([]);
    expect(await pins.get(accountA, conversationId, created.id)).not.toBeNull();
  });

  it("delete by another account is a no-op; the owner still has the pin", async () => {
    const accountA = await seedAccount(EMAIL_A);
    const accountB = await seedAccount(EMAIL_B);
    const conversationId = await startConversation(accountA);
    const created = await insertPin(accountA, conversationId);

    await pins.delete(accountB, conversationId, created.id);

    expect(
      await pins.get(accountA, conversationId, created.id),
    ).not.toBeNull();
  });

  it("get with the wrong conversation id is missing", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conv1 = await startConversation(accountId, 1000);
    const conv2 = await startConversation(accountId, 2000);
    const created = await insertPin(accountId, conv1);
    expect(await pins.get(accountId, conv2, created.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cascade helpers (PIN-BR-5)
// ---------------------------------------------------------------------------

describe("deleteForConversation + deleteForAccount (PIN-BR-5)", () => {
  it("deleteForConversation removes only that conversation's pins", async () => {
    const accountId = await seedAccount(EMAIL_A);
    const conv1 = await startConversation(accountId, 1000);
    const conv2 = await startConversation(accountId, 2000);
    await insertPin(accountId, conv1, { title: "c1" });
    const keep = await insertPin(accountId, conv2, { title: "c2" });

    await pins.deleteForConversation(accountId, conv1);

    expect(await pins.list(accountId, conv1)).toEqual([]);
    expect((await pins.list(accountId, conv2)).map((p: PinRow) => p.id)).toEqual(
      [keep.id],
    );
  });

  it("deleteForConversation by another account does not remove the owner's pins (AUTH-BR-2)", async () => {
    const accountA = await seedAccount(EMAIL_A);
    const accountB = await seedAccount(EMAIL_B);
    const conversationId = await startConversation(accountA);
    const created = await insertPin(accountA, conversationId);

    await pins.deleteForConversation(accountB, conversationId);

    expect(
      await pins.get(accountA, conversationId, created.id),
    ).not.toBeNull();
  });

  it("deleteForAccount removes every pin for that account and leaves others", async () => {
    const accountA = await seedAccount(EMAIL_A);
    const accountB = await seedAccount(EMAIL_B);
    const convA = await startConversation(accountA, 1000);
    const convB = await startConversation(accountB, 2000);
    await insertPin(accountA, convA, { title: "A" });
    const keep = await insertPin(accountB, convB, { title: "B" });

    await pins.deleteForAccount(accountA);

    expect(await pins.list(accountA, convA)).toEqual([]);
    expect((await pins.list(accountB, convB)).map((p: PinRow) => p.id)).toEqual(
      [keep.id],
    );
  });
});
