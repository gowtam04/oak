/**
 * Lightweight sample damage lines for meta threats vs the draft.
 * Pure: callers supply resolved stats, power, and type effectiveness.
 */

import { estimateDamage } from "@/agent/formulas/estimate-damage";
import type { ThreatCalcWire } from "./team-analysis";

export interface ThreatCalcInput {
  attackerSlug: string;
  defenderSlug: string;
  moveSlug: string;
  /** Attacker level (default 50). */
  level?: number;
  power: number;
  attackStat: number;
  defenseStat: number;
  defenderMaxHp: number;
  stab?: boolean;
  typeEffectiveness?: number;
}

/**
 * One sample calc → % of defender HP. Returns null when inputs are unusable.
 */
export function sampleThreatCalc(
  input: ThreatCalcInput,
): ThreatCalcWire | null {
  if (
    input.power <= 0 ||
    input.attackStat <= 0 ||
    input.defenseStat <= 0 ||
    input.defenderMaxHp <= 0
  ) {
    return null;
  }
  const result = estimateDamage({
    level: input.level ?? 50,
    power: input.power,
    attack_stat: input.attackStat,
    defense_stat: input.defenseStat,
    stab: input.stab ?? true,
    type_effectiveness: input.typeEffectiveness ?? 1,
  });
  if ("error" in result) return null;
  const min_pct = Math.round((result.min_damage / input.defenderMaxHp) * 1000) / 10;
  const max_pct = Math.round((result.max_damage / input.defenderMaxHp) * 1000) / 10;
  return {
    attacker: input.attackerSlug,
    defender: input.defenderSlug,
    move: input.moveSlug,
    min_pct,
    max_pct,
  };
}
