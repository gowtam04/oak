/**
 * Route-framing tests for `POST /api/teams/assistant` (route.ts) — the SSE
 * endpoint embedding the team-builder assistant in `/teams`. Mirrors
 * src/app/api/chat/route.test.ts's mocking conventions (vi.mock intercepts
 * the route's dynamic `import()` calls exactly like a static one).
 *
 * The runtime/model/DB are fully mocked here — this file pins the ROUTE's own
 * contract (auth-before-body-state ordering, Zod body validation, the
 * signed-in-only rate-limit tier, the SSE frame sequence, and history
 * isolation under the `teams-assistant:` key prefix), not the legality gate
 * (covered by runtime-hooks.test.ts) or the hooks seam (runtime.hooks.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

const factory = vi.hoisted(() => ({
  activeModelKey: vi.fn(),
  isModelConfigured: vi.fn(),
  providerFor: vi.fn(),
}));
vi.mock("@/agent/providers/factory", () => factory);

const { mockRunWithProvider } = vi.hoisted(() => ({
  mockRunWithProvider: vi.fn(),
}));
vi.mock("@/agent/runtime", () => ({ runWithProvider: mockRunWithProvider }));

const { mockCreateCtx, captured } = vi.hoisted(() => ({
  mockCreateCtx: vi.fn(),
  captured: { options: null as Record<string, unknown> | null },
}));
vi.mock("@/agent/context", () => ({ createAgentContext: mockCreateCtx }));

const { mockBuildBuilderHooks } = vi.hoisted(() => ({
  mockBuildBuilderHooks: vi.fn(() => ({ marker: "builder-hooks" })),
}));
vi.mock("@/agent/teams-assistant/runtime-hooks", () => ({
  buildBuilderHooks: mockBuildBuilderHooks,
}));

import {
  _resetStoreForTests as resetRateLimit,
  checkRateLimit,
  TEAMS_ASSISTANT_CONFIG,
} from "@/server/rate-limit";
import {
  _resetStoreForTests as resetSessionStore,
  getHistory,
} from "@/server/session-store";

let route: typeof import("./route");

const ACCT_A = "acct-teams-a";

const BUILDER_ANSWER = {
  answer_markdown: "Here's your team.",
  team_patch: { slots: [{ slot: 0, member: null }] },
};

beforeEach(async () => {
  route = await import("./route");

  cu.getCurrentAccount.mockReset();

  factory.activeModelKey.mockReset();
  factory.activeModelKey.mockResolvedValue("grok-4.3");
  factory.isModelConfigured.mockReset();
  factory.isModelConfigured.mockReturnValue(true);
  factory.providerFor.mockReset();
  factory.providerFor.mockReturnValue({ kind: "xai", apiModelId: "fake" });

  mockRunWithProvider.mockReset();
  mockRunWithProvider.mockImplementation(
    async (
      _provider: unknown,
      _message: string,
      _history: unknown,
      _ctx: unknown,
      onProgress?: (a: { tool: string; label: string }) => void,
      onAnswerStart?: () => void,
      onAnswerDelta?: (t: string) => void,
    ) => {
      onProgress?.({ tool: "get_learnset", label: "Checking the learnset…" });
      onAnswerStart?.();
      onAnswerDelta?.("Here's your team.");
      return BUILDER_ANSWER;
    },
  );

  mockCreateCtx.mockReset();
  mockCreateCtx.mockImplementation(async (options: Record<string, unknown>) => {
    captured.options = options;
    return {
      db: {},
      requestId: "test-req",
      mode: options.mode,
      accountId: options.accountId,
      logger: { info() {}, warn() {}, error() {}, child: () => ({}) },
    };
  });
  captured.options = null;

  mockBuildBuilderHooks.mockClear();

  await resetRateLimit();
  await resetSessionStore();
});

afterEach(async () => {
  await resetRateLimit();
  await resetSessionStore();
});

// --- Helpers ---------------------------------------------------------------

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({
    id,
    email: `${id}@x.test`,
    createdAt: 0,
  });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

function draft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: "My Team", format: "scarlet-violet", members: [], ...overrides };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { session_id: "sid-1", message: "hi", draft: draft(), ...overrides };
}

function post(b: unknown): Promise<Response> {
  return route.POST(
    new Request("http://t/api/teams/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );
}

async function readBody(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) text += decoder.decode(value, { stream: true });
  }
  return text;
}

// --- Auth / body validation ordering ---------------------------------------

describe("POST /api/teams/assistant — auth + validation ordering", () => {
  it("returns 401 when getCurrentAccount resolves null, and never runs the model", async () => {
    guest();
    const res = await post(body());
    expect(res.status).toBe(401);
    expect(mockRunWithProvider).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed draft (bad format string)", async () => {
    const res = await post(body({ draft: draft({ format: "gen-99" }) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed draft (unknown extra key, strict schema)", async () => {
    const res = await post(body({ draft: { ...draft(), extra: "nope" } }));
    expect(res.status).toBe(400);
  });

  it("400 (body validation) fires even for a guest — it happens before auth", async () => {
    guest();
    const res = await post(body({ draft: draft({ format: "gen-99" }) }));
    expect(res.status).toBe(400);
  });
});

// --- Rate limiting (signed-in only) -----------------------------------------

describe("POST /api/teams/assistant — rate limiting (signed-in only, keyed acct:<id>)", () => {
  it("returns 413 when the message exceeds the input-length cap", async () => {
    signedIn(ACCT_A);
    const res = await post(
      body({ message: "x".repeat(TEAMS_ASSISTANT_CONFIG.maxInputLength + 1) }),
    );
    expect(res.status).toBe(413);
  });

  it("returns 429 after the request window is exhausted", async () => {
    signedIn(ACCT_A);
    for (let i = 0; i < TEAMS_ASSISTANT_CONFIG.maxRequestsPerWindow; i++) {
      await checkRateLimit(`acct:${ACCT_A}`, "x", TEAMS_ASSISTANT_CONFIG);
    }
    const res = await post(body());
    expect(res.status).toBe(429);
  });
});

// --- SSE happy path ----------------------------------------------------------

describe("POST /api/teams/assistant — SSE happy path", () => {
  it("streams tool_activity -> answer_start -> answer_delta -> answer, carries the team_patch, and emits no scope event", async () => {
    signedIn(ACCT_A);
    const res = await post(body({ session_id: "sse-1" }));
    expect(res.status).toBe(200);
    const text = await readBody(res);

    // Trailing "\n" disambiguates the terminal "event: answer" frame from the
    // "event: answer_start" / "event: answer_delta" frames it is a prefix of.
    const order = [
      "tool_activity",
      "answer_start",
      "answer_delta",
      "answer",
    ].map((name) => text.indexOf(`event: ${name}\n`));
    for (const idx of order) expect(idx).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]!);
    }

    expect(text).not.toContain("event: scope");

    const answerLine = text
      .split("\n")
      .find((line) => line.startsWith("data: ") && line.includes("team_patch"));
    expect(answerLine).toBeDefined();
    const payload = JSON.parse(answerLine!.slice("data: ".length)) as {
      answer: typeof BUILDER_ANSWER;
    };
    expect(payload.answer.team_patch).toEqual(BUILDER_ANSWER.team_patch);
  });

  it("derives the turn's mode from draft.format — no scope resolution", async () => {
    signedIn(ACCT_A);
    await readBody(
      await post(body({ session_id: "sse-2", draft: draft({ format: "gen-7" }) })),
    );
    expect((captured.options as Record<string, unknown>).mode).toBe("gen-7");
  });

  it("runs with the builder hooks built from the request draft's members", async () => {
    signedIn(ACCT_A);
    const members = [
      {
        species: "garchomp",
        ability: null,
        item: null,
        moves: [],
        nature: null,
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        tera_type: null,
        level: 50,
      },
    ];
    await readBody(
      await post(body({ session_id: "sse-3", draft: draft({ members }) })),
    );
    expect(mockBuildBuilderHooks).toHaveBeenCalledWith(members);
  });
});

// --- History isolation -------------------------------------------------------

describe("POST /api/teams/assistant — history isolation", () => {
  it("stores the plain typed message under teams-assistant:<sid>, never the bare session id", async () => {
    signedIn(ACCT_A);
    await readBody(
      await post(
        body({ session_id: "hist-1", message: "help me build a team" }),
      ),
    );

    expect(await getHistory("teams-assistant:hist-1")).toEqual([
      { role: "user", content: "help me build a team" },
      { role: "assistant", content: BUILDER_ANSWER.answer_markdown },
    ]);
    expect(await getHistory("hist-1")).toEqual([]);
  });
});
