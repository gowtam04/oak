/**
 * legalize-team — deterministic repair of hard format-illegalities on a
 * proposed team so the agent can still ship a COMPLETE, legal card when the
 * model exhausts its rebuild budget.
 *
 * Used only as the end-of-budget salvage for *built* teams (not image imports).
 * Strategy: keep the model's structure (species, spreads, roles) and swap only
 * the illegal fields — items from the format allowlist (admin Champions
 * catalog included), moves from the learnset, abilities from the species'
 * legal slots. Never nulls items/moves to "pass" validation, except
 * `keepSpecies` slots which clear illegal moves instead of filling a legal one.
 *
 * Species-level problems (`species_illegal`, `duplicate_species`) are NOT
 * invented away — legalize leaves those for the caller to drop the proposal
 * if still hard-illegal after repair. `options.keepSpecies` is the exception
 * for named-for-party slots: never change those species; clear illegal moves
 * instead of swapping in a legal filler (BOX-BR-9). Out-of-roster keep
 * species stay on the team (`remainingHard` may still include species_illegal).
 */

import type { OakDb } from "@/data/db";
import type { Format } from "@/data/formats";
import type { TeamMember } from "@/data/teams/team-schema";
import {
  isHardViolation,
  validateTeamDetailed,
  type TeamWarning,
} from "@/server/teams/validate-team";

/** One field change applied during legalization (for UX honesty copy). */
export interface TeamRepair {
  slot: number;
  field: string;
  from: string | null;
  to: string | null;
  reason: string;
}

export interface LegalizeResult {
  members: TeamMember[];
  repairs: TeamRepair[];
  /** Hard violations still present after the repair loop. */
  remainingHard: TeamWarning[];
}

/** Optional keep-species policy (box-build: never swap named mons). */
export interface LegalizeOptions {
  /** Species slugs that must remain on their slots (BOX-BR-9). */
  keepSpecies?: string[];
}

/**
 * Competitive staples preferred when picking a replacement held item. Filtered
 * against the format allowlist; order is preference (first match wins).
 */
const ITEM_STAPLES: readonly string[] = [
  "sitrus-berry",
  "leftovers",
  "focus-sash",
  "assault-vest",
  "life-orb",
  "choice-scarf",
  "choice-specs",
  "choice-band",
  "heavy-duty-boots",
  "rocky-helmet",
  "safety-goggles",
  "covert-cloak",
  "loaded-dice",
  "booster-energy",
  "eviolite",
  "black-sludge",
  "flame-orb",
  "toxic-orb",
  "weakness-policy",
  "expert-belt",
];

const MAX_LEGALIZE_PASSES = 6;

function cloneMembers(members: TeamMember[]): TeamMember[] {
  return members.map((m) => ({
    ...m,
    moves: [...m.moves],
    evs: { ...m.evs },
    ivs: { ...m.ivs },
  }));
}

/** Items already held by other slots (for item clause). */
function heldByOthers(members: TeamMember[], exceptSlot: number): Set<string> {
  const held = new Set<string>();
  members.forEach((m, i) => {
    if (i === exceptSlot) return;
    if (m.item) held.add(m.item);
  });
  return held;
}

function pickLegalItem(
  legalItems: string[],
  taken: Set<string>,
  /** When set (Mega stone), always prefer this over staples. */
  requiredItem?: string | null,
): string | null {
  if (requiredItem) {
    // Mega stones may not appear on the format item allowlist in every seed;
    // still force the stone — that is the only legal held item for the forme.
    return requiredItem;
  }
  if (legalItems.length === 0) return null;
  for (const staple of ITEM_STAPLES) {
    if (legalItems.includes(staple) && !taken.has(staple)) return staple;
  }
  for (const slug of legalItems) {
    if (!taken.has(slug)) return slug;
  }
  return null;
}

function keepKey(species: string): string {
  return species.trim().toLowerCase();
}

/**
 * Repair hard-illegal fields on `members` against `format`. Pure data swap;
 * never throws. Returns the repaired members + a repair log + any remaining
 * hard violations (e.g. illegal species).
 *
 * `options.keepSpecies`: those slots never change species; illegal moves are
 * removed (length decreases) rather than replaced with a legal filler.
 */
