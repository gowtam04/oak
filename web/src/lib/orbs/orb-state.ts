/**
 * Tool → orb category. Lock-step with iOS `ThinkingTraceCopy.orbState`
 * and Android `orbStateForActivity`. Settled does not change the mapped
 * state — the view just pauses.
 */

import type { OrbState } from "./types";

const SOLVING_TOOLS = new Set([
  "compute_stat",
  "estimate_damage",
  "run_sql",
  "get_usage_stats",
  "get_meta_usage",
]);

const SEARCHING_TOOLS = new Set([
  "resolve_entity",
  "query_pokedex",
  "get_pokemon",
  "get_move",
  "get_ability",
  "get_item",
  "get_type_matchups",
  "get_evolution_chain",
  "get_encounters",
  "get_learnset",
  "get_team",
  "list_teams",
  "save_team",
  "search_wiki",
]);

const HIDDEN_TOOLS = new Set([
  "reasoning",
  "submit_answer",
  "submit_builder_answer",
]);

export function orbStateForActivity(args: {
  reconnecting: boolean;
  latestTool: string | null;
  /** Tokens are streaming — Oak is writing the answer. */
  writing?: boolean;
}): OrbState {
  if (args.reconnecting) return "connecting";
  if (args.writing) return "composing";
  const tool = args.latestTool;
  if (!tool || HIDDEN_TOOLS.has(tool)) return "breathing";
  if (SOLVING_TOOLS.has(tool)) return "solving";
  if (SEARCHING_TOOLS.has(tool)) return "searching";
  return "breathing";
}
