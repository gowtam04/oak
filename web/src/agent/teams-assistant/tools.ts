/**
 * Team-builder assistant — scoped tool set + dispatch.
 *
 * A READ-ONLY subset of the main agent's tools plus the builder's own terminal
 * `submit_builder_answer`. Deliberately excluded:
 *   - `get_team` / `list_teams` / `save_team` — the active draft rides in every
 *     request body and edits land in the on-screen draft; the assistant never
 *     reads or writes saved teams.
 *   - `submit_answer` — replaced by `submit_builder_answer`.
 *   - Removed other-game tools (T14/T18/T19/T21) — not in the main barrel.
 *
 * SECURITY-RELEVANT: `builderDispatch` is built over ONLY this subset. The main
 * `dispatch` (tools/index.ts) closes over all tools, so reusing it would
 * execute a hallucinated `save_team` call even though the model was never
 * offered that tool. Unknown names get the documented in-domain error shape.
 */

import type { ToolDef, ToolDispatch } from "@/agent/types";
import { resolveEntityTool } from "@/agent/tools/resolve-entity";
import { queryPokedexTool } from "@/agent/tools/query-pokedex";
import { getPokemonTool } from "@/agent/tools/get-pokemon";
import { getMoveTool } from "@/agent/tools/get-move";
import { getAbilityTool } from "@/agent/tools/get-ability";
import { getTypeMatchupsTool } from "@/agent/tools/get-type-matchups";
import { getEvolutionChainTool } from "@/agent/tools/get-evolution-chain";
import { getItemTool } from "@/agent/tools/get-item";
import { computeStatTool } from "@/agent/tools/compute-stat.tool";
import { estimateDamageTool } from "@/agent/tools/estimate-damage.tool";
import { getLearnsetTool } from "@/agent/tools/get-learnset";
import { getUsageStatsTool } from "@/agent/tools/get-usage-stats.tool";
import { submitBuilderAnswerTool } from "@/agent/tools/submit-builder-answer";

/**
 * The builder's tool list, in the main barrel's relative order (stable order ⇒
 * stable prompt-cache prefix). `get_usage_stats` is live Champions usage.
 */
export const builderTools: ToolDef[] = [
  resolveEntityTool,
  queryPokedexTool,
  getPokemonTool,
  getMoveTool,
  getAbilityTool,
  getTypeMatchupsTool,
  getEvolutionChainTool,
  getItemTool,
  computeStatTool,
  estimateDamageTool,
  getUsageStatsTool,
  getLearnsetTool,
  submitBuilderAnswerTool,
];

const byName = new Map(builderTools.map((tool) => [tool.name, tool]));

/** Dispatch over ONLY the builder subset (see module header). */
export const builderDispatch: ToolDispatch = (name, args, ctx) => {
  const tool = byName.get(name);
  if (!tool) {
    return Promise.resolve({ error: "unknown_tool", detail: name });
  }
  return tool.run(args, ctx);
};
