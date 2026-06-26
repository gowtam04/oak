/**
 * Unit tests for the agent runtime (`runPokebotWith` — the injectable seam of
 * `runPokebot`). The Anthropic client is a recorded-transcript stub and the
 * tool layer (`@/agent/tools`) is mocked, so these tests are deterministic and
 * never open SQLite or hit the model (design.md Phase 5 test focus).
 *
 * Coverage: the request shape (adaptive thinking + tool_choice "auto", NOT a
 * forced tool_choice; one ephemeral cache breakpoint on the last system block),
 * the happy path, tool dispatch + onProgress + single-user-message tool_results,
 * the submit_answer validate/re-emit budget, and every synthesized-fallback /
 * propagation branch.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentContext, ChatMessage } from "@/agent/types";
import type { PokebotAnswer } from "@/agent/schemas";

// --- Mock the tool layer so importing the runtime never pulls in better-sqlite3.
const { mockDispatch } = vi.hoisted(() => ({ mockDispatch: vi.fn() }));

vi.mock("@/agent/tools", () => ({
  tools: [
    {
      name: "query_pokedex",
      description: "d",
      inputSchema: { type: "object" },
      run: vi.fn(),
    },
    {
      name: "get_pokemon",
      description: "d",
      inputSchema: { type: "object" },
      run: vi.fn(),
    },
    {
      name: "submit_answer",
      description: "d",
      inputSchema: { type: "object" },
      run: vi.fn(),
    },
  ],
  dispatch: (...args: unknown[]) => mockDispatch(...args),
}));

import { MAX_ITERATIONS, runPokebotWith } from "./runtime";

// --- Fixtures --------------------------------------------------------------

const validAnswer: PokebotAnswer = {
  status: "answered",
  answer_markdown: "Garchomp is Dragon/Ground.",
  reasoning_markdown: "Looked up the profile.",
  citations: [{ source: "Pokédex index", detail: "Garchomp #445" }],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

const info = vi.fn();
const ctx = {
  db: {},
  requestId: "req-1",
  logger: {
    info,
    bindings: () => ({ request_id: "req-1", session_id: "sess-1" }),
  },
} as unknown as AgentContext;

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

function textBlock(text: string): Block {
  return { type: "text", text };
}

function toolUse(name: string, input: unknown, id: string): Block {
  return { type: "tool_use", id, name, input };
}

function message(content: Block[], stopReason = "tool_use"): unknown {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: 7,
      cache_creation: null,
      inference_geo: null,
      output_tokens_details: { thinking_tokens: 3 },
      server_tool_use: null,
      service_tier: "standard",
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Build a client whose `messages.create` replays a scripted transcript. The
 * runtime keeps mutating its live `messages` array after each call, so we snap
 * a deep copy of every request's params into `snapshots[i]` for assertions.
 */
function scriptedClient(responses: unknown[]) {
  const snapshots: any[] = [];
  const create = vi.fn((params: any): Promise<any> => {
    snapshots.push(structuredClone(params));
    const next = responses.shift();
    if (next === undefined) {
      return Promise.reject(new Error("transcript exhausted"));
    }
    return Promise.resolve(next);
  });
  return { client: { messages: { create } } as any, create, snapshots };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

beforeEach(() => {
  mockDispatch.mockReset();
  info.mockReset();
});

// --- Request shape ---------------------------------------------------------

describe("request shape (RISK DIRECTIVE: no forced tool_choice on Sonnet 4.6)", () => {
  it("sends adaptive thinking + tool_choice auto, never a forced tool", async () => {
    const { client, snapshots } = scriptedClient([
      message([toolUse("submit_answer", validAnswer, "t1")]),
    ]);

    await runPokebotWith(client, "is Garchomp fast?", [], ctx);

    const params = snapshots[0];
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params.tool_choice).toEqual({ type: "auto" });
    // Must NOT force submit_answer (that would 400 alongside thinking).
    expect(params.tool_choice.type).not.toBe("tool");
    expect(params.model).toBe("claude-sonnet-4-6");
  });

  it("places exactly one ephemeral cache breakpoint on the last system block", async () => {
    const { client, snapshots } = scriptedClient([
      message([toolUse("submit_answer", validAnswer, "t1")]),
    ]);

    await runPokebotWith(client, "q", [], ctx);

    const { system } = snapshots[0];
    expect(system[0].cache_control).toBeUndefined();
    expect(system[system.length - 1].cache_control).toEqual({
      type: "ephemeral",
    });
    const breakpoints = system.filter(
      (b: { cache_control?: unknown }) => b.cache_control,
    );
    expect(breakpoints).toHaveLength(1);
  });

  it("appends history then the current message as the variable tail", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "prev question" },
      { role: "assistant", content: "prev answer" },
    ];
    const { client, snapshots } = scriptedClient([
      message([toolUse("submit_answer", validAnswer, "t1")]),
    ]);

    await runPokebotWith(client, "follow up", history, ctx);

    const { messages } = snapshots[0];
    expect(messages[0]).toEqual({ role: "user", content: "prev question" });
    expect(messages[1]).toEqual({ role: "assistant", content: "prev answer" });
    expect(messages[2]).toEqual({ role: "user", content: "follow up" });
  });
});

// --- Happy paths -----------------------------------------------------------

