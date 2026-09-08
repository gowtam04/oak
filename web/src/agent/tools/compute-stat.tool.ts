/**
 * T9 — `compute_stat` (tools.md T9).
 *
 * Wraps the pure formula (src/agent/formulas/compute-stat). Validates inputs via
 * the Zod schema; out-of-range values resolve to the documented structured
 * `{ error: "invalid_input", detail }` shape rather than throwing.
 *
 * Mode-aware (Champions, Gen 1/2). Standard mode (`ctx.mode !== "champions"`,
 * not gen-1/gen-2) keeps the mainline Gen-9 formula untouched. Champions mode
 * uses the @pkmn `champions` mod's Level-50 Stat-Point formula (see
 * {@link computeStatChampions}). Gen 1/2 mode uses the DV/Stat-Exp formula (see
 * {@link computeStatGen12}) — Gen 3/4 stay on the mainline formula unchanged.
 * The input JSON schema is identical across modes (keeps the tools cache tier
 * byte-identical) — in Champions the model passes the Stat Points value in the
 * `ev` field and `iv`/`level` are ignored (folded into the Champions
 * constants).
 */

import type { AgentContext, ToolDef } from "@/agent/types";
import {
  computeStatInputSchema,
  toJsonSchema,
  type ComputeStatOutput,
} from "@/agent/schemas";
import {
  computeStat,
  computeStatChampions,
  computeStatGen12,
} from "@/agent/formulas/compute-stat";

const description =
  "Compute a Pokémon's final stat using the exact in-game formula (handles the " +
  "per-step flooring). Provide the base stat (from get_pokemon/query_pokedex) " +
  "and the nature effect on this stat. In Champions, pass Stat Points in the " +
  "`ev` field; `iv` and `level` are ignored (IVs are 31, everything is Level " +
  "50). Returns the exact value and a step-by-step breakdown. Use this for any " +
  "stat-math question — do not compute stats yourself.";

export const computeStatTool: ToolDef = {
  name: "compute_stat",
  description,
  inputSchema: toJsonSchema(computeStatInputSchema),
  run(args, ctx: AgentContext): Promise<ComputeStatOutput> {
    const parsed = computeStatInputSchema.safeParse(args);
    if (!parsed.success) {
      return Promise.resolve({
        error: "invalid_input",
        detail: parsed.error.issues[0]?.message ?? "invalid compute_stat input",
      });
    }
    if (ctx.mode === "champions") {
      return Promise.resolve(computeStatChampions(parsed.data));
    }
    if (ctx.mode === "gen-1" || ctx.mode === "gen-2") {
      return Promise.resolve(computeStatGen12(parsed.data));
    }
    return Promise.resolve(computeStat(parsed.data));
  },
};
