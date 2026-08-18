/**
 * Route tests for `POST /api/voice/tool` (voice-mode plan §5).
 *
 * Auth is mocked; the REAL tool layer + agent context run against the "tools"
 * fixture DB (installed as the `@/data/db` singleton before the tool layer is
 * first imported — the resolve-index gotcha). Pins the route's guards (401,
 * tool allowlist incl. the submit_answer rejection, malformed-args in-domain
 * miss) and a real dispatch happy path + mode gating.
 *
 * Needs Docker (Testcontainers Postgres) via the node project's globalSetup.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

const traces = vi.hoisted(() => ({
  appendVoiceTrace: vi.fn(),
}));
vi.mock("@/server/voice/tool-trace-store", () => traces);

import { _resetStoreForTests as resetRateLimit } from "@/server/rate-limit";
import type { VoiceToolResponseBody } from "@/lib/voice/voice-types";
import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../../test/support/pg";

let route: typeof import("./route");
let fix: PgFixture;
let loadError: unknown = null;

const ACCT = "acct-voice-tool";

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "tools" });
    await installAsSingleton(fix);
    route = await import("./route");
  } catch (e) {
    loadError = e;
  }
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  cu.getCurrentAccount.mockReset();
  await resetRateLimit();
});
afterEach(() => resetRateLimit());

function ensureLoaded(): void {
  if (loadError) throw new Error(`Route/tool layer not loadable: ${String(loadError)}`);
}
function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({ id, email: `${id}@x.test`, createdAt: 0, lastUsedScope: null });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

function post(b: unknown): Promise<Response> {
  return route.POST(
    new Request("http://t/api/voice/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );
}

const body = (o: Record<string, unknown> = {}) => ({
  session_id: "sid-1",
  format: "scarlet-violet",
  name: "get_move",
  arguments: "{}",
  ...o,
});

describe("POST /api/voice/tool", () => {
  it("returns 401 for a guest", async () => {
    ensureLoaded();
    guest();
    const res = await post(body());
    expect(res.status).toBe(401);
  });

  it("returns 400 unknown_tool for a name not in the voice tool set", async () => {
    ensureLoaded();
    signedIn(ACCT);
    const res = await post(body({ name: "no_such_tool" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("unknown_tool");
  });

  it("rejects submit_answer (never drivable from the socket)", async () => {
    ensureLoaded();
    signedIn(ACCT);
    const res = await post(body({ name: "submit_answer", arguments: "{}" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("unknown_tool");
  });

  it("returns a 200 in-domain error for malformed arguments JSON", async () => {
    ensureLoaded();
    signedIn(ACCT);
    const res = await post(body({ name: "get_move", arguments: "{not json" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as VoiceToolResponseBody;
    expect((json.output as { error: string }).error).toBe("invalid_input");
  });

  it("dispatches a real tool call against the fixture DB (get_move)", async () => {
    ensureLoaded();
    signedIn(ACCT);
    const res = await post(
      body({ name: "get_move", arguments: JSON.stringify({ name: "flamethrower" }) }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as VoiceToolResponseBody;
    const out = json.output as { found?: boolean; display_name?: string };
    expect(out.found).toBe(true);
    expect(out.display_name).toBe("Flamethrower");
  });

  it("honors mode gating — get_usage_stats in scarlet-violet is not available", async () => {
    ensureLoaded();
    signedIn(ACCT);
    const res = await post(
      body({
        name: "get_usage_stats",
        format: "scarlet-violet",
        arguments: JSON.stringify({ name: "garchomp", format: "singles" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as VoiceToolResponseBody;
    expect((json.output as { error?: string }).error).toBe("not_available_in_standard");
  });
});

describe("POST /api/voice/tool — appendVoiceTrace fail-soft (ADR-8)", () => {
  beforeEach(() => {
    traces.appendVoiceTrace.mockReset();
    traces.appendVoiceTrace.mockImplementation(() => undefined);
  });

  it("buffers name/input/output after a successful dispatch (ADR-8)", async () => {
    ensureLoaded();
    signedIn(ACCT);
    const res = await post(
      body({ name: "get_move", arguments: JSON.stringify({ name: "flamethrower" }) }),
    );
    expect(res.status).toBe(200);
    expect(traces.appendVoiceTrace).toHaveBeenCalledTimes(1);
    expect(traces.appendVoiceTrace).toHaveBeenCalledWith(
      "sid-1",
      expect.objectContaining({
        name: "get_move",
        input: { name: "flamethrower" },
        output: expect.objectContaining({
          found: true,
          display_name: "Flamethrower",
        }),
      }),
    );
  });

  it("does not fail the tool response when appendVoiceTrace throws (ADR-8)", async () => {
    ensureLoaded();
    signedIn(ACCT);
    traces.appendVoiceTrace.mockImplementation(() => {
      throw new Error("buffer down");
    });
    const res = await post(
      body({ name: "get_move", arguments: JSON.stringify({ name: "flamethrower" }) }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as VoiceToolResponseBody;
    expect((json.output as { found?: boolean; display_name?: string }).found).toBe(
      true,
    );
    expect(
      (json.output as { display_name?: string }).display_name,
    ).toBe("Flamethrower");
  });
});
