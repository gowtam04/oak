/**
 * analyze-core — the PURE team-analysis math (no DB, no I/O).
 *
 * Given each member's resolved species ref + resolved moves and the format's type
 * chart (a map of single-type profiles), it derives:
 *   - per-member final stats (via the shared `computeMemberStats`), BST, typing;
 *   - a defensive matrix: one row per battle type of the format's chart, listing
 *     which members are weak to / resist / immune to that attacking type (from
 *     the combined multiplier of each member's types, `combineDefensive`);
 *   - offensive coverage: for every DAMAGING move, the types its type is
 *     super-effective against (skipping status moves), unioned across the team;
 *   - speed tiers (desc).
 *
 * Format-awareness comes for free from the type chart: only the type slugs the
 * format actually has appear as rows (gen-1's chart has 15 types, so dark/steel/
 * fairy simply aren't present; Champions has the full 18). Nothing here reads the
 * database — the service (`analyze-team.ts`) does the batched reads and hands the
 * resolved data in, so this stays deterministic and unit-testable.
 */

import {
  combineDefensive,
  defMultiplier,
  type DefensiveProfile,
} from "@/agent/formulas/type-chart";
import { TYPE_NAMES } from "@/agent/schemas";
import type { Format } from "@/data/formats";
import type { SpriteRef } from "@/data/repos/pokedex-repo";
import type { TeamMember } from "@/data/teams/team-schema";

import {
  computeMemberStats,
  MEMBER_STAT_KEYS,
  type MemberStat,
} from "./member-stats";
import {
  TYPE_ONLY_CAVEAT,
  type AnalyzedMember,
  type AnalyzedStats,
  type TeamAnalysisOk,
} from "./team-analysis";

/** A single type's stored profile as analyze-core consumes it. */
export interface TypeProfileLite {
  defensive: DefensiveProfile;
  offensive: {
    super_effective_against: string[];
    not_very_effective_against: string[];
    no_effect_against: string[];
  };
}

/** One of a member's moves, resolved to its type + damage class (for offense). */
export interface AnalyzedMove {
  slug: string;
  type: string;
  damageClass: "physical" | "special" | "status" | null;
}

/** One team member resolved for analysis (`ref === null` ⇒ unresolved species). */
export interface AnalysisMemberSource {
  /** The member's competitive inputs (level/nature/evs) for stat computation. */
  input: Pick<TeamMember, "evs" | "nature" | "level">;
  /** Species slug (`""` when the slot had no species). */
  slug: string;
  /** Resolved species ref (types + base stats + display name); null on a miss. */
  ref: SpriteRef | null;
  /** Resolved moves (moves the index couldn't hydrate arrive with `type: ""`). */
  moves: AnalyzedMove[];
}

/** SpriteRef base-stat keys, for the BST sum. */
const BASE_STAT_KEYS = [
  "hp",
  "attack",
  "defense",
  "special_attack",
  "special_defense",
  "speed",
] as const;

