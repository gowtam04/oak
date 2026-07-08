/**
 * member-stats — pure final-stat readout for a team member (lifted from the
 * artifact's `team-stats.ts` so BOTH the client team artifact AND the server
 * team-analysis service (src/server/teams/analyze-team.ts) compute final stats
 * from ONE implementation).
 *
 * Maps a member's EVs/nature + the species' base stats to the six computed final
 * stats, picking the format's formula:
 *   - Champions      → `computeStatChampions` (Stat Points; IV 31, Lv50 baked in)
 *   - Gen 1 / Gen 2  → `computeStatGen12` (DVs + Stat Experience, no natures)
 *   - otherwise      → `computeStat` (standard Gen-3+; IV assumed 31, member level)
 *
 * The Gen 1/2 branch is a display-behaviour fix: before this lift the modern
 * Gen-3+ formula was applied to every non-Champions format, so a Gen 1/2 member's
 * final stats were computed with natures/IVs that don't exist in those games.
 *
 * Pure: imports only the pure formulas + nature table (no I/O, no server code), so
 * it's safe in client components, the server service, and isolation tests alike.
 */

import {
  computeStat,
  computeStatChampions,
  computeStatGen12,
  type ComputeStatParams,
} from "@/agent/formulas/compute-stat";
import { natureEffectFor, type NatureStat } from "@/agent/formulas/natures";
import type { TeamMember, StatSpread } from "@/data/teams/team-schema";
import type { SpriteRef } from "@/data/repos/pokedex-repo";

/** The six stat keys in display order (HP first), matching `StatSpread`. */
export const MEMBER_STAT_KEYS = [
  "hp",
  "atk",
  "def",
  "spa",
  "spd",
  "spe",
] as const;

export type MemberStatKey = (typeof MEMBER_STAT_KEYS)[number];

/** Short display labels for each stat key. */
export const STAT_LABELS: Record<MemberStatKey, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};

/** EV-key → base-stat-key (the repo's base_stats use long names). */
const BASE_STAT_KEY: Record<MemberStatKey, keyof SpriteRef["base_stats"]> = {
  hp: "hp",
  atk: "attack",
  def: "defense",
  spa: "special_attack",
  spd: "special_defense",
  spe: "speed",
};

const EMPTY_EVS: StatSpread = {
  hp: 0,
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
};

export interface MemberStat {
  key: MemberStatKey;
  /** Computed final stat, or null if it couldn't be computed. */
  value: number | null;
  /** EV (standard) or Stat-Point (Champions) investment in this stat. */
  ev: number;
  /** Nature's effect on this stat (drives +/- coloring). */
  nature: "boosted" | "neutral" | "hindered";
}

/**
 * Compute the six final stats for `member` given its species `baseStats`. Returns
 * a row per stat (value, EV/SP, nature effect). EVs are clamped to the standard
 * 0..252 range before the formula (the Champions path further clamps to its SP
 * cap internally). The formula is chosen from `format`: Champions Stat-Points,
 * Gen 1/2 DVs+Stat-Experience, or the modern Gen-3+ EV formula.
 */
export function computeMemberStats(
  member: Pick<TeamMember, "evs" | "nature" | "level">,
  baseStats: SpriteRef["base_stats"],
  format: string,
): MemberStat[] {
  const isChampions = format === "champions";
  const isGen12 = format === "gen-1" || format === "gen-2";
  const evs = member.evs ?? EMPTY_EVS;

  return MEMBER_STAT_KEYS.map((key) => {
    const ev = Math.min(252, Math.max(0, evs[key] ?? 0));
    const nature = natureEffectFor(member.nature, key as NatureStat | "hp");
    const params: ComputeStatParams = {
      base_stat: baseStats[BASE_STAT_KEY[key]],
      is_hp: key === "hp",
      iv: 31,
      ev,
      level: member.level,
      nature_effect: nature,
    };
    const result = isChampions
      ? computeStatChampions(params)
      : isGen12
        ? computeStatGen12(params)
        : computeStat(params);
    return {
      key,
      value: "value" in result ? result.value : null,
      ev,
      nature,
    };
  });
}