export async function legalizeTeam(
  members: TeamMember[],
  format: Format,
  db: OakDb,
  options?: LegalizeOptions,
): Promise<LegalizeResult> {
  const keepSet = new Set(
    (options?.keepSpecies ?? []).map(keepKey).filter(Boolean),
  );
  const isKeepSlot = (species: string | null): boolean =>
    !!species && keepSet.has(keepKey(species));

  const out = cloneMembers(members);
  const repairs: TeamRepair[] = [];

  for (let pass = 0; pass < MAX_LEGALIZE_PASSES; pass++) {
    const validation = await validateTeamDetailed(out, format, db);
    // Also treat item_missing as repairable (built-team completeness).
    const repairable = validation.warnings.filter(
      (w) => isHardViolation(w) || w.code === "item_missing",
    );
    if (repairable.length === 0) {
      return { members: out, repairs, remainingHard: [] };
    }

    let changed = false;

    // Proactive mega-stone fix for every slot that has a required_item
    // (even if this pass's warnings list is stale mid-loop).
    out.forEach((member, slot) => {
      if (!member.species) return;
      const stone = validation.requiredItems.get(member.species);
      if (!stone || member.item === stone) return;
      repairs.push({
        slot,
        field: "item",
        from: member.item,
        to: stone,
        reason: "mega stone required",
      });
      member.item = stone;
      changed = true;
    });

    // Per-slot fixes first (stable slot order).
    for (const w of repairable) {
      if (w.slot === undefined) continue;
      const slot = w.slot;
      const member = out[slot];
      if (!member) continue;

      if (w.code === "item_illegal" || w.code === "item_missing") {
        const taken = heldByOthers(out, slot);
        // Free the illegal item so we can re-pick it if it's somehow legal for
        // another slot (not needed here) — exclude current illegal from taken.
        if (member.item) taken.delete(member.item);
        const stone = member.species
          ? validation.requiredItems.get(member.species)
          : undefined;
        const next = pickLegalItem(validation.legalItems, taken, stone);
        if (next && next !== member.item) {
          repairs.push({
            slot,
            field: "item",
            from: member.item,
            to: next,
            reason: stone
              ? "mega stone required"
              : w.code === "item_missing"
                ? "missing held item"
                : "item not legal in this format",
          });
          member.item = next;
          changed = true;
        }
        continue;
      }

      if (w.code === "ability_not_for_species" && member.species) {
        const legal = validation.legalAbilities.get(member.species) ?? [];
        const next = legal[0] ?? null;
        if (next && next !== member.ability) {
          repairs.push({
            slot,
            field: "ability",
            from: member.ability,
            to: next,
            reason: "ability not legal for this species",
          });
          member.ability = next;
          changed = true;
        }
        continue;
      }

      if (w.code === "move_not_in_learnset" && member.species) {
        const legal = validation.legalMoves.get(member.species) ?? [];
        if (isKeepSlot(member.species)) {
          // Named-for-party: drop illegal moves instead of filling a legal one.
          const prev = member.moves;
          const next = prev.filter((m) => legal.includes(m));
          if (next.length !== prev.length) {
            member.moves = next;
            repairs.push({
              slot,
              field: w.field ?? "moves",
              from: prev.join(","),
              to: next.join(",") || null,
              reason: "illegal move removed; species kept",
            });
            changed = true;
          }
          continue;
        }
        // Parse moves[i] from field when present.
        let moveIndex = 0;
        const match = w.field?.match(/^moves\[(\d+)\]$/);
        if (match) moveIndex = Number(match[1]);
        const used = new Set(
          member.moves.filter((_, i) => i !== moveIndex),
        );
        const next =
          legal.find((m) => !used.has(m)) ?? legal[0] ?? null;
        const prev = member.moves[moveIndex] ?? null;
        if (next && next !== prev) {
          const moves = [...member.moves];
          while (moves.length <= moveIndex) moves.push(next);
          moves[moveIndex] = next;
          member.moves = moves.slice(0, 4);
          repairs.push({
            slot,
            field: `moves[${moveIndex}]`,
            from: prev,
            to: next,
            reason: "move not in learnset for this format",
          });
          changed = true;
        }
      }
    }

    // Team-level item clause: reassign every slot after the first holder.
    for (const w of repairable) {
      if (w.code !== "duplicate_item") continue;
      // Re-validate which items clash from current members.
      const byItem = new Map<string, number[]>();
      out.forEach((m, i) => {
        if (!m.item) return;
        const slots = byItem.get(m.item) ?? [];
        slots.push(i);
        byItem.set(m.item, slots);
      });
      for (const [, slots] of byItem) {
        if (slots.length < 2) continue;
        // Keep the first slot; reassign the rest.
        for (const slot of slots.slice(1)) {
          const member = out[slot];
          if (!member) continue;
          const taken = heldByOthers(out, slot);
          const stone = member.species
            ? validation.requiredItems.get(member.species)
            : undefined;
          // Never strip a mega stone to resolve item clause — reassign the
          // *other* slots instead (this slot is kept when it's the first holder).
          const next = pickLegalItem(validation.legalItems, taken, stone);
          if (next && next !== member.item) {
            repairs.push({
              slot,
              field: "item",
              from: member.item,
              to: next,
              reason: stone
                ? "mega stone required"
                : "item clause (duplicate held item)",
            });
            member.item = next;
            changed = true;
          }
        }
      }
    }

    if (!changed) {
      // Cannot progress (e.g. species_illegal only).
      const remainingHard = (
        await validateTeamDetailed(out, format, db)
      ).warnings.filter(
        (w) => isHardViolation(w) || w.code === "item_missing",
      );
      return { members: out, repairs, remainingHard };
    }
  }

  const remainingHard = (
    await validateTeamDetailed(out, format, db)
  ).warnings.filter(
    (w) => isHardViolation(w) || w.code === "item_missing",
  );
  return { members: out, repairs, remainingHard };
}

/**
 * Build a short, user-facing note describing legalize repairs (for answer_markdown).
 * Empty string when there are no repairs.
 */
export function formatRepairsNote(repairs: TeamRepair[]): string {
  if (repairs.length === 0) return "";
  const lines = repairs.map((r) => {
    const slotLabel = `slot ${r.slot + 1}`;
    const from = r.from ?? "(none)";
    const to = r.to ?? "(none)";
    return `${slotLabel} ${r.field}: \`${from}\` → \`${to}\` (${r.reason})`;
  });
  return (
    "I adjusted a few choices so every set is legal in this format:\n\n" +
    lines.map((l) => `- ${l}`).join("\n")
  );
}