/** Fold a computed MemberStat[] into the wire `stats` object. */
function statsObject(rows: MemberStat[]): AnalyzedStats {
  const out: AnalyzedStats = {
    hp: null,
    atk: null,
    def: null,
    spa: null,
    spd: null,
    spe: null,
  };
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/**
 * Run the full team analysis over already-resolved members + the format's type
 * chart. Pure and deterministic (stable ordering everywhere). Returns the `ok`
 * envelope; the service wraps DB faults into `unavailable` around this.
 */
export function analyzeTeam(
  members: AnalysisMemberSource[],
  typeProfiles: Map<string, TypeProfileLite>,
  format: Format,
): TeamAnalysisOk {
  // The format's battle types = the type slugs the chart actually has, in
  // canonical TYPE_NAMES order. Gen-1's chart omits dark/steel/fairy, so those
  // never appear in any defense/offense row.
  const battleTypes = TYPE_NAMES.filter((t) => typeProfiles.has(t));

  const analyzedMembers: AnalyzedMember[] = [];
  const speedTiers: { member: string; speed: number }[] = [];
  // Per-member combined defensive profile, keyed for the matrix pass.
  const memberDefense: { slug: string; profile: DefensiveProfile }[] = [];
  // Per-member damaging moves (slug + attacking type), for the coverage pass.
  const memberOffense: {
    slug: string;
    moves: { slug: string; type: string }[];
  }[] = [];

  for (const m of members) {
    if (!m.ref) {
      analyzedMembers.push({ slug: m.slug, found: false });
      continue;
    }
    const ref = m.ref;
    const bst = BASE_STAT_KEYS.reduce((sum, k) => sum + ref.base_stats[k], 0);
    const stats = statsObject(
      computeMemberStats(
        { evs: m.input.evs, nature: m.input.nature, level: m.input.level },
        ref.base_stats,
        format,
      ),
    );

    analyzedMembers.push({
      slug: m.slug,
      found: true,
      display_name: ref.display_name,
      types: ref.types,
      bst,
      stats,
      level: m.input.level,
      nature: m.input.nature,
    });

    if (stats.spe !== null) {
      speedTiers.push({ member: m.slug, speed: stats.spe });
    }

    // Combined defensive profile from the member's types' single-type profiles.
    const defs: DefensiveProfile[] = [];
    for (const t of ref.types) {
      const profile = typeProfiles.get(t);
      if (profile) defs.push(profile.defensive);
    }
    memberDefense.push({ slug: m.slug, profile: combineDefensive(defs) });

    // Damaging moves only (skip status moves and moves the index couldn't type).
    const damaging = m.moves.filter(
      (mv) =>
        (mv.damageClass === "physical" || mv.damageClass === "special") &&
        mv.type.length > 0,
    );
    memberOffense.push({
      slug: m.slug,
      moves: damaging.map((mv) => ({ slug: mv.slug, type: mv.type })),
    });
  }

  // Defensive matrix: one row per battle type; classify each member by the
  // combined multiplier (0 → immune, >1 → weak, <1 → resists, 1 → neutral).
  const defense = battleTypes.map((attacking) => {
    const weak: string[] = [];
    const resists: string[] = [];
    const immune: string[] = [];
    for (const md of memberDefense) {
      const mult = defMultiplier(md.profile, attacking);
      if (mult === 0) immune.push(md.slug);
      else if (mult > 1) weak.push(md.slug);
      else if (mult < 1) resists.push(md.slug);
    }
    return { type: attacking, weak, resists, immune };
  });

  // Offensive coverage: each damaging move's type is super-effective against a
  // set of types; union the sources per covered (battle) type.
  const coveredBy = new Map<string, { member: string; move: string }[]>();
  for (const mo of memberOffense) {
    for (const mv of mo.moves) {
      const profile = typeProfiles.get(mv.type);
      if (!profile) continue;
      for (const target of profile.offensive.super_effective_against) {
        if (!typeProfiles.has(target)) continue; // only real battle types
        const list = coveredBy.get(target) ?? [];
        list.push({ member: mo.slug, move: mv.slug });
        coveredBy.set(target, list);
      }
    }
  }
  const covered = battleTypes
    .filter((t) => coveredBy.has(t))
    .map((t) => ({ type: t, by: coveredBy.get(t)! }));
  const uncovered = battleTypes.filter((t) => !coveredBy.has(t));

  // Speed tiers, fastest first; slug tie-break keeps the order deterministic.
  speedTiers.sort(
    (a, b) => b.speed - a.speed || a.member.localeCompare(b.member),
  );

  return {
    status: "ok",
    format,
    members: analyzedMembers,
    defense,
    offense: { covered, uncovered },
    speed_tiers: speedTiers,
    notes: [TYPE_ONLY_CAVEAT],
  };
}

// Re-export so callers building sources can reference the stat-key order.
export { MEMBER_STAT_KEYS };
