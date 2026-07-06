/**
 * T9 — `compute_stat` pure formula (design.md § Formula functions, D5).
 *
 * Computes a Pokémon's final stat at a given level using the EXACT in-game
 * formulas with per-step flooring. No I/O; deterministic; idempotent.
 *
 *   non-HP: floor((floor((2*Base + IV + floor(EV/4)) * Level/100) + 5) * NatureMod)
 *   HP:     floor((2*Base + IV + floor(EV/4)) * Level/100) + Level + 10
 *
 * where NatureMod ∈ { boosted: 1.1, neutral: 1.0, hindered: 0.9 } (ignored for HP).
 * Shedinja (the only Pokémon with base HP 1) always has 1 HP — handled as an edge case.
 *
 * The tool wrapper (compute-stat.tool.ts) is responsible for applying the Zod
 * input defaults / SDK schema; this function accepts the already-typed params
 * and defends against out-of-range values by returning `invalid_input`.
 */

export interface ComputeStatParams {
  base_stat: number;
  is_hp?: boolean;
  iv?: number;
  ev?: number;
  level?: number;
  nature_effect?: "boosted" | "neutral" | "hindered";
}

export interface ComputeStatSuccess {
  value: number;
  breakdown: string;
  inputs_echo: Record<string, unknown>;
}

export interface ComputeStatError {
  error: "invalid_input";
  detail: string;
}

export type ComputeStatResult = ComputeStatSuccess | ComputeStatError;

const NATURE_MOD: Record<
  NonNullable<ComputeStatParams["nature_effect"]>,
  number
> = {
  boosted: 1.1,
  neutral: 1.0,
  hindered: 0.9,
};

const NATURE_MOD_LABEL: Record<
  NonNullable<ComputeStatParams["nature_effect"]>,
  string
> = {
  boosted: "1.1",
  neutral: "1.0",
  hindered: "0.9",
};

