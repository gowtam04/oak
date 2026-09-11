/**
 * Oracle tests for turn_record retention (B-26): strip fat columns after the
 * guest 14d / signed-in 90d windows, never DELETE, never touch
 * conversation_message, preserve analytics columns.
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GUEST_FULL_RETENTION_MS,
  SIGNED_IN_FULL_RETENTION_MS,
  pruneTurnRecords,
} from "./turn-record-retention";
import { conversation_message, turn_record } from "@/data/schema";
import {
  createPgSchema,
  type PgFixture,
} from "../../../test/support/pg";

let fix: PgFixture;

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE turn_record, conversation_message, conversation, app_setting`,
  );
});

async function insertTurn(over: {
  id?: string;
  accountId?: string | null;
  createdAt: number;
  promptText?: string;
  answerText?: string | null;
  answerJson?: string | null;
  toolTrace?: string;
  inputTokens?: number;
  status?: string;
}): Promise<string> {
  const id = over.id ?? randomUUID();
  await fix.db.insert(turn_record).values({
    id,
    session_id: "sess-1",
    account_id: over.accountId === undefined ? "acct-1" : over.accountId,
    model: "grok-4.6",
    provider_model: "grok-4.6",
    mode: "champions",
    status: over.status ?? "answered",
    input_tokens: over.inputTokens ?? 100,
    output_tokens: 40,
    thinking_tokens: 5,
    cached_input_tokens: 2,
    tool_trace: over.toolTrace ?? JSON.stringify([{ tool: "get_pokemon" }]),
    tool_error_count: 1,
    citation_count: 3,
    turn_latency_ms: 900,
    images_count: 1,
    client: "web",
    prompt_text: over.promptText ?? "How fast is Garchomp?",
    answer_text: over.answerText === undefined ? "base 102" : over.answerText,
    answer_json:
      over.answerJson === undefined
        ? JSON.stringify({ status: "answered" })
        : over.answerJson,
    created_at: over.createdAt,
  });
  return id;
}

async function readTurn(id: string): Promise<Record<string, unknown>> {
  const res = await fix.db.execute(
    sql`SELECT * FROM turn_record WHERE id = ${id} LIMIT 1`,
  );
  return res.rows[0] as Record<string, unknown>;
}

describe("pruneTurnRecords", () => {
  it("strips guest rows older than 14 days, including prompt_text", async () => {
    const id = await insertTurn({
      accountId: null,
      createdAt: NOW - GUEST_FULL_RETENTION_MS - 1,
    });

    const result = await pruneTurnRecords(fix.bundle.pool, NOW);
    expect(result).toEqual({
      scanned: 1,
      strippedGuest: 1,
      strippedSigned: 0,
    });

    const row = await readTurn(id);
    expect(row.answer_json).toBeNull();
    expect(row.answer_text).toBeNull();
    expect(row.tool_trace).toBe("[]");
    expect(row.prompt_text).toBe("");
    expect(row.input_tokens).toBe(100);
    expect(row.output_tokens).toBe(40);
    expect(row.thinking_tokens).toBe(5);
    expect(row.cached_input_tokens).toBe(2);
    expect(row.tool_error_count).toBe(1);
    expect(row.citation_count).toBe(3);
    expect(row.turn_latency_ms).toBe(900);
    expect(row.images_count).toBe(1);
    expect(row.client).toBe("web");
    expect(row.model).toBe("grok-4.6");
    expect(row.status).toBe("answered");
    expect(Number(row.created_at)).toBe(NOW - GUEST_FULL_RETENTION_MS - 1);
  });

  it("strips signed-in rows older than 90 days but leaves prompt_text", async () => {
    const id = await insertTurn({
      accountId: "acct-1",
      createdAt: NOW - SIGNED_IN_FULL_RETENTION_MS - 1,
      promptText: "keep me searchable",
    });

    const result = await pruneTurnRecords(fix.bundle.pool, NOW);
    expect(result).toEqual({
      scanned: 1,
      strippedGuest: 0,
      strippedSigned: 1,
    });

    const row = await readTurn(id);
    expect(row.answer_json).toBeNull();
    expect(row.answer_text).toBeNull();
    expect(row.tool_trace).toBe("[]");
    expect(row.prompt_text).toBe("keep me searchable");
    expect(row.account_id).toBe("acct-1");
    expect(row.input_tokens).toBe(100);
  });

  it("leaves a guest just inside the 14-day window untouched", async () => {
    const id = await insertTurn({
      accountId: null,
      createdAt: NOW - GUEST_FULL_RETENTION_MS + DAY,
    });

    const result = await pruneTurnRecords(fix.bundle.pool, NOW);
    expect(result.scanned).toBe(0);
    const row = await readTurn(id);
    expect(row.answer_json).not.toBeNull();
    expect(row.prompt_text).toBe("How fast is Garchomp?");
  });

  it("leaves a signed-in row just inside the 90-day window untouched", async () => {
    const id = await insertTurn({
      accountId: "acct-1",
      createdAt: NOW - SIGNED_IN_FULL_RETENTION_MS + DAY,
    });

    const result = await pruneTurnRecords(fix.bundle.pool, NOW);
    expect(result.scanned).toBe(0);
    const row = await readTurn(id);
    expect(row.answer_json).not.toBeNull();
    expect(JSON.parse(row.tool_trace as string)).toEqual([
      { tool: "get_pokemon" },
    ]);
  });

  it("is a no-op on already-stripped rows (idempotent)", async () => {
    const guestId = await insertTurn({
      accountId: null,
      createdAt: NOW - GUEST_FULL_RETENTION_MS - DAY,
      promptText: "",
      answerText: null,
      answerJson: null,
      toolTrace: "[]",
    });
    const signedId = await insertTurn({
      accountId: "acct-1",
      createdAt: NOW - SIGNED_IN_FULL_RETENTION_MS - DAY,
      promptText: "still here",
      answerText: null,
      answerJson: null,
      toolTrace: "[]",
    });

    const first = await pruneTurnRecords(fix.bundle.pool, NOW);
    expect(first.scanned).toBe(0);
    const second = await pruneTurnRecords(fix.bundle.pool, NOW);
    expect(second).toEqual({
      scanned: 0,
      strippedGuest: 0,
      strippedSigned: 0,
    });

    expect((await readTurn(guestId)).prompt_text).toBe("");
    expect((await readTurn(signedId)).prompt_text).toBe("still here");
  });

  it("does not DELETE turn_record rows", async () => {
    await insertTurn({
      accountId: null,
      createdAt: NOW - GUEST_FULL_RETENTION_MS - 1,
    });
    await insertTurn({
      accountId: "acct-1",
      createdAt: NOW - SIGNED_IN_FULL_RETENTION_MS - 1,
    });

    await pruneTurnRecords(fix.bundle.pool, NOW);
    const count = await fix.db.execute(sql`SELECT count(*)::int AS n FROM turn_record`);
    expect((count.rows[0] as { n: number }).n).toBe(2);
  });

  it("does not touch conversation_message", async () => {
    const msgId = randomUUID();
    await fix.db.insert(conversation_message).values({
      id: msgId,
      conversation_id: "conv-1",
      account_id: "acct-1",
      seq: 1,
      role: "assistant",
      text_content: "keep this card",
      answer_json: JSON.stringify({ status: "answered" }),
      created_at: NOW - SIGNED_IN_FULL_RETENTION_MS - 1,
    });
    await insertTurn({
      accountId: "acct-1",
      createdAt: NOW - SIGNED_IN_FULL_RETENTION_MS - 1,
    });

    await pruneTurnRecords(fix.bundle.pool, NOW);

    const msg = await fix.db.execute(
      sql`SELECT text_content, answer_json FROM conversation_message WHERE id = ${msgId}`,
    );
    expect(msg.rows[0]).toMatchObject({
      text_content: "keep this card",
      answer_json: JSON.stringify({ status: "answered" }),
    });
  });
});
