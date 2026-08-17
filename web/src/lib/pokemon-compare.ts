/**
 * Client-side two-subject Pokémon compare (ADR-11).
 *
 * No compare endpoint — the caller fetches both `/api/entity` profiles
 * and this helper diffs them. Cross-scope pairs keep both format tags
 * (CMP-BR-2). Not a chat turn (CMP-BR-4).
 */

import type { Format } from "@/data/formats";

export type PokemonCompareAbilities = {
  slot1: string;
  slot2?: string | null;
  hidden?: string | null;
};

export type PokemonCompareStats = {
  hp: number;
  attack: number;
  defense: number;
  special_attack: number;
  special_defense: number;
  speed: number;
};

export type PokemonCompareMatchups = {
  defensive: {
    weak_to: string[];
    resists: string[];
    immune_to: string[];
  };
  offensive: {
    super_effective_against: string[];
    not_very_effective_against: string[];
    no_effect_against: string[];
  };
};

export type PokemonCompareProfile = {
  format: Format;
  name: string;
  types: string[];
  abilities: PokemonCompareAbilities;
  stats: PokemonCompareStats;
  movepool: string[];
  matchups: PokemonCompareMatchups;
  /** Originating set's computed speed (CMP-AC-3.2). */
  speed?: { value: number; level: number; nature: string };
};

export type StatDelta = { left: number; right: number; delta: number };

export type SetDiff = {
  onlyLeft: string[];
  onlyRight: string[];
  shared: string[];
};

const STAT_KEYS = [
  "hp",
  "attack",
  "defense",
  "special_attack",
  "special_defense",
  "speed",
] as const;

const DEFENSIVE_KEYS = ["weak_to", "resists", "immune_to"] as const;
const OFFENSIVE_KEYS = [
  "super_effective_against",
  "not_very_effective_against",
  "no_effect_against",
] as const;

/** Stated default when neither subject carries a set (CMP-AC-3.2). */
const DEFAULT_SPEED_LEVEL = 50;
const DEFAULT_SPEED_NATURE = "hardy";

function abilitySlugs(abilities: PokemonCompareAbilities): string[] {
  const slugs: string[] = [];
  if (abilities.slot1) slugs.push(abilities.slot1);
  if (abilities.slot2) slugs.push(abilities.slot2);
  if (abilities.hidden) slugs.push(abilities.hidden);
  return slugs;
}

function setDiff(left: readonly string[], right: readonly string[]): SetDiff {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const onlyLeft: string[] = [];
  const onlyRight: string[] = [];
  const shared: string[] = [];
  const seen = new Set<string>();

  for (const item of left) {
    if (seen.has(item)) continue;
    seen.add(item);
    if (rightSet.has(item)) shared.push(item);
    else onlyLeft.push(item);
  }
  for (const item of right) {
    if (seen.has(item) || leftSet.has(item)) continue;
    seen.add(item);
    onlyRight.push(item);
  }
  return { onlyLeft, onlyRight, shared };
}

function diffMatchupBlock<K extends string>(
  left: Record<K, string[]>,
  right: Record<K, string[]>,
  keys: readonly K[],
): Record<K, SetDiff> {
  const out = {} as Record<K, SetDiff>;
  for (const key of keys) {
    out[key] = setDiff(left[key] ?? [], right[key] ?? []);
  }
  return out;
}

function speedValue(
  profile: PokemonCompareProfile,
): { value: number; level: number; nature: string; fromSet: boolean } {
  if (profile.speed) {
    return {
      value: profile.speed.value,
      level: profile.speed.level,
      nature: profile.speed.nature,
      fromSet: true,
    };
  }
  return {
    value: profile.stats.speed,
    level: DEFAULT_SPEED_LEVEL,
    nature: DEFAULT_SPEED_NATURE,
    fromSet: false,
  };
}

export type PokemonCompareDiff = {
  left: { format: Format; name: string };
  right: { format: Format; name: string };
  stats: Record<(typeof STAT_KEYS)[number], StatDelta>;
  types: { left: string[]; right: string[] };
  abilities: SetDiff & { left: string[]; right: string[] };
  speed: {
    left: number;
    right: number;
    delta: number;
    level: number;
    nature: string;
    source: "default" | "set";
  };
  movepool: SetDiff;
  matchups: {
    defensive: Record<(typeof DEFENSIVE_KEYS)[number], SetDiff>;
    offensive: Record<(typeof OFFENSIVE_KEYS)[number], SetDiff>;
  };
};

/** Diff two portable profiles. Does not mutate inputs. */
export function diffPokemonProfiles(
  left: PokemonCompareProfile,
  right: PokemonCompareProfile,
): PokemonCompareDiff {
  const leftAbilities = abilitySlugs(left.abilities);
  const rightAbilities = abilitySlugs(right.abilities);

  const stats = {} as PokemonCompareDiff["stats"];
  for (const key of STAT_KEYS) {
    const l = left.stats[key];
    const r = right.stats[key];
    stats[key] = { left: l, right: r, delta: r - l };
  }

  const leftSpeed = speedValue(left);
  const rightSpeed = speedValue(right);
  const usedSet = leftSpeed.fromSet || rightSpeed.fromSet;
  const stated = leftSpeed.fromSet
    ? leftSpeed
    : rightSpeed.fromSet
      ? rightSpeed
      : leftSpeed;

  return {
    left: { format: left.format, name: left.name },
    right: { format: right.format, name: right.name },
    stats,
    types: { left: [...left.types], right: [...right.types] },
    abilities: {
      left: leftAbilities,
      right: rightAbilities,
      ...setDiff(leftAbilities, rightAbilities),
    },
    speed: {
      left: leftSpeed.value,
      right: rightSpeed.value,
      delta: rightSpeed.value - leftSpeed.value,
      level: stated.level,
      nature: stated.nature,
      source: usedSet ? "set" : "default",
    },
    movepool: setDiff(left.movepool, right.movepool),
    matchups: {
      defensive: diffMatchupBlock(
        left.matchups.defensive,
        right.matchups.defensive,
        DEFENSIVE_KEYS,
      ),
      offensive: diffMatchupBlock(
        left.matchups.offensive,
        right.matchups.offensive,
        OFFENSIVE_KEYS,
      ),
    },
  };
}
