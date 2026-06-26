/**
 * T9 — `compute_stat` (tools.md T9).
 *
 * Wraps the pure formula (src/agent/formulas/compute-stat). Validates inputs via
 * the Zod schema; out-of-range values resolve to the documented structured
 * `{ error: "invalid_input", detail }` shape rather than throwing.
 *
 * Mode-aware (Champions). Standard mode (`ctx.mode !== "champions"`) keeps the
 * mainline Gen-9 formula untouched. Champions mode uses the @pkmn `champions`
 * mod's Level-50 Stat-Point formula (see {@link computeStatChampions}). The
 * input JSON schema is identical in both modes (keeps the tools cache tier
 * byte-identical) — the model passes the Stat Points value in the `ev` field and
 * `iv`/`level` are ignored (folded into the Champions constants).
 */

import type { AgentContext, ToolDef } from "@/agent/types";
import {
  computeStatInputSchema,
  toJsonSchema,
  type ComputeStatInput,
  type ComputeStatOutput,
} from "@/agent/schemas";
import { computeStat } from "@/agent/formulas/compute-stat";

const description =
  "Compute a Pokémon's final stat at a given level using the exact in-game " +
  "formula (handles the per-step flooring). Provide the base stat (from " +
  "get_pokemon/query_pokedex), IV, EV, level, and nature effect on this stat. " +
  "Returns the exact value and a step-by-step breakdown. Use this for any " +
  "stat-math question — do not compute stats yourself.";

// Champions per-stat Stat-Point cap (32). Stat Points arrive in the `ev` input.
const CHAMPIONS_SP_MAX = 32;

const CHAMPIONS_NATURE_MOD: Record<
  ComputeStatInput["nature_effect"],
  number
> = { boosted: 1.1, neutral: 1.0, hindered: 0.9 };

const CHAMPIONS_NATURE_LABEL: Record<
  ComputeStatInput["nature_effect"],
  string
> = { boosted: "1.1", neutral: "1.0", hindered: "0.9" };

/**
 * Champions Level-50 Stat-Point stat (mirrors the @pkmn `champions` mod
 * `statModify`): with IV fixed at 31 and Level 50 folded into the constants,
 *   HP     = base + SP + 75
 *   non-HP = floor((base + SP + 20) × natureMod)   (natureMod ∈ {1.1, 1.0, 0.9})
 * where SP is the Stat Points value the model passes in `ev`, clamped to 0..32.
 * `iv` and `level` from the input are deliberately ignored. The breakdown echoes
 * the Stat-Points / IV=31 / Lv50 framing so the answer card is unambiguous.
 */
function computeStatChampions(input: ComputeStatInput): ComputeStatOutput {
  const { base_stat, is_hp, ev, nature_effect } = input;

  if (!Number.isInteger(base_stat) || base_stat < 1) {
    return { error: "invalid_input", detail: "base_stat must be an integer >= 1" };
  }

  // Stat Points ride in on the `ev` field; clamp to the Champions 0..32 cap.
  const sp = Math.min(CHAMPIONS_SP_MAX, Math.max(0, ev));
  const inputs_echo: Record<string, unknown> = {
    base_stat,
    stat_points: sp,
    iv: 31,
    level: 50,
    nature_effect,
    is_hp,
    model: "champions",
  };

  if (is_hp) {
    // Shedinja is always 1 HP in every game (base HP 1) — preserve that edge.
    if (base_stat === 1) {
      return {
        value: 1,
        breakdown: "Shedinja: HP is always 1 (special case)",
        inputs_echo,
      };
    }
    const value = base_stat + sp + 75;
    return {
      value,
      breakdown: `Champions Lv50 (IV 31, Stat Points): ${base_stat} + ${sp} + 75 = ${value}`,
      inputs_echo,
    };
  }

  const mod = CHAMPIONS_NATURE_MOD[nature_effect];
  const value = Math.floor((base_stat + sp + 20) * mod);
  return {
    value,
    breakdown: `Champions Lv50 (IV 31, Stat Points): floor((${base_stat} + ${sp} + 20) * ${CHAMPIONS_NATURE_LABEL[nature_effect]}) = ${value}`,
    inputs_echo,
  };
}

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
    return Promise.resolve(computeStat(parsed.data));
  },
};
