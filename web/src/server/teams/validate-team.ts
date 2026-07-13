/**
 * validate-team — advisory team validity/legality checks (BR-T5, BR-T6).
 *
 * `validateTeam(members, format, db)` evaluates a team's members and returns a
 * flat `TeamWarning[]` describing every rule that fired. It is **advisory only**:
 * it NEVER throws and NEVER blocks (BR-T6) — a clean team returns `[]`, and a
 * genuine DB/index fault degrades to "skip that check" rather than propagating
 * (the route/HTTP seam owns transport errors; this service does not).
 *
 * It is a SERVICE (under `src/server/teams/`), not a repo: it composes the
 * existing index reads — `pokedex-repo.getPokemon` (species legality + the
 * species' legal ability slots), `learnset-repo.movesForPokemon` (move legality
 * for the active format), and the `searchable_names` master list (held-item
 * legality) — plus pure EV/IV/clause math. `@/data/schema` is import-safe (only
 * `@/data/db` is `server-only`); `OakDb` is imported type-only.
 *
 * Checks (BR-T5), in stable per-slot then team-level order:
 *   - incomplete            — species unset OR < 4 moves (informational, BR-T4).
 *   - ev_total_exceeded     — sum(EVs) > 508.
 *   - ev_stat_exceeded      — any single EV > 252 (one warning per stat).
 *   - iv_out_of_range       — any IV outside 0..31 (one warning per stat).
 *   - species_illegal       — species not in the format roster.
 *   - ability_not_for_species — ability not one of the species' legal abilities.
 *   - move_not_in_learnset  — a move not learnable by the species in the format.
 *   - item_illegal          — held item not legal in the format.
 *   - item_missing          — a complete member (4 moves) with no held item.
 *   - duplicate_species     — species clause, by National Dex number (team-level).
 *   - duplicate_item        — item clause (team-level).
 */

import { and, eq } from "drizzle-orm";

import type { OakDb } from "@/data/db";
import type { Format } from "@/data/formats";
import type { StatSpread, TeamMember } from "@/data/teams/team-schema";
import { searchable_names } from "@/data/schema";
import { getPokemon } from "@/data/repos/pokedex-repo";
import { movesForPokemon } from "@/data/repos/learnset-repo";

// The warning shape is defined in the client-safe team-schema (single source of
// truth) so it can be shared with the agent answer schema + frontend without
// pulling this server-only service into a client bundle. Re-exported here for
// back-compat with existing `@/server/teams/validate-team` importers.
export type { WarningCode, TeamWarning } from "@/data/teams/team-schema";
export {
  HARD_VIOLATION_CODES,
  isHardViolation,
} from "@/data/teams/team-schema";
import type { TeamWarning } from "@/data/teams/team-schema";

/**
 * Legal EV / stat-point ceilings per format. Scarlet/Violet uses classic EVs
 * (508 total, 252 per stat); Champions uses the much tighter Stat-Point budget
 * (66 total, 32 per stat) — mirrors `evBudgetFor` in the team-builder UI.
 */
function evCaps(format: Format): { total: number; perStat: number } {
  return format === "champions"
    ? { total: 66, perStat: 32 }
    : { total: 508, perStat: 252 };
}
/** Legal IV range. */
const IV_MIN = 0;
const IV_MAX = 31;

/** The six stat keys, in canonical order (matches StatSpread). */
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

function statSum(spread: StatSpread): number {
  return STAT_KEYS.reduce((total, key) => total + spread[key], 0);
}

/**
 * Detailed result of {@link validateTeamDetailed}: the same advisory warnings
 * `validateTeam` returns, plus the per-species legal-choice lists gathered along
 * the way. `legalMoves` / `legalAbilities` are keyed by species slug and
 * populated ONLY for species found in the format roster (an illegal species has
 * no entry). Both are exposed so the runtime can turn a rejected proposed_team
 * into self-healing feedback ("here is what IS legal") without re-reading the
 * index (B-13).
 */
