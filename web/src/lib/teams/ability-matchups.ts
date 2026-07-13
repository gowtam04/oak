/**
 * Curated ability/item → defensive matchup modifiers for team analysis.
 *
 * Effect text in the warehouse is free-form and not machine-readable; this
 * small deterministic map is the ground truth for static analysis. Expand over
 * time — residual caveats stay on TeamAnalysisOk.notes.
 */

import type { DefensiveProfile } from "@/agent/formulas/type-chart";
import { TYPE_NAMES } from "@/agent/schemas";
import { defMultiplier } from "@/agent/formulas/type-chart";

export interface DefensiveModifierResult {
  profile: DefensiveProfile;
  /** Human-readable notes (e.g. "Levitate: Ground immune"). */
  notes: string[];
}

/** Ability slug → attacking types granted full immunity (0×). */
const ABILITY_IMMUNITIES: Readonly<Record<string, readonly string[]>> = {
  levitate: ["ground"],
  "flash-fire": ["fire"],
  "water-absorb": ["water"],
  "dry-skin": ["water"],
  "storm-drain": ["water"],
  "volt-absorb": ["electric"],
  "lightning-rod": ["electric"],
  "motor-drive": ["electric"],
  "sap-sipper": ["grass"],
  "earth-eater": ["ground"],
  "well-baked-body": ["fire"],
};

/** Ability slug → attacking types whose effectiveness is halved (Thick Fat). */
const ABILITY_HALVE: Readonly<Record<string, readonly string[]>> = {
  "thick-fat": ["fire", "ice"],
};

/** Item slug → attacking types granted immunity (static; Air Balloon note). */
const ITEM_IMMUNITIES: Readonly<Record<string, readonly string[]>> = {
  "air-balloon": ["ground"],
};

function reclassify(multipliers: Map<string, number>): DefensiveProfile {
  const weak_to: string[] = [];
  const resists: string[] = [];
  const immune_to: string[] = [];
  for (const t of TYPE_NAMES) {
    const m = multipliers.get(t) ?? 1;
    if (m === 0) immune_to.push(t);
    else if (m > 1) weak_to.push(t);
    else if (m < 1) resists.push(t);
  }
  return { weak_to, resists, immune_to };
}

/**
 * Apply curated ability/item defensive modifiers on top of a type-combined
 * profile. Returns a new profile + short notes for the analysis UI.
 */
export function applyDefensiveModifiers(
  profile: DefensiveProfile,
  opts: { ability?: string | null; item?: string | null },
): DefensiveModifierResult {
  const ability = opts.ability ?? null;
  const item = opts.item ?? null;
  const notes: string[] = [];

  // Build per-type multipliers from the classified profile.
  const mult = new Map<string, number>();
  for (const t of TYPE_NAMES) {
    mult.set(t, defMultiplier(profile, t));
  }

  if (ability && ABILITY_IMMUNITIES[ability]) {
    for (const t of ABILITY_IMMUNITIES[ability]) {
      mult.set(t, 0);
    }
    notes.push(
      `${ability}: immune to ${ABILITY_IMMUNITIES[ability].join(", ")}`,
    );
  }

  if (ability && ABILITY_HALVE[ability]) {
    for (const t of ABILITY_HALVE[ability]) {
      const cur = mult.get(t) ?? 1;
      if (cur > 0) mult.set(t, cur * 0.5);
    }
    notes.push(
      `${ability}: resists ${ABILITY_HALVE[ability].join(" / ")} (halved)`,
    );
  }

  // Wonder Guard: only keep super-effective as weak; everything else becomes
  // resist (or stays immune). Approximates "only SE damage hits".
  if (ability === "wonder-guard") {
    for (const t of TYPE_NAMES) {
      const cur = mult.get(t) ?? 1;
      if (cur === 0) continue;
      if (cur > 1) continue; // still weak
      mult.set(t, 0.5); // neutral/resisted → resisted (not immune for display)
    }
    notes.push("wonder-guard: only super-effective hits register as weak");
  }

  if (item && ITEM_IMMUNITIES[item]) {
    for (const t of ITEM_IMMUNITIES[item]) {
      mult.set(t, 0);
    }
    const balloonNote =
      item === "air-balloon"
        ? "air-balloon: Ground immune (pops after a hit — static analysis only)"
        : `${item}: immune to ${ITEM_IMMUNITIES[item].join(", ")}`;
    notes.push(balloonNote);
  }

  return { profile: reclassify(mult), notes };
}
