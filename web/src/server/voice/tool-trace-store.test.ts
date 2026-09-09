/**
 * Unit tests for the in-process voice tool-trace buffer (ADR-8, data-model
 * VoiceTrace). Keyed by conversation / voice `session_id`, appended from
 * `POST /api/voice/tool`, read by `runVoiceCompile`. TTL 30 min; fail-soft
 * empty so compile can still run on speech alone.
 *
 * Importing `@/server/voice/tool-trace-store` is the intended red until P4
 * lands the module.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  VOICE_TRACE_TTL_MS,
  _resetStoreForTests,
  appendVoiceTrace,
  getVoiceTrace,
} from "@/server/voice/tool-trace-store";

const CALL_A = {
  name: "get_move",
  input: { name: "flamethrower" },
  output: { found: true, display_name: "Flamethrower" },
};

const CALL_B = {
  name: "get_pokemon",
  input: { name: "garchomp" },
  output: { found: true, display_name: "Garchomp" },
};

beforeEach(() => {
  _resetStoreForTests();
});

afterEach(() => {
  _resetStoreForTests();
});

describe("tool-trace-store — append / read by session_id (ADR-8)", () => {
  it("appends and reads calls keyed by conversation / session_id", () => {
    appendVoiceTrace("sid-a", CALL_A, 1_000);

    const trace = getVoiceTrace("sid-a", 1_000);
    expect(trace.conversationId).toBe("sid-a");
    expect(trace.calls).toEqual([CALL_A]);
    expect(trace.updatedAt).toBe(1_000);
  });

  it("accumulates multiple appends on the same session_id", () => {
    appendVoiceTrace("sid-a", CALL_A, 1_000);
    appendVoiceTrace("sid-a", CALL_B, 2_000);

    expect(getVoiceTrace("sid-a", 2_000).calls).toEqual([CALL_A, CALL_B]);
    expect(getVoiceTrace("sid-a", 2_000).updatedAt).toBe(2_000);
  });

  it("isolates traces by session_id / conversation id", () => {
    appendVoiceTrace("sid-a", CALL_A, 1_000);
    appendVoiceTrace("sid-b", CALL_B, 1_000);

    expect(getVoiceTrace("sid-a", 1_000).calls).toEqual([CALL_A]);
    expect(getVoiceTrace("sid-b", 1_000).calls).toEqual([CALL_B]);
  });
});

describe("tool-trace-store — TTL 30 min (ADR-8)", () => {
  it("keeps a trace inside the 30-minute TTL", () => {
    expect(VOICE_TRACE_TTL_MS).toBe(30 * 60 * 1000);
    appendVoiceTrace("sid-ttl", CALL_A, 0);
    const justBefore = VOICE_TRACE_TTL_MS - 1;
    expect(getVoiceTrace("sid-ttl", justBefore).calls).toEqual([CALL_A]);
  });

  it("expires a trace after 30 minutes (fail-soft empty)", () => {
    appendVoiceTrace("sid-ttl", CALL_A, 0);
    expect(getVoiceTrace("sid-ttl", VOICE_TRACE_TTL_MS + 1).calls).toEqual([]);
  });
});

describe("tool-trace-store — fail-soft empty (ADR-8)", () => {
  it("getVoiceTrace on a missing session_id never throws and returns empty calls", () => {
    expect(() => getVoiceTrace("missing")).not.toThrow();
    expect(getVoiceTrace("missing").calls).toEqual([]);
  });
});