function isInteger(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

/**
 * Compute a final stat with exact per-step flooring.
 *
 * @returns the value + worked breakdown + an echo of the resolved inputs, or
 *          `{ error: "invalid_input", detail }` when an argument is out of range.
 */
export function computeStat(p: ComputeStatParams): ComputeStatResult {
  const is_hp = p.is_hp ?? false;
  const iv = p.iv ?? 31;
  const ev = p.ev ?? 0;
  const level = p.level ?? 50;
  const nature_effect = p.nature_effect ?? "neutral";
  const base_stat = p.base_stat;

  // --- validation (returns the structured invalid_input shape, not a throw) ---
  if (!isInteger(base_stat) || base_stat < 1) {
    return {
      error: "invalid_input",
      detail: "base_stat must be an integer >= 1",
    };
  }
  if (!isInteger(iv) || iv < 0 || iv > 31) {
    return { error: "invalid_input", detail: "iv must be 0..31" };
  }
  if (!isInteger(ev) || ev < 0 || ev > 252) {
    return { error: "invalid_input", detail: "ev must be 0..252" };
  }
  if (!isInteger(level) || level < 1 || level > 100) {
    return { error: "invalid_input", detail: "level must be 1..100" };
  }
  if (
    nature_effect !== "boosted" &&
    nature_effect !== "neutral" &&
    nature_effect !== "hindered"
  ) {
    return {
      error: "invalid_input",
      detail: "nature_effect must be one of: boosted, neutral, hindered",
    };
  }

  const inputs_echo: Record<string, unknown> = {
    base_stat,
    iv,
    ev,
    level,
    nature_effect,
    is_hp,
  };

  // Shared inner term: floor((2*Base + IV + floor(EV/4)) * Level / 100)
  const evTerm = Math.floor(ev / 4);
  const core = 2 * base_stat + iv + evTerm;
  const inner = Math.floor((core * level) / 100);

  if (is_hp) {
    // Shedinja edge case: the only base-HP-1 Pokémon, always 1 HP.
    if (base_stat === 1) {
      return {
        value: 1,
        breakdown: "Shedinja: HP is always 1 (special case)",
        inputs_echo,
      };
    }

    const value = inner + level + 10;
    const breakdown =
      `floor((2*${base_stat} + ${iv} + floor(${ev}/4)) * ${level} / 100) = ${inner}; ` +
      `${inner} + ${level} + 10 = ${value}`;
    return { value, breakdown, inputs_echo };
  }

  // non-HP
  const beforeNature = inner + 5;
  const mod = NATURE_MOD[nature_effect];
  const scaled = beforeNature * mod;
  const value = Math.floor(scaled);
  const breakdown =
    `floor((2*${base_stat} + ${iv} + floor(${ev}/4)) * ${level} / 100) = ${inner}; ` +
    `(${inner} + 5) * ${NATURE_MOD_LABEL[nature_effect]} = ${scaled} -> floor ${value}`;
  return { value, breakdown, inputs_echo };
}

// Champions per-stat Stat-Point cap (32). Stat Points arrive in the `ev` field.
const CHAMPIONS_SP_MAX = 32;

/**
 * Champions Level-50 Stat-Point stat (mirrors the @pkmn `champions` mod
 * `statModify`): with IV fixed at 31 and Level 50 folded into the constants,
 *   HP     = base + SP + 75
 *   non-HP = floor((base + SP + 20) × natureMod)   (natureMod ∈ {1.1, 1.0, 0.9})
 * where SP is the Stat Points value the caller passes in `ev`, clamped to 0..32.
 * `iv` and `level` are deliberately ignored. The breakdown echoes the Stat-Points
 * / IV=31 / Lv50 framing so the answer card is unambiguous.
 *
 * The single source of truth for Champions stat math: the `compute_stat` tool
 * (Champions mode) and the team artifact's client-side stat readout both call it.
 */
export function computeStatChampions(p: ComputeStatParams): ComputeStatResult {
  const is_hp = p.is_hp ?? false;
  const ev = p.ev ?? 0;
  const nature_effect = p.nature_effect ?? "neutral";
  const base_stat = p.base_stat;

  if (!isInteger(base_stat) || base_stat < 1) {
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

  const mod = NATURE_MOD[nature_effect];
  const value = Math.floor((base_stat + sp + 20) * mod);
  return {
    value,
    breakdown: `Champions Lv50 (IV 31, Stat Points): floor((${base_stat} + ${sp} + 20) * ${NATURE_MOD_LABEL[nature_effect]}) = ${value}`,
    inputs_echo,
  };
}

/**
 * Gen 1/2 stat formula (National Dex scope feature): Determinant Values
 * (0–15, the Gen 1/2 predecessor to IVs) and Stat Experience (the predecessor
 * to EVs) — no natures, which were introduced in Gen 3. One function covers
 * both generations: @pkmn's Gen 1 dex already encodes the unified Special stat
 * as identical `spa`/`spd` base values, so `base_stat` works unchanged for
 * either gen's Special/Special Attack/Special Defense.
 *
 *   DV      = clamp(round(IV * 15/31), 0, 15) (maps a modern 0–31 IV onto the
 *             0–15 DV scale; 31 -> 15, 0 -> 0)
 *   StatExp = floor(min(EV, 252) / 4)         (the EV input doubles as a
 *             Stat Experience proxy)
 *   core    = 2*(Base + DV) + StatExp
 *   inner   = floor(core * Level / 100)
 *   HP:     inner + Level + 10
 *   non-HP: inner + 5                         (no nature multiplier)
 *
 * Shedinja doesn't exist before Gen 3, but the base-HP-1 edge case is kept for
 * defensive symmetry with {@link computeStat}.
 */
export function computeStatGen12(p: ComputeStatParams): ComputeStatResult {
  const is_hp = p.is_hp ?? false;
  const iv = p.iv ?? 31;
  const ev = p.ev ?? 0;
  const level = p.level ?? 50;
  const base_stat = p.base_stat;

  if (!isInteger(base_stat) || base_stat < 1) {
    return {
      error: "invalid_input",
      detail: "base_stat must be an integer >= 1",
    };
  }
  if (!isInteger(iv) || iv < 0 || iv > 31) {
    return { error: "invalid_input", detail: "iv must be 0..31" };
  }
  if (!isInteger(ev) || ev < 0 || ev > 252) {
    return { error: "invalid_input", detail: "ev must be 0..252" };
  }
  if (!isInteger(level) || level < 1 || level > 100) {
    return { error: "invalid_input", detail: "level must be 1..100" };
  }

  const dv = Math.min(15, Math.max(0, Math.round((iv * 15) / 31)));
  const statExp = Math.floor(Math.min(ev, 252) / 4);
  const inputs_echo: Record<string, unknown> = {
    base_stat,
    iv,
    ev,
    level,
    is_hp,
    dv,
    stat_exp: statExp,
    model: "gen-1-2",
  };

  const core = 2 * (base_stat + dv) + statExp;
  const inner = Math.floor((core * level) / 100);

  if (is_hp) {
    // Shedinja edge case (post-Gen-3 species, kept for defensive symmetry).
    if (base_stat === 1) {
      return {
        value: 1,
        breakdown: "Shedinja: HP is always 1 (special case)",
        inputs_echo,
      };
    }

    const value = inner + level + 10;
    const breakdown =
      `Gen 1/2: DV ${dv} (from IV ${iv}), Stat-Exp term floor(min(${ev},252)/4) = ${statExp}; ` +
      `floor((2*(${base_stat}+${dv}) + ${statExp}) * ${level} / 100) = ${inner}; ` +
      `${inner} + ${level} + 10 = ${value}`;
    return { value, breakdown, inputs_echo };
  }

  // non-HP — no nature (Gen 1/2 predates natures)
  const value = inner + 5;
  const breakdown =
    `Gen 1/2: DV ${dv} (from IV ${iv}), Stat-Exp term floor(min(${ev},252)/4) = ${statExp}, no Nature; ` +
    `floor((2*(${base_stat}+${dv}) + ${statExp}) * ${level} / 100) = ${inner}; ` +
    `${inner} + 5 = ${value}`;
  return { value, breakdown, inputs_echo };
}