export interface DetailedTeamValidation {
  warnings: TeamWarning[];
  /** species slug -> sorted legal move slugs for the format (from the learnset). */
  legalMoves: Map<string, string[]>;
  /** species slug -> legal ability slugs (slot1/slot2/hidden, non-null). */
  legalAbilities: Map<string, string[]>;
  /**
   * Sorted legal held-item slugs for the format (Champions: searchable_names
   * minus admin exclusions). Empty when the item master list could not be
   * read — item legality is then skipped (fail-soft).
   */
  legalItems: string[];
  /**
   * species slug -> required held-item slug (Mega stones). Populated only for
   * found species that have `pokemon.required_item` set.
   */
  requiredItems: Map<string, string>;
}

/**
 * Validate a team's members against the active `format`. Never throws; returns
 * `[]` when clean. Per-slot warnings come first (slot order), then team-level
 * clauses. Thin wrapper over {@link validateTeamDetailed} — the single
 * implementation — so existing callers (the save path) keep the flat
 * `TeamWarning[]` signature unchanged.
 */
export async function validateTeam(
  members: TeamMember[],
  format: Format,
  db: OakDb,
): Promise<TeamWarning[]> {
  return (await validateTeamDetailed(members, format, db)).warnings;
}

/**
 * Validate a team AND surface the per-species legal move / ability lists gathered
 * during the checks (B-13). Behaviourally identical to {@link validateTeam} for
 * `warnings`; the added maps let the runtime tell the model what IS legal when it
 * rejects an illegal proposed_team. Never throws (advisory, like validateTeam).
 */
