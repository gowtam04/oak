/**
 * Oracle tests for src/data/repos/usage-repo.ts — the sole writer for the two
 * append-only admin recording tables (turn_record, auth_event), plus the static
 * cost estimator in src/server/admin/pricing.ts.
 *
 * Harness (mirrors accounts-repo.test.ts): the repo reads the `@/data/db`
 * SINGLETON directly, so we migrate an isolated Postgres schema (seed "none"),
 * installAsSingleton(fix) BEFORE the first dynamic import of the repo, and
 * neutralize `server-only` (it throws under the vitest node env). Read-back
 * assertions query the schema directly via the fixture's Drizzle handle.
 *
 * Coverage (design.md § Data Model + Interface Definitions › usage-repo /
 * pricing; ADMIN-AC-6.1/6.2, AD-3/AD-4/AD-6, ADMIN-BR-5):
 *   - recordTurn inserts and round-trips EVERY turn_record column.
 *   - tool_error_count is DERIVED from the tool trace (mix of error/no-error).
 *   - a "rate_limited" row stores null model/provider_model AND null
 *     answer_text/answer_json (AD-4).
 *   - recordAuthEvent round-trips (incl. JSON detail + mint of the row id).
 *   - estimateCostUsd math for a known model, and unknown/null model → 0.
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// usage-repo.ts / db.ts `import "server-only"` (throws under node). Neutralize
// it; the real Postgres handle is supplied via installAsSingleton below.
vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

// pricing.ts is a pure module (no server-only / DB) — safe to import statically.
import { MODEL_PRICING, estimateCostUsd } from "@/server/admin/pricing";

import type { TurnRecordInput } from "./usage-repo";

type Repo = typeof import("./usage-repo");

let fix: PgFixture;
let repo: Repo;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  // Install BEFORE importing the repo so its `import { db } from "@/data/db"`
  // binds to this schema's handle.
  await installAsSingleton(fix);
  repo = await import("./usage-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE turn_record, auth_event RESTART IDENTITY`,
  );
});

// Read one turn_record row by id directly from the schema (snake_case keys, the
// Drizzle column property names). Returns null if absent.
async function readTurn(
  id: string,
): Promise<Record<string, unknown> | null> {
  const res = await fix.db.execute(
    sql`SELECT * FROM turn_record WHERE id = ${id} LIMIT 1`,
  );
  return (res.rows[0] as Record<string, unknown> | undefined) ?? null;
}

async function readAuthEvents(): Promise<Record<string, unknown>[]> {
  const res = await fix.db.execute(
    sql`SELECT * FROM auth_event ORDER BY created_at ASC`,
  );
  return res.rows as Record<string, unknown>[];
}

// A fully-populated "answered" turn input (every field set).
function answeredTurn(over: Partial<TurnRecordInput> = {}): TurnRecordInput {
  return {
    id: randomUUID(),
    sessionId: "sess-1",
    accountId: "acct-1",
    model: "grok-4.3",
    providerModel: "grok-2-latest",
    mode: "standard",
    status: "answered",
    inputTokens: 1200,
    outputTokens: 340,
    thinkingTokens: 80,
    toolTrace: [
      {
        tool: "resolve_entity",
        args: { query: "Garchomp" },
        latency_ms: 12,
        cache_hit: true,
        error: null,
      },
    ],
    citationCount: 2,
    turnLatencyMs: 1530,
    imagesCount: 1,
    promptText: "How fast is Garchomp?",
    answerText: "Garchomp has base 102 Speed.",
    answer: { status: "answered", answer_markdown: "Garchomp has base 102 Speed." },
    createdAt: 1_700_000_000_000,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// recordTurn — insert + full read-back (AD-3: full content persisted)
// ---------------------------------------------------------------------------

describe("recordTurn", () => {
  it("inserts and round-trips every turn_record column", async () => {
    const input = answeredTurn();
    await repo.recordTurn(input);

    const row = await readTurn(input.id);
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      id: input.id,
      session_id: "sess-1",
      account_id: "acct-1",
      model: "grok-4.3",
      provider_model: "grok-2-latest",
      mode: "standard",
      status: "answered",
      input_tokens: 1200,
      output_tokens: 340,
      thinking_tokens: 80,
      tool_error_count: 0,
      citation_count: 2,
      turn_latency_ms: 1530,
      images_count: 1,
      prompt_text: "How fast is Garchomp?",
      answer_text: "Garchomp has base 102 Speed.",
    });

    // tool_trace is the JSON-serialized trace; answer_json is the serialized answer.
    expect(JSON.parse(row!.tool_trace as string)).toEqual(input.toolTrace);
    expect(JSON.parse(row!.answer_json as string)).toEqual(input.answer);

    // created_at is bigint mode:"number" → reads back as a JS number.
    expect(typeof Number(row!.created_at)).toBe("number");
    expect(Number(row!.created_at)).toBe(1_700_000_000_000);
  });

  it("stores a guest turn with a null account_id", async () => {
    const input = answeredTurn({ accountId: null });
    await repo.recordTurn(input);

    const row = await readTurn(input.id);
    expect(row!.account_id).toBeNull();
  });

  it("derives tool_error_count from the tool trace (mix of error/no-error)", async () => {
    const input = answeredTurn({
      toolTrace: [
        { tool: "resolve_entity", args: {}, latency_ms: 5, cache_hit: true, error: null },
        { tool: "get_pokemon", args: {}, latency_ms: 9, cache_hit: false, error: "index_unavailable" },
        { tool: "get_move", args: {}, latency_ms: 7, cache_hit: false, error: null },
        { tool: "get_type_chart", args: {}, latency_ms: 3, cache_hit: false, error: "timeout" },
      ],
    });
    await repo.recordTurn(input);

    const row = await readTurn(input.id);
    // 2 of the 4 entries carry a non-null error.
    expect(row!.tool_error_count).toBe(2);
    // The full trace is still persisted verbatim.
    expect(JSON.parse(row!.tool_trace as string)).toHaveLength(4);
  });

  it("derives tool_error_count = 0 for an empty trace and serializes '[]'", async () => {
    const input = answeredTurn({ toolTrace: [] });
    await repo.recordTurn(input);

    const row = await readTurn(input.id);
    expect(row!.tool_error_count).toBe(0);
    expect(row!.tool_trace).toBe("[]");
  });

  it("stores a rate_limited row with null model/provider_model AND null answer (AD-4)", async () => {
    const input: TurnRecordInput = {
      id: randomUUID(),
      sessionId: "sess-rl",
      accountId: null,
      model: null, // not resolved before the rate-limit rejection
      providerModel: null,
      mode: "standard",
      status: "rate_limited",
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      toolTrace: [],
      citationCount: 0,
      turnLatencyMs: 0,
      imagesCount: 0,
      promptText: "spammy message",
      answerText: null,
      answer: null,
      createdAt: 1_700_000_500_000,
    };
    await repo.recordTurn(input);

    const row = await readTurn(input.id);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("rate_limited");
    expect(row!.model).toBeNull();
    expect(row!.provider_model).toBeNull();
    expect(row!.answer_text).toBeNull();
    expect(row!.answer_json).toBeNull();
    // The prompt is still searchable even on a rejected turn.
    expect(row!.prompt_text).toBe("spammy message");
  });
});

// ---------------------------------------------------------------------------
// recordAuthEvent — insert + read-back (id minted by the repo)
// ---------------------------------------------------------------------------

describe("recordAuthEvent", () => {
  it("round-trips an otp_verified signup event with account + created_flag", async () => {
    await repo.recordAuthEvent({
      type: "otp_verified",
      email: "ash@pallet.town",
      accountId: "acct-9",
      createdFlag: 1,
      createdAt: 1_700_000_000_000,
    });

    const [row] = await readAuthEvents();
    expect(typeof row.id).toBe("string"); // repo-minted UUID
    expect(row).toMatchObject({
      type: "otp_verified",
      email: "ash@pallet.town",
      account_id: "acct-9",
      created_flag: 1,
      detail: null,
    });
    expect(Number(row.created_at)).toBe(1_700_000_000_000);
  });

  it("serializes the detail payload to JSON for otp_email_failed (nulls default)", async () => {
    await repo.recordAuthEvent({
      type: "otp_email_failed",
      email: "misty@cerulean.gym",
      detail: { error: "smtp 550" },
      createdAt: 1_700_000_100_000,
    });

    const [row] = await readAuthEvents();
    expect(row).toMatchObject({
      type: "otp_email_failed",
      email: "misty@cerulean.gym",
      account_id: null, // omitted → null
      created_flag: null, // omitted → null
    });
    expect(JSON.parse(row.detail as string)).toEqual({ error: "smtp 550" });
  });

  it("stores an otp_requested event with a null email and mints distinct ids", async () => {
    await repo.recordAuthEvent({
      type: "otp_requested",
      email: null,
      createdAt: 1,
    });
    await repo.recordAuthEvent({
      type: "otp_requested",
      email: null,
      createdAt: 2,
    });

    const rows = await readAuthEvents();
    expect(rows).toHaveLength(2);
    expect(rows[0].email).toBeNull();
    expect(rows[0].id).not.toBe(rows[1].id); // each row gets its own UUID
  });
});

// ---------------------------------------------------------------------------
// pricing — estimateCostUsd (AD-6 / ADMIN-BR-5: static estimate)
// ---------------------------------------------------------------------------

describe("estimateCostUsd", () => {
  it("computes cost from the static table for a known model", async () => {
    const price = MODEL_PRICING["grok-4.3"];
    const usd = estimateCostUsd({
      model: "grok-4.3",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      thinkingTokens: 1_000_000,
    });
    // 1M of each token role → exactly the per-1M price for each role.
    expect(usd).toBeCloseTo(
      price.inputPer1M + price.outputPer1M + price.thinkingPer1M,
      6,
    );
  });

  it("scales linearly with token counts", async () => {
    const price = MODEL_PRICING.claude;
    const usd = estimateCostUsd({
      model: "claude",
      inputTokens: 500_000, // half of 1M input
      outputTokens: 0,
      thinkingTokens: 0,
    });
    expect(usd).toBeCloseTo(price.inputPer1M / 2, 6);
  });

  it("returns 0 for an unknown model (caller flags un-priced)", async () => {
    expect(
      estimateCostUsd({
        model: "made-up-model",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        thinkingTokens: 1_000_000,
      }),
    ).toBe(0);
  });

  it("returns 0 for a null model (e.g. a rate_limited row)", async () => {
    expect(
      estimateCostUsd({
        model: null,
        inputTokens: 9_999_999,
        outputTokens: 9_999_999,
        thinkingTokens: 9_999_999,
      }),
    ).toBe(0);
  });

  it("returns 0 when a known model has zero tokens", async () => {
    expect(
      estimateCostUsd({
        model: "gpt-5.5",
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
      }),
    ).toBe(0);
  });
});
