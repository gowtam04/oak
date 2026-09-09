/**
 * Tool-layer barrel (Champions-first, ADR-2).
 *
 * Establishes the contract every tool author targets and the surface the agent
 * runtime consumes:
 *
 *   - `tools: ToolDef[]`  — the 17 remaining tool definitions in architecture
 *     order (new cache prefix), fed to providers as name + description +
 *     generated `inputSchema`.
 *   - `dispatch(name, args, ctx)` — name -> `run(args, ctx)` lookup used by the
 *     loop in src/agent/runtime.ts.
 *   - `submitAnswerSchema` — re-export of the OakAnswer Zod schema (the
 *     single source of truth in schemas.ts) for the runtime's payload validation.
 *
 * Remaining tools (order, new cache prefix): resolve_entity, query_pokedex,
 * get_pokemon, get_move, get_ability, get_type_matchups, get_evolution_chain,
 * get_item, compute_stat, estimate_damage, submit_answer, get_team, save_team,
 * get_usage_stats, list_teams, get_learnset, lookup_box.
 *
 * Removed (ADR-2): T14 get_encounters, T18 run_sql, T19 search_wiki, T21
 * get_meta_usage. Dispatch of a hallucinated old name is `{ error: "unknown_tool" }`.
 *
 * Each `ToolDef` must set:
 *   - `name`        -> the EXACT remaining-tool slug (the model depends on it),
 *   - `description` -> the tools.md "Description (for the model)",
 *   - `inputSchema` -> toJsonSchema(<that tool's input Zod schema from schemas.ts>),
 *   - `run(args, ctx)` -> parse `args` with the tool's input Zod schema, do the
 *     read/compute, and return the documented output shape. NEVER throw for an
 *     in-domain failure: return the documented structured error/miss shape
 *     ({ found:false, suggestions }, { error:"upstream_unavailable" },
 *     { error:"index_unavailable" }, { unresolved:[…] }, { error:"invalid_input", detail }).
 *     Only genuine transport/programming faults may throw.
 */

import type { ToolDef, ToolDispatch } from "@/agent/types";
import { oakAnswerSchema } from "@/agent/schemas";

import { resolveEntityTool } from "./resolve-entity";
import { queryPokedexTool } from "./query-pokedex";
import { getPokemonTool } from "./get-pokemon";
import { getMoveTool } from "./get-move";
import { getAbilityTool } from "./get-ability";
import { getTypeMatchupsTool } from "./get-type-matchups";
import { getEvolutionChainTool } from "./get-evolution-chain";
import { getItemTool } from "./get-item";
import { computeStatTool } from "./compute-stat.tool";
import { estimateDamageTool } from "./estimate-damage.tool";
import { submitAnswerTool } from "./submit-answer";
import { getTeamTool } from "./get-team.tool";
import { saveTeamTool } from "./save-team.tool";
import { getUsageStatsTool } from "./get-usage-stats.tool";
import { listTeamsTool } from "./list-teams.tool";
import { getLearnsetTool } from "./get-learnset";
import { lookupBoxTool } from "./lookup-box";

/**
 * The 17 remaining Champions tools, in architecture order (new cache prefix).
 * T14/T18/T19/T21 are gone (ADR-2). `get_usage_stats` (T15) stays — live
 * Champions usage. `lookup_box` is last.
 */
export const tools: ToolDef[] = [
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
  submitAnswerTool,
  getTeamTool,
  saveTeamTool,
  getUsageStatsTool,
  listTeamsTool,
  getLearnsetTool,
  lookupBoxTool,
];

/** name -> ToolDef lookup, built once at module load. */
const toolsByName: Map<string, ToolDef> = new Map(
  tools.map((tool) => [tool.name, tool]),
);

/**
 * Dispatch a tool call by name. The runtime maps each `tool_use` block to this.
 *
 * An unknown tool name (including removed T14/T18/T19/T21) is returned as an
 * in-domain structured error so the loop can continue; it does not throw.
 */
export const dispatch: ToolDispatch = (name, args, ctx) => {
  const tool = toolsByName.get(name);
  if (!tool) {
    return Promise.resolve({ error: "unknown_tool", detail: name });
  }
  return tool.run(args, ctx);
};

/**
 * The OakAnswer Zod schema, re-exported under the design.md name for the
 * runtime's submit_answer payload validation. NOT a redefinition — single source
 * of truth remains src/agent/schemas.ts.
 */
export const submitAnswerSchema = oakAnswerSchema;