export async function validateTeamDetailed(
  members: TeamMember[],
  format: Format,
  db: OakDb,
): Promise<DetailedTeamValidation> {
  const warnings: TeamWarning[] = [];
  const { total: EV_TOTAL_MAX, perStat: EV_STAT_MAX } = evCaps(format);

  // ---- Master lists / per-species index reads (gathered once) ----

  // Held-item legality: the format's item master list. A read fault leaves the
  // set null → item legality is simply skipped (never a false warning). For
  // Champions, items the operator marked unavailable (champions_item_exclusion)
  // are removed from the legal set so they fire `item_illegal` (the @pkmn data
  // has no per-item Champions legality — see champions-items-repo).
  let legalItems: Set<string> | null = null;
  try {
    const rows = await db
      .select({ slug: searchable_names.slug })
      .from(searchable_names)
      .where(
        and(
          eq(searchable_names.format, format),
          eq(searchable_names.kind, "item"),
        ),
      );
    const items = new Set(rows.map((r) => r.slug));
    if (format === "champions") {
      const { loadChampionsItemExclusions } = await import(
        "@/data/repos/champions-items-repo"
      );
      for (const slug of await loadChampionsItemExclusions({ db })) {
        items.delete(slug);
      }
    }
    legalItems = items;
  } catch {
    legalItems = null;
  }

  // Resolve each distinct species' profile once (legality + legal abilities),
  // and — for legal species — its learnset for move legality. A null learnset
  // entry means "couldn't read" → skip move checks for that species.
  const species = new Set(
    members
      .map((m) => m.species)
      .filter((s): s is string => s !== null && s.length > 0),
  );
  const profiles = new Map<
    string,
    Awaited<ReturnType<typeof getPokemon>>
  >();
  const learnsets = new Map<string, Set<string> | null>();
  for (const slug of species) {
    const profile = await getPokemon(slug, format, db);
    profiles.set(slug, profile);
    if (profile.found) {
      try {
        const moves = await movesForPokemon(slug, format, db);
        learnsets.set(slug, new Set(moves.map((m) => m.moveSlug)));
      } catch {
        learnsets.set(slug, null);
      }
    }
  }

  // Per-species legal-choice lists for self-healing rejection feedback (B-13),
  // populated only for species found in the roster. Moves come from the learnset
  // Set (sorted, deterministic; [] when the read failed); abilities from the
  // profile's non-null slots. requiredItems: Mega stones etc.
  const legalMoves = new Map<string, string[]>();
  const legalAbilities = new Map<string, string[]>();
  const requiredItems = new Map<string, string>();
  for (const [slug, profile] of profiles) {
    if (!profile.found) continue;
    const learnset = learnsets.get(slug);
    legalMoves.set(slug, learnset ? [...learnset].sort() : []);
    legalAbilities.set(
      slug,
      [
        profile.abilities.slot1,
        profile.abilities.slot2,
        profile.abilities.hidden,
      ].filter((a): a is string => Boolean(a)),
    );
    if (profile.required_item) {
      requiredItems.set(slug, profile.required_item);
    }
  }

  // ---- Per-slot checks ----

  members.forEach((member, slot) => {
    // incomplete (informational) — empty species or fewer than 4 moves.
    if (!member.species || member.moves.length < 4) {
      warnings.push({
        code: "incomplete",
        slot,
        message: !member.species
          ? "Slot has no species selected."
          : `Slot has only ${member.moves.length} of 4 moves.`,
      });
    }

    // EV total.
    const evTotal = statSum(member.evs);
    if (evTotal > EV_TOTAL_MAX) {
      warnings.push({
        code: "ev_total_exceeded",
        slot,
        field: "evs",
        message: `EV total is ${evTotal}, exceeding the maximum of ${EV_TOTAL_MAX}.`,
      });
    }

    // EV per-stat ceiling.
    for (const key of STAT_KEYS) {
      const ev = member.evs[key];
      if (ev > EV_STAT_MAX) {
        warnings.push({
          code: "ev_stat_exceeded",
          slot,
          field: `evs.${key}`,
          message: `EV in ${key} is ${ev}, exceeding the per-stat maximum of ${EV_STAT_MAX}.`,
        });
      }
    }

    // IV range.
    for (const key of STAT_KEYS) {
      const iv = member.ivs[key];
      if (iv < IV_MIN || iv > IV_MAX) {
        warnings.push({
          code: "iv_out_of_range",
          slot,
          field: `ivs.${key}`,
          message: `IV in ${key} is ${iv}, outside the legal range ${IV_MIN}–${IV_MAX}.`,
        });
      }
    }

    // Species / ability / move legality (index-backed).
    if (member.species) {
      const profile = profiles.get(member.species);
      if (!profile || !profile.found) {
        warnings.push({
          code: "species_illegal",
          slot,
          field: "species",
          message: `Species "${member.species}" is not legal in this format.`,
        });
      } else {
        // Ability must be one of the species' legal ability slots.
        if (member.ability) {
          const legalAbilities = [
            profile.abilities.slot1,
            profile.abilities.slot2,
            profile.abilities.hidden,
          ].filter((a): a is string => Boolean(a));
          if (!legalAbilities.includes(member.ability)) {
            warnings.push({
              code: "ability_not_for_species",
              slot,
              field: "ability",
              message: `Ability "${member.ability}" is not a legal ability for ${member.species}.`,
            });
          }
        }

        // Each move must be in the species' learnset for the format.
        const learnset = learnsets.get(member.species);
        if (learnset) {
          member.moves.forEach((move, moveIndex) => {
            if (!move) return;
            if (!learnset.has(move)) {
              warnings.push({
                code: "move_not_in_learnset",
                slot,
                field: `moves[${moveIndex}]`,
                message: `Move "${move}" is not in ${member.species}'s learnset for this format.`,
              });
            }
          });
        }

        // Mega (and any forme with a locked item): must hold required_item only.
        // Fires as item_illegal so HARD_VIOLATION_CODES already covers it.
        const stone = profile.required_item ?? null;
        if (stone && member.item !== stone) {
          warnings.push({
            code: "item_illegal",
            slot,
            field: "item",
            message: member.item
              ? `${member.species} must hold "${stone}" (mega stone only); "${member.item}" is not permitted.`
              : `${member.species} must hold "${stone}" (mega stone only).`,
          });
        }
      }
    }

    // Held-item legality (format allowlist) — independent of species.
    // Skip when the mega-stone rule already flagged this slot (avoid double noise).
    const foundProfile = member.species
      ? profiles.get(member.species)
      : undefined;
    const stoneRequired =
      foundProfile && foundProfile.found
        ? (foundProfile.required_item ?? null)
        : null;
    const megaStoneMismatch = Boolean(
      stoneRequired && member.item !== stoneRequired,
    );
    if (
      member.item &&
      legalItems &&
      !legalItems.has(member.item) &&
      !megaStoneMismatch
    ) {
      warnings.push({
        code: "item_illegal",
        slot,
        field: "item",
        message: `Item "${member.item}" is not legal in this format.`,
      });
    }

    // Missing held item — only for an OTHERWISE-COMPLETE non-Mega member
    // (species + 4 moves). Megas are covered by the required_item rule above.
    // A member with fewer than 4 moves is already `incomplete` and is exempt.
    if (
      member.species &&
      member.moves.length === 4 &&
      !member.item &&
      !stoneRequired
    ) {
      warnings.push({
        code: "item_missing",
        slot,
        field: "item",
        message: `${member.species} has no held item; every battle-ready member must hold an item.`,
      });
    }
  });

  // ---- Team-level clauses ----

  // Species clause is by National Dex number, not slug — two members that are
  // different formes of the same species (e.g. `basculegion` + `basculegion-f`,
  // both #902) share a Dex number and so violate the clause. Fall back to the
  // slug when a species isn't in the index (it's already flagged species_illegal).
  const speciesKey = (slug: string): string => {
    const profile = profiles.get(slug);
    return profile && profile.found ? String(profile.national_dex_number) : slug;
  };
  for (const dup of duplicates(members.map((m) => m.species), speciesKey)) {
    warnings.push({
      code: "duplicate_species",
      message: `Species clause: "${dup.value}" appears in slots ${dup.slots
        .map((s) => s + 1)
        .join(", ")}.`,
    });
  }

  for (const dup of duplicates(members.map((m) => m.item))) {
    warnings.push({
      code: "duplicate_item",
      message: `Item clause: "${dup.value}" is held in slots ${dup.slots
        .map((s) => s + 1)
        .join(", ")}.`,
    });
  }

  return {
    warnings,
    legalMoves,
    legalAbilities,
    legalItems: legalItems ? [...legalItems].sort() : [],
    requiredItems,
  };
}

/** A repeated non-null value and the (0-based) slots it occupies. */
interface Duplicate {
  value: string;
  slots: number[];
}

/**
 * Group non-null/non-empty values and return those that occur more than once,
 * in first-seen order (deterministic). Empty/null entries are ignored (a partial
 * team's blank slots never trip a clause). `keyOf` maps a raw value to its
 * grouping key (default: identity) — the reported `value` is the first-seen RAW
 * value for that key, so a Dex-number-keyed species clause still names a species.
 */
function duplicates(
  values: Array<string | null>,
  keyOf: (value: string) => string = (value) => value,
): Duplicate[] {
  const slotsByKey = new Map<string, number[]>();
  const displayByKey = new Map<string, string>();
  const order: string[] = [];
  values.forEach((value, slot) => {
    if (!value) return;
    const key = keyOf(value);
    const existing = slotsByKey.get(key);
    if (existing) {
      existing.push(slot);
    } else {
      slotsByKey.set(key, [slot]);
      displayByKey.set(key, value);
      order.push(key);
    }
  });
  return order
    .filter((key) => slotsByKey.get(key)!.length > 1)
    .map((key) => ({ value: displayByKey.get(key)!, slots: slotsByKey.get(key)! }));
}
