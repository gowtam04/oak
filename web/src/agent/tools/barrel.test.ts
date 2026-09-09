/**
 * P3 / ADR-2 — the Champions-first tool barrel is 17 names, not the old 21.
 *
 * Remaining order (new cache prefix): resolve_entity … lookup_box.
 * Removed: T14 get_encounters, T18 run_sql, T19 search_wiki, T21 get_meta_usage.
 * Dispatch of a hallucinated old name is `{ error: "unknown_tool" }` (ADR-2).
 *
 * Refs: ADR-2, CF-INT-BR-1, CF-CHAT-US-2.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentContext } from "@/agent/types";
import { dispatch, tools } from "@/agent/tools";

/** Architecture remaining-tools order (component-design AgentToolsAndPrompt). */
const CHAMPIONS_TOOL_NAMES = [
  "resolve_entity",
  "query_pokedex",
  "get_pokemon",
  "get_move",
  "get_ability",
  "get_type_matchups",
  "get_evolution_chain",
  "get_item",
  "compute_stat",
  "estimate_damage",
  "submit_answer",
  "get_team",
  "save_team",
  "get_usage_stats",
  "list_teams",
  "get_learnset",
  "lookup_box",
] as const;

const REMOVED_TOOL_NAMES = [
  "get_encounters",
  "run_sql",
  "search_wiki",
  "get_meta_usage",
] as const;

const ctx = { requestId: "barrel" } as unknown as AgentContext;

describe("tools barrel — Champions-first 17 (ADR-2)", () => {
  it("exports exactly the 17 remaining names in architecture order", () => {
    expect(tools.map((t) => t.name)).toEqual([...CHAMPIONS_TOOL_NAMES]);
    expect(tools).toHaveLength(17);
  });

  it("omits T14 get_encounters, T18 run_sql, T19 search_wiki, T21 get_meta_usage", () => {
    const names = tools.map((t) => t.name);
    for (const removed of REMOVED_TOOL_NAMES) {
      expect(names).not.toContain(removed);
    }
  });

  it("keeps get_learnset then lookup_box as the last two names", () => {
    expect(tools[15]?.name).toBe("get_learnset");
    expect(tools[16]?.name).toBe("lookup_box");
    expect(tools.at(-1)?.name).toBe("lookup_box");
  });
});

describe("dispatch of removed tool names (ADR-2)", () => {
  it.each([...REMOVED_TOOL_NAMES])(
    'returns { error: "unknown_tool" } for "%s"',
    async (name) => {
      await expect(dispatch(name, {}, ctx)).resolves.toMatchObject({
        error: "unknown_tool",
      });
    },
  );

  it('returns { error: "unknown_tool" } for a name that was never a tool', async () => {
    await expect(
      dispatch("definitely_not_a_tool", {}, ctx),
    ).resolves.toMatchObject({ error: "unknown_tool" });
  });
});
