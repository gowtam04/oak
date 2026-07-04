/**
 * Unit tests for the voice-session server module (voice-mode plan §5).
 *
 * The voice-prompt module (`@/agent/prompts/voice`, workstream P) may not exist
 * yet, so it is MOCKED here — this suite pins voice-session's OWN behavior
 * (tool-def flattening, token mint request shape, bootstrap composition + the
 * history digest), independent of the real prompt body. `server-only` is
 * neutralized for the node runner (voice-session imports the tool layer, which
 * pulls server-only repos).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Stand-in for the real prompt (workstream P). Echoes its inputs so the bootstrap
// tests can assert the persona + injected digest flow through unchanged.
vi.mock("@/agent/prompts/voice", () => ({
  buildVoiceInstructions: (opts: {
    format: string;
    historyDigest?: string;
  }): string =>
    `PERSONA for ${opts.format}.` +
    (opts.historyDigest ? `\n\nEARLIER:\n${opts.historyDigest}` : ""),
}));

import {
  buildSessionBootstrap,
  mintEphemeralToken,
  voiceToolDefs,
} from "@/server/voice/voice-session";
import {
  VOICE_IDLE_TIMEOUT_MS,
  VOICE_MAX_SESSION_MS,
  VOICE_MODEL,
  VOICE_NAME,
  VOICE_REASONING_EFFORT,
  VOICE_TOKEN_TTL_SECONDS,
} from "@/server/voice/voice-config";
import type { ChatMessage } from "@/agent/types";
import { tools } from "@/agent/tools";
import { VOICE_EXCLUDED_TOOLS } from "@/agent/tools/voice-gating";

/** Main tool-barrel count minus the voice exclusion set — not a literal. */
const EXPECTED_VOICE_TOOL_COUNT = tools.filter(
  (t) => !VOICE_EXCLUDED_TOOLS.has(t.name),
).length;

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- voiceToolDefs -----------------------------------------------------------

describe("voiceToolDefs", () => {
  it("exposes Oak's tool layer minus VOICE_EXCLUDED_TOOLS, in the flattened shape", () => {
    const defs = voiceToolDefs();
    expect(defs).toHaveLength(EXPECTED_VOICE_TOOL_COUNT);
    expect(defs.some((d) => d.name === "submit_answer")).toBe(false);
    expect(defs.some((d) => d.name === "run_sql")).toBe(false);
    // A few known tools are present.
    for (const name of ["get_move", "get_pokemon", "resolve_entity"]) {
      expect(defs.some((d) => d.name === name)).toBe(true);
    }
    // Flattened Responses shape: { type:"function", name, description, parameters }.
    for (const d of defs) {
      expect(d.type).toBe("function");
      expect(typeof d.name).toBe("string");
      expect(typeof d.description).toBe("string");
      expect(d.parameters).toBeTruthy();
    }
  });
});

// --- mintEphemeralToken ------------------------------------------------------

describe("mintEphemeralToken", () => {
  it("POSTs to the xAI client_secrets endpoint with auth + TTL and returns the token", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ value: "ephemeral-xyz", expires_at: 1_700_000_600 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await mintEphemeralToken();
    expect(result).toEqual({ value: "ephemeral-xyz", expires_at: 1_700_000_600 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/realtime\/client_secrets$/);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer .+/);
    const sentBody = JSON.parse(init.body as string) as {
      expires_after: { seconds: number };
    };
    expect(sentBody.expires_after.seconds).toBe(VOICE_TOKEN_TTL_SECONDS);
  });

  it("throws on a non-OK response (→ route maps to 502)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(mintEphemeralToken()).rejects.toThrow(/HTTP 500/);
  });

  it("throws on an unexpected body shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ nope: true }), { status: 200 })),
    );
    await expect(mintEphemeralToken()).rejects.toThrow(/unexpected shape/);
  });
});

// --- buildSessionBootstrap ---------------------------------------------------

describe("buildSessionBootstrap", () => {
  it("carries the constants, 16 tools, and persona instructions", () => {
    const boot = buildSessionBootstrap({ format: "champions", history: [] });
    expect(boot.model).toBe(VOICE_MODEL);
    expect(boot.voice).toBe(VOICE_NAME);
    expect(boot.reasoning_effort).toBe(VOICE_REASONING_EFFORT);
    expect(boot.idle_timeout_ms).toBe(VOICE_IDLE_TIMEOUT_MS);
    expect(boot.max_session_ms).toBe(VOICE_MAX_SESSION_MS);
    expect(boot.tools).toHaveLength(EXPECTED_VOICE_TOOL_COUNT);
    expect(boot.instructions).toContain("PERSONA for champions");
    // No history ⇒ no injected digest section.
    expect(boot.instructions).not.toContain("EARLIER:");
  });

  it("injects a digest of prior history (recent turns, oldest evicted first)", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Tell me about Garchomp" },
      { role: "assistant", content: "Garchomp is a Dragon/Ground pseudo-legend." },
    ];
    const boot = buildSessionBootstrap({ format: "scarlet-violet", history });
    expect(boot.instructions).toContain("EARLIER:");
    expect(boot.instructions).toContain("User: Tell me about Garchomp");
    expect(boot.instructions).toContain("Oak: Garchomp is a Dragon/Ground");
  });

  it("truncates a long turn and keeps the digest under the total cap", () => {
    // 30 turns of ~500 chars each far exceeds both the 20-turn and ~4000-char
    // caps; the digest must stay bounded (recent turns, each truncated).
    const history: ChatMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `turn ${i} ` + "x".repeat(500),
    }));
    const boot = buildSessionBootstrap({ format: "scarlet-violet", history });
    const digest = boot.instructions.split("EARLIER:\n")[1] ?? "";
    // ~4000-char cap plus a little slack for the final un-split line.
    expect(digest.length).toBeLessThanOrEqual(4600);
    // The very first (oldest) turns are dropped.
    expect(digest).not.toContain("turn 0 ");
    // A recent turn survives.
    expect(digest).toContain("turn 29 ");
  });
});
