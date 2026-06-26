/**
 * T9 — `compute_stat` (tools.md T9).
 *
 * Wraps the pure formula (src/agent/formulas/compute-stat). Validates inputs via
 * the Zod schema; out-of-range values resolve to the documented structured
 * `{ error: "invalid_input", detail }` shape rather than throwing.
 */

import type { ToolDef } from "@/agent/types";
import {
  computeStatInputSchema,
  toJsonSchema,
  type ComputeStatOutput,
} from "@/agent/schemas";
import { computeStat } from "@/agent/formulas/compute-stat";

const description =
  "Compute a Pokémon's final stat at a given level using the exact in-game " +
  "formula (handles the per-step flooring). Provide the base stat (from " +
  "get_pokemon/query_pokedex), IV, EV, level, and nature effect on this stat. " +
  "Returns the exact value and a step-by-step breakdown. Use this for any " +
  "stat-math question — do not compute stats yourself.";

export const computeStatTool: ToolDef = {
  name: "compute_stat",
  description,
  inputSchema: toJsonSchema(computeStatInputSchema),
  run(args): Promise<ComputeStatOutput> {
    const parsed = computeStatInputSchema.safeParse(args);
    if (!parsed.success) {
      return Promise.resolve({
        error: "invalid_input",
        detail: parsed.error.issues[0]?.message ?? "invalid compute_stat input",
      });
    }
    return Promise.resolve(computeStat(parsed.data));
  },
};
