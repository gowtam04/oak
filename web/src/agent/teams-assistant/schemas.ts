/**
 * Team-builder assistant — output contract + patch semantics.
 *
 * CLIENT-SAFE and portable (zod + team-schema only — no server-only, DB, React,
 * or provider imports): the same module backs the agent's `submit_builder_answer`
 * schema on the server AND the draft-patching logic in the `/teams` panel, so a
 * patch the server validated is byte-for-byte the patch the client applies.
 *
 * The assistant's edits land in the ON-SCREEN unsaved draft, never the DB: an
 * answer optionally carries a `team_patch` of slot-level edits the user applies
 * (with undo) and saves themselves.
 */

import { z } from "zod";
import {
  teamMemberSchema,
  type TeamMember,
} from "@/data/teams/team-schema";

/**
 * One slot-level edit. `member` is a FULL replacement payload for that slot
 * (never a partial-field merge — mirrors how proposed_team/save_team always
 * carry complete members, so there is no merge ambiguity for moves/evs/etc.);
 * `member: null` removes the slot. `slot` indices refer to the PRE-patch draft.
 */
export const teamPatchSlotSchema = z
  .object({
    slot: z.number().int().min(0).max(5),
    member: teamMemberSchema.nullable(),
  })
  .strict();

export type TeamPatchSlot = z.infer<typeof teamPatchSlotSchema>;

/** A set of slot edits (plus optional rename / win condition). */
export const teamPatchSchema = z
  .object({
    name: z.string().min(1).max(120).nullable().optional(),
    /** Optional win-condition text for the draft (null clears). */
    win_condition: z.string().max(280).nullable().optional(),
    slots: z.array(teamPatchSlotSchema).max(6),
  })
  .strict();

export type TeamPatch = z.infer<typeof teamPatchSchema>;

/**
 * The builder assistant's whole answer. Deliberately tiny next to OakAnswer:
 * prose + an optional patch. `answer_markdown` keeps that exact field name so
 * the runtime's AnswerMarkdownExtractor streams it token-by-token unchanged.
 * `team_patch` absent/null ⇒ an advice-only turn (no edits proposed).
 */
export const builderAnswerSchema = z
  .object({
    answer_markdown: z.string().min(1),
    team_patch: teamPatchSchema.nullable().optional(),
  })
  .strict();

export type BuilderAnswer = z.infer<typeof builderAnswerSchema>;

/**
 * A fresh, empty member used to pad gaps when a patch targets a slot beyond
 * the draft's current length (partial team allowed — BR-T4; IVs default 31,
 * level 50 like the `/teams` editor's blank slot).
 */
export function blankTeamMember(): TeamMember {
  return {
    species: null,
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: null,
    level: 50,
    nickname: null,
  };
}

/**
 * Apply a patch to a draft's members. Pure — returns a new array, never
 * mutates. Slot indices refer to the PRE-patch draft:
 *   1. every `member: <payload>` op replaces (or, past the end, extends —
 *      gaps padded with {@link blankTeamMember}) its slot;
 *   2. every `member: null` op marks its pre-patch slot for removal;
 *   3. removals compact the array last, preserving order.
 * The same function runs server-side (legality gate) and client-side (Apply),
 * so validated and applied results can't diverge.
 */
export function applyTeamPatch(
  members: TeamMember[],
  patch: TeamPatch,
): TeamMember[] {
  const next: (TeamMember | null)[] = [...members];
  const removals: TeamPatchSlot[] = [];
  for (const op of patch.slots) {
    if (op.member === null) {
      removals.push(op);
      continue;
    }
    while (next.length <= op.slot) next.push(blankTeamMember());
    next[op.slot] = op.member;
  }
  for (const op of removals) {
    if (op.slot < next.length) next[op.slot] = null;
  }
  return next.filter((m): m is TeamMember => m !== null).slice(0, 6);
}
