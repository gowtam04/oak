/**
 * analyze-core — the PURE team-analysis math (no DB, no I/O).
 *
 * Given each member's resolved species ref + resolved moves and the format's type
 * chart (a map of single-type profiles), it derives:
 *   - per-member final stats (via the shared `computeMemberStats`), BST, typing;
 *   - a defensive matrix (type chart + curated ability/item modifiers);
 *   - offensive coverage (super-effective union of damaging moves);
 *   - speed tiers (desc);
 *   - role/utility inventory + physical/special balance.
 *
 * Threat scoring / calcs are attached by the service layer (need meta DB reads).
 *
 * Format-awareness comes for free from the type chart: only the type slugs the
 * format actually has appear as rows. Nothing here reads the database.
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

import { applyDefensiveModifiers } from "./ability-matchups";
import {
  computeMemberStats,
  MEMBER_STAT_KEYS,
  type MemberStat,
} from "./member-stats";
import { buildRoleInventory } from "./role-inventory";
import {
  ANALYSIS_RESIDUAL_CAVEAT,
  type AnalyzedMember,
  type AnalyzedStats,
  type TeamAnalysisOk,
  type ThreatRowWire,
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
  /** Held ability slug (null = unset). */
  ability?: string | null;
  /** Held item slug (null = unset). */
  item?: string | null;
}

/** Optional meta threat rows attached after pure analysis. */
export interface AnalyzeTeamExtras {
  threats?: ThreatRowWire[];
  meta_attribution?: string | null;
  extra_notes?: string[];
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
  extras: AnalyzeTeamExtras = {},
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
  const defenseNotes: string[] = [];
  const roleInputs: {
    slug: string;
    moves: string[];
    ability: string | null;
    damageClasses: ("physical" | "special" | "status" | null)[];
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

    // Combined defensive profile from the member's types' single-type profiles,
    // then curated ability/item modifiers.
    const defs: DefensiveProfile[] = [];
    for (const t of ref.types) {
      const profile = typeProfiles.get(t);
      if (profile) defs.push(profile.defensive);
    }
    let profile = combineDefensive(defs);
    const mod = applyDefensiveModifiers(profile, {
      ability: m.ability ?? null,
      item: m.item ?? null,
    });
    profile = mod.profile;
    for (const n of mod.notes) {
      defenseNotes.push(`${ref.display_name}: ${n}`);
    }
    memberDefense.push({ slug: m.slug, profile });

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

    roleInputs.push({
      slug: m.slug,
      moves: m.moves.map((mv) => mv.slug),
      ability: m.ability ?? null,
      damageClasses: m.moves.map((mv) => mv.damageClass),
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

  const inventory = buildRoleInventory(roleInputs, format);

  const notes = [ANALYSIS_RESIDUAL_CAVEAT, ...(extras.extra_notes ?? [])];

  return {
    status: "ok",
    format,
    members: analyzedMembers,
    defense,
    offense: { covered, uncovered },
    speed_tiers: speedTiers,
    notes,
    roles: inventory.roles,
    roles_present: inventory.roles_present,
    roles_missing: inventory.roles_missing,
    physical_special: inventory.physical_special,
    defense_notes: defenseNotes,
    threats: extras.threats ?? [],
    meta_attribution: extras.meta_attribution ?? null,
  };
}

// Re-export so callers building sources can reference the stat-key order.
export { MEMBER_STAT_KEYS };
