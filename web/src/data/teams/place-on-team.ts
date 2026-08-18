/**
 * Portable add-to-team slot write (ADR-5).
 *
 * First empty = lowest index 0–5 whose `species` is null/empty (ADD-BR-1).
 * A full roster is never auto-replaced — the caller must name a slot
 * (ADD-BR-6). Incoming is already species + copied named fields; unnamed
 * stay `blankMember()` defaults (ADD-BR-2). Does not mutate `members`.
 */

import type { TeamMember } from "./team-schema";

const TEAM_SIZE = 6;

const ZERO_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } as const;
const MAX_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } as const;

/** Editor new-pick defaults: EVs 0, IVs 31, level 50, empty moves. */
export function blankMember(): TeamMember {
  return {
    species: null,
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: { ...ZERO_EVS },
    ivs: { ...MAX_IVS },
    tera_type: null,
    level: 50,
    nickname: null,
  };
}

export type PlaceOnTeamTarget =
  | { type: "first_empty" }
  | { type: "replace"; index: 0 | 1 | 2 | 3 | 4 | 5 };

export type PlaceOnTeamResult =
  | { ok: true; members: TeamMember[]; slotIndex: number }
  | { ok: false; error: "full" };

function isEmptySlot(member: TeamMember | undefined): boolean {
  if (!member) return true;
  return member.species == null || member.species === "";
}

/**
 * Write `incoming` into the first empty slot, or replace a named index.
 * Full + `first_empty` → `{ error: "full" }` (no auto-replace).
 */
export function placeSpeciesOnTeam(
  members: TeamMember[],
  incoming: TeamMember,
  target: PlaceOnTeamTarget,
): PlaceOnTeamResult {
  if (target.type === "replace") {
    const next = members.slice();
    next[target.index] = incoming;
    return { ok: true, members: next, slotIndex: target.index };
  }

  for (let i = 0; i < TEAM_SIZE; i++) {
    if (isEmptySlot(members[i])) {
      const next = members.slice();
      next[i] = incoming;
      return { ok: true, members: next, slotIndex: i };
    }
  }

  return { ok: false, error: "full" };
}
