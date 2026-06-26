/**
 * G4 INTEGRATION ORACLE — "does Fake Out work on Farigiraf?" driven through the
 * REAL agent runtime + the REAL tool layer + a fixture SQLite DB.
 *
 * This is the test the design's Phase-5 test-focus calls for and that the unit
 * `runtime.test.ts` deliberately cannot cover (it mocks `@/agent/tools`):
 *
 *   design.md Phase 5: "conditional Farigiraf answer carries an inferences[]
 *   entry (G4)" ... exercised against "real tools/fixture DB".
 *
 * It records a 4-step tool transcript (get_move -> get_pokemon -> get_ability ->
 * submit_answer) and replays it through `runPokebotWith(client, ...)`, where the
 * tool calls are dispatched by the genuine tool layer reading the seeded fixture.
 * We assert BOTH:
 *   (1) the real tools returned the grounding FACTS (Fake Out priority 3;
 *       Farigiraf has armor-tail; Armor Tail negates positive-priority moves) —
 *       by inspecting the tool_result blocks fed back to the model; and
 *   (2) the produced PokebotAnswer is schema-valid, status "answered", and
 *       carries an inferences[] entry about Armor Tail blocking priority (BR-3).
 *
 * Wiring mirrors the *.oracle.test.ts harness: neutralize `server-only`, point
 * POKEBOT_DB_PATH at a fresh temp file, and seed BEFORE the first dynamic import
 * of @/data/db so the memoized singleton binds to the fixture.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { pokebotAnswerSchema } from "@/agent/schemas";
import type { AgentContext, ChatMessage } from "@/agent/types";
import type { PokebotAnswer } from "@/agent/schemas";

import { loadToolSurface, seedToolsFixture } from "./fixtures/tools-fixture";

// src/data/db.ts does `import "server-only"`; its Node (non-RSC) variant throws.
// Neutralize it so the real repos/tools load under the vitest node environment.
vi.mock("server-only", () => ({}));

// --- Reference-cache rows G4 needs (the fixture only warms the type chart). ---
// A fresh reference_cache hit is returned verbatim as the tool output, so these
// payloads ARE the MoveDetail / AbilityDetail shapes (schemas.ts T4/T5), drawn
// from the tools.md samples.
const FAKE_OUT_MOVE = {
  found: true,
  display_name: "Fake Out",
  type: "normal",
  damage_class: "physical",
  power: 40,
  accuracy: 100,
  pp: 10,
  priority: 3,
  target: "selected-pokemon",
  effect_short:
    "Hits first (priority +3) and makes the target flinch; only works on the user's first turn out.",
  effect_full:
    "Inflicts regular damage. Has +3 priority. The target flinches. Only succeeds on the first turn after the user switches in.",
};
const ARMOR_TAIL_ABILITY = {
  found: true,
  display_name: "Armor Tail",
  effect_short:
    "Prevents the holder from being hit by moves with increased priority.",
  effect_full:
    "The Pokémon and its allies cannot be targeted by opposing moves that have positive priority (e.g. Fake Out, Quick Attack, Extreme Speed).",
};

let runPokebotWith: (
  client: unknown,
  message: string,
  history: ChatMessage[],
  ctx: AgentContext,
  onProgress?: (e: { tool: string; label: string }) => void,
) => Promise<PokebotAnswer>;
let ctx: AgentContext;
let loadError: unknown = null;
let fixtureDir: string;

beforeAll(async () => {
  try {
    // runPokebotWith takes the client directly, so no real Anthropic client is
    // built — but importing the env-validated modules wants a key present.
    process.env.ANTHROPIC_API_KEY ??= "test-dummy-key";

    fixtureDir = mkdtempSync(path.join(tmpdir(), "pokebot-g4-"));
    process.env.POKEBOT_DB_PATH = path.join(fixtureDir, "fixture.sqlite");
    delete (globalThis as { __pokebotDb?: unknown }).__pokebotDb;

    const dbMod = (await import("@/data/db")) as {
      sqlite: import("better-sqlite3").Database;
    };
    seedToolsFixture(dbMod.sqlite);

    // Warm the two reference rows G4 reasons over so get_move / get_ability are
    // cache HITS (no network), exactly like the type-chart rows in the fixture.
    const insertRef = dbMod.sqlite.prepare(
      `INSERT INTO reference_cache (resource_key, resource_kind, payload, endpoint_url, fetched_at)
       VALUES (@resource_key, @resource_kind, @payload, @endpoint_url, @fetched_at)`,
    );
    const now = Date.now();
    insertRef.run({
      resource_key: "move/fake-out",
      resource_kind: "move",
      payload: JSON.stringify(FAKE_OUT_MOVE),
      endpoint_url: "https://pokeapi.co/api/v2/move/fake-out",
      fetched_at: now,
    });
    insertRef.run({
      resource_key: "ability/armor-tail",
      resource_kind: "ability",
      payload: JSON.stringify(ARMOR_TAIL_ABILITY),
      endpoint_url: "https://pokeapi.co/api/v2/ability/armor-tail",
      fetched_at: now,
    });

    // Real tool surface (dispatch + ctx) bound to the seeded singleton DB...
    const surface = await loadToolSurface();
    ctx = surface.ctx;
    // ...and the real runtime (NOT mocking @/agent/tools — that is the point).
    const rt = (await import("@/agent/runtime")) as {
      runPokebotWith: typeof runPokebotWith;
    };
    runPokebotWith = rt.runPokebotWith;
  } catch (e) {
    loadError = e;
  }
}, 30_000);

afterAll(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

function ensureLoaded(): void {
  if (loadError) {
    throw new Error(
      `Runtime/tool layer not loadable (Phase 4/5 incomplete): ${String(loadError)}`,
    );
  }
}

// --- Recorded-transcript client (mirrors runtime.test.ts scriptedClient) ------

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

function toolUse(name: string, input: unknown, id: string): Block {
  return { type: "tool_use", id, name, input };
}

function message(content: Block[]): unknown {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content,
    stop_reason: "tool_use",
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
function scriptedClient(responses: unknown[]) {
  const snapshots: any[] = [];
  const create = vi.fn((params: any): Promise<any> => {
    snapshots.push(structuredClone(params));
    const next = responses.shift();
    if (next === undefined)
      return Promise.reject(new Error("transcript exhausted"));
    return Promise.resolve(next);
  });
  return { client: { messages: { create } } as any, create, snapshots };
}

/** Concatenate the tool_result string content of the LAST user message. */
function lastToolResultText(params: any): string {
  const msgs = params.messages;
  const lastUser = msgs[msgs.length - 1];
  return (lastUser.content as { content?: unknown }[])
    .map((c) => (typeof c.content === "string" ? c.content : JSON.stringify(c)))
    .join(" ");
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// The conditional, inference-bearing G4 answer the model submits last.
const G4_ANSWER: PokebotAnswer = {
  status: "answered",
  answer_markdown:
    "It depends on Farigiraf's ability. Fake Out is a +3 priority move, and **Armor Tail negates moves with increased priority** — so if Farigiraf has Armor Tail, Fake Out fails. With Cud Chew or Sap Sipper, Fake Out works normally (and flinches).",
  reasoning_markdown:
    "Fake Out has priority +3 (get_move). Farigiraf can have Cud Chew, Armor Tail, or Sap Sipper (get_pokemon). Armor Tail blocks opposing positive-priority moves (get_ability). Therefore the outcome is conditional on which ability is active.",
  citations: [
    { source: "move/fake-out", detail: "priority: 3" },
    {
      source: "ability/armor-tail",
      detail:
        "Prevents the holder from being hit by moves with increased priority.",
    },
    {
      source: "pokemon/farigiraf",
      detail: "abilities: cud-chew, armor-tail (slot 2), sap-sipper (hidden)",
    },
  ],
  inferences: [
    {
      claim:
        "If Farigiraf has Armor Tail, Fake Out fails because Armor Tail negates increased-priority moves.",
      confidence: "high",
      note: "Deduced by combining Fake Out's +3 priority with Armor Tail's effect text; hinges on which ability Farigiraf actually has.",
    },
  ],
  generation_basis: { generation: "gen-9", fallback: false },
  subjects: [
    {
      name: "Farigiraf",
      dex_number: 981,
      sprite_url: "https://img.example/sprite/981.png",
      types: ["normal", "psychic"],
      is_fallback: false,
    },
  ],
};

describe("G4 integration: Fake Out vs Farigiraf through the real runtime + tools", () => {
  it("dispatches the real tools and returns a schema-valid, conditional answer with an inference", async () => {
    ensureLoaded();

    const { client, snapshots, create } = scriptedClient([
      message([toolUse("get_move", { name: "fake-out" }, "m1")]),
      message([toolUse("get_pokemon", { name: "farigiraf" }, "m2")]),
      message([toolUse("get_ability", { name: "armor-tail" }, "m3")]),
      message([toolUse("submit_answer", G4_ANSWER, "m4")]),
    ]);

    const progress: string[] = [];
    const result = await runPokebotWith(
      client,
      "does Fake Out work on Farigiraf?",
      [],
      ctx,
      (e) => progress.push(e.tool),
    );

    // (1) The REAL tools ran and returned the grounding facts (proven by the
    //     tool_result blocks fed back to the model on each subsequent turn).
    expect(create).toHaveBeenCalledTimes(4);
    expect(lastToolResultText(snapshots[1])).toMatch(/"priority":\s*3/); // get_move
    expect(lastToolResultText(snapshots[2])).toMatch(/armor-tail/); // get_pokemon abilities
    expect(lastToolResultText(snapshots[3])).toMatch(
      /increased priority|positive priority/i,
    ); // get_ability effect text
    expect(progress).toEqual([
      "get_move",
      "get_pokemon",
      "get_ability",
      "submit_answer",
    ]);

    // (2) The produced PokebotAnswer is valid and carries the conditional inference.
    expect(pokebotAnswerSchema.safeParse(result).success).toBe(true);
    expect(result.status).toBe("answered");
    expect(result.generation_basis).toEqual({
      generation: "gen-9",
      fallback: false,
    });
    expect(result.inferences.length).toBeGreaterThanOrEqual(1);
    const inf = result.inferences[0]!;
    expect(inf.claim).toMatch(/armor.?tail/i);
    expect(inf.claim).toMatch(/priorit/i);
    expect(inf.confidence).toBe("high");
    // The conditional answer must cite the priority value and the ability text (BR-4).
    expect(result.citations.map((c) => c.source)).toEqual(
      expect.arrayContaining(["move/fake-out", "ability/armor-tail"]),
    );
  });
});
