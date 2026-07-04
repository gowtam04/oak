/**
 * T7 — `get_evolution_chain` (tools.md T7).
 *
 * Full evolution line + per-stage conditions, via the read-through reference
 * cache (DS-4, resource kind "evolution"). Pass-through of miss / upstream
 * shapes; never throws. Champions mode only: a miss falls back to the mainline
 * Gen 9 (scarlet-violet) chain — returned marked `source_format` — because
 * evolution is a whole-GAME fact the Champions roster doesn't gate (the same
 * STANDARD_FORMAT fallback get_encounters uses, GS-D4).
 */

import type { ToolDef } from "@/agent/types";
import {
  getEvolutionChainInputSchema,
  toJsonSchema,
  type GetEvolutionChainOutput,
} from "@/agent/schemas";
import { getReference } from "@/data/repos/reference-cache";
import { formatForMode, CHAMPIONS_FORMAT, STANDARD_FORMAT } from "@/data/formats";

const description =
  "Get a Pokémon's full evolution line and the condition(s) for each stage " +
  "(level, item, friendship, trade, time of day, etc.) as provided by PokeAPI. " +
  "Use for evolution questions. In Champions scope, a species absent from the " +
  "Champions roster returns the mainline Scarlet/Violet chain, marked " +
  "`source_format: \"scarlet-violet\"`.";

export const getEvolutionChainTool: ToolDef = {
  name: "get_evolution_chain",
  description,
  inputSchema: toJsonSchema(getEvolutionChainInputSchema),
  async run(args, ctx): Promise<GetEvolutionChainOutput> {
    const parsed = getEvolutionChainInputSchema.safeParse(args);
    if (!parsed.success) {
      return { found: false, suggestions: [] };
    }
    const format = formatForMode(ctx.mode);
    const ref = (await getReference(
      "evolution",
      parsed.data.species,
      format,
      ctx.db,
    )) as GetEvolutionChainOutput;
    if (format === CHAMPIONS_FORMAT && "found" in ref && ref.found === false) {
      const std = (await getReference(
        "evolution",
        parsed.data.species,
        STANDARD_FORMAT,
        ctx.db,
      )) as GetEvolutionChainOutput;
      if ("found" in std && std.found === true) {
        return { ...std, source_format: "scarlet-violet" };
      }
      return { ...ref, exists_in_standard: false };
    }
    return ref;
  },
};