describe("submit_answer termination", () => {
  it("returns the validated answer on a first valid submit (no dispatch)", async () => {
    const onProgress = vi.fn();
    const { client } = scriptedClient([
      message([toolUse("submit_answer", validAnswer, "t1")]),
    ]);

    const result = await runPokebotWith(client, "q", [], ctx, onProgress);

    expect(result).toEqual(validAnswer);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith({
      tool: "submit_answer",
      label: expect.any(String),
    });
    // Per-turn trace logged exactly once.
    expect(info).toHaveBeenCalledTimes(1);
    const [trace] = info.mock.calls[0];
    expect(trace).toMatchObject({
      request_id: "req-1",
      session_id: "sess-1",
      status: "answered",
      citation_count: 1,
      thinking_tokens: 3,
    });
  });

  it("dispatches a tool, emits progress, then returns the answer", async () => {
    mockDispatch.mockResolvedValueOnce({ total_count: 3, results: [] });
    const onProgress = vi.fn();
    const { client, snapshots } = scriptedClient([
      message([toolUse("query_pokedex", { types: ["fire"] }, "t1")]),
      message([toolUse("submit_answer", validAnswer, "t2")]),
    ]);

    const result = await runPokebotWith(
      client,
      "fire types",
      [],
      ctx,
      onProgress,
    );

    expect(result).toEqual(validAnswer);
    expect(mockDispatch).toHaveBeenCalledWith(
      "query_pokedex",
      { types: ["fire"] },
      ctx,
    );
    expect(onProgress).toHaveBeenCalledWith({
      tool: "query_pokedex",
      label: expect.any(String),
    });

    // The tool result is fed back in ONE user message with the matching id.
    const secondCallMessages = snapshots[1].messages;
    const lastUser = secondCallMessages[secondCallMessages.length - 1];
    expect(lastUser.role).toBe("user");
    expect(lastUser.content).toHaveLength(1);
    expect(lastUser.content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "t1",
    });
  });

  it("returns ALL parallel tool_results in a single user message", async () => {
    mockDispatch.mockResolvedValue({ ok: true });
    const { client, snapshots } = scriptedClient([
      message([
        toolUse("query_pokedex", {}, "t1"),
        toolUse("get_pokemon", { name: "x" }, "t2"),
      ]),
      message([toolUse("submit_answer", validAnswer, "t3")]),
    ]);

    await runPokebotWith(client, "q", [], ctx);

    const secondCallMessages = snapshots[1].messages;
    const lastUser = secondCallMessages[secondCallMessages.length - 1];
    expect(lastUser.content).toHaveLength(2);
    expect(
      lastUser.content.map((c: { tool_use_id: string }) => c.tool_use_id),
    ).toEqual(["t1", "t2"]);
  });
});

// --- Validation / retry budget --------------------------------------------

describe("submit_answer validation + re-emit budget", () => {
  it("re-emits a validation error on an invalid payload, then accepts the fix", async () => {
    const { client, snapshots } = scriptedClient([
      message([toolUse("submit_answer", { status: "answered" }, "t1")]), // invalid
      message([toolUse("submit_answer", validAnswer, "t2")]),
    ]);

    const result = await runPokebotWith(client, "q", [], ctx);

    expect(result).toEqual(validAnswer);
    const secondCallMessages = snapshots[1].messages;
    const lastUser = secondCallMessages[secondCallMessages.length - 1];
    expect(lastUser.content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "t1",
      is_error: true,
    });
    expect(lastUser.content[0].content).toMatch(/failed validation/i);
  });

  it("synthesizes insufficient_data after the re-emit budget is exhausted", async () => {
    const invalid = () =>
      message([toolUse("submit_answer", { status: "answered" }, "tx")]);
    const { client, create } = scriptedClient([
      invalid(),
      invalid(),
      invalid(),
    ]);

    const result = await runPokebotWith(client, "q", [], ctx);

    expect(result.status).toBe("insufficient_data");
    expect(result.uncertainty_flags).toContain(
      "submit_answer_invalid_after_retries",
    );
    // 2 re-emits → 3 model calls total.
    expect(create).toHaveBeenCalledTimes(3);
  });
});

// --- Synthesized fallbacks + propagation -----------------------------------

describe("orchestration fallbacks", () => {
  it("synthesizes insufficient_data when the loop hits the iteration cap", async () => {
    // The model never submits — always asks for another tool.
    const { client, create } = scriptedClient([]);
    create.mockImplementation(() =>
      Promise.resolve(message([toolUse("query_pokedex", {}, "t")])),
    );
    mockDispatch.mockResolvedValue({ ok: true });

    const result = await runPokebotWith(client, "q", [], ctx);

    expect(result.status).toBe("insufficient_data");
    expect(result.uncertainty_flags).toContain("max_iterations_reached");
    expect(create).toHaveBeenCalledTimes(MAX_ITERATIONS);
  });

  it("synthesizes insufficient_data when the model ends a turn without submitting", async () => {
    const { client } = scriptedClient([
      message([textBlock("here is some prose")], "end_turn"),
    ]);

    const result = await runPokebotWith(client, "q", [], ctx);

    expect(result.status).toBe("insufficient_data");
    expect(result.uncertainty_flags).toContain(
      "model_ended_turn_without_submit_answer",
    );
  });

  it("feeds a thrown tool fault back to the model rather than crashing", async () => {
    mockDispatch.mockRejectedValueOnce(new Error("db exploded"));
    const { client, snapshots } = scriptedClient([
      message([toolUse("query_pokedex", {}, "t1")]),
      message([toolUse("submit_answer", validAnswer, "t2")]),
    ]);

    const result = await runPokebotWith(client, "q", [], ctx);

    expect(result).toEqual(validAnswer);
    const lastUser = snapshots[1].messages.at(-1);
    expect(lastUser.content[0]).toMatchObject({
      type: "tool_result",
      is_error: true,
    });
    expect(lastUser.content[0].content).toMatch(/db exploded/);
  });

  it("propagates a transport/API fault as a thrown error", async () => {
    const { client, create } = scriptedClient([]);
    create.mockRejectedValueOnce(new Error("boom 529"));

    await expect(runPokebotWith(client, "q", [], ctx)).rejects.toThrow(
      "boom 529",
    );
  });
});
