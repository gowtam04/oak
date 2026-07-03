/**
 * Team-builder assistant — the AnswerRunHooks wiring for runWithProvider.
 *
 * SERVER-ONLY by usage (validateTeamDetailed reaches the DB through ctx.db):
 * import this only from server code (the /api/teams/assistant route), never
 * from components.
 *
 * The legality gate mirrors the main agent's proposed_team loop
 * (runtime.ts validateOakAnswer): apply the patch to the turn's draft, validate
 * the RESULT, and feed hard violations back (with the species' legal
 * move/ability lists) so the model rebuilds legally — up to
 * MAX_BUILDER_PATCH_RETRIES, then warn-but-allow (the /teams editor re-renders
 * its own per-slot warnings once the user applies the patch). One deliberate
 * difference: the model is held to violations its PATCH INTRODUCES — a hard
 * violation already present in untouched draft slots (the user's own hand
 * edits) never burns the model's retry budget, since the assistant didn't
 * cause it and may not even be asked to fix it. `item_missing` is not enforced
 * here at all: draft editing is incremental by design (a member without an
 * item yet is normal mid-build), unlike a chat-proposed complete team.
 */

import type { AgentContext } from "@/agent/types";
import type { AnswerRunHooks, AnswerVerdict } from "@/agent/runtime";
import type { OakDb } from "@/data/db";
import { formatForMode } from "@/data/formats";
import type { TeamMember } from "@/data/teams/team-schema";
import {
  validateTeamDetailed,
  isHardViolation,
  type TeamWarning,
} from "@/server/teams/validate-team";
import {
  applyTeamPatch,
  builderAnswerSchema,
  type BuilderAnswer,
} from "@/agent/teams-assistant/schemas";
import { builderTools, builderDispatch } from "@/agent/teams-assistant/tools";
import { buildBuilderSystemSegments } from "@/agent/teams-assistant/prompts";

/** Re-emit budget for a team_patch with (newly introduced) hard violations. */
export const MAX_BUILDER_PATCH_RETRIES = 2;

const EMPTY_TURN_NUDGE =
  "You ended your turn without calling submit_builder_answer. " +
  "submit_builder_answer is the ONLY way to reply. Call it now with your " +
  "complete answer (and team_patch only if you are proposing concrete edits). " +
  "Do not reply with plain text.";

const SUBMIT_NUDGE =
  "You are close to the tool-call limit for this turn. If you already have " +
  "enough information to answer, call submit_builder_answer NOW with what you " +
  "have — do not gather or recompute more data. If you were asked for " +
  "concrete edits, submit your best COMPLETE team_patch; the server will tell " +
  "you exactly what to fix if anything is illegal. Either way, " +
  "submit_builder_answer on your next turn.";

/** Identity key for a warning, to diff pre- vs post-patch violation sets. */
function warningKey(w: TeamWarning): string {
  return `${w.code}|${w.slot ?? ""}|${w.field ?? ""}|${w.message}`;
}

/**
 * Builder domain validation for one turn, closed over that turn's draft
 * members (the request's live draft — NOT server session state).
 */
function buildValidateAnswer(
  draftMembers: TeamMember[],
): AnswerRunHooks<BuilderAnswer>["validateAnswer"] {
  return async (
    answer: BuilderAnswer,
    ctx: AgentContext,
    rejectionsSoFar: number,
  ): Promise<AnswerVerdict<BuilderAnswer>> => {
    const patch = answer.team_patch;
    if (!patch || patch.slots.length === 0) {
      // Advice-only turn (or rename-only) — nothing to roster-validate.
      return { ok: true };
    }
    const format = formatForMode(ctx.mode);
    const db = ctx.db as unknown as OakDb;
    const patched = applyTeamPatch(draftMembers, patch);
    const validation = await validateTeamDetailed(patched, format, db);
    const hard = validation.warnings.filter(isHardViolation);
    if (hard.length === 0) return { ok: true };

    // Hold the model only to violations its patch INTRODUCED: subtract the
    // hard violations already present in the incoming draft.
    const preExisting = new Set(
      (await validateTeamDetailed(draftMembers, format, db)).warnings
        .filter(isHardViolation)
        .map(warningKey),
    );
    const introduced = hard.filter((w) => !preExisting.has(warningKey(w)));
    if (introduced.length === 0 || rejectionsSoFar >= MAX_BUILDER_PATCH_RETRIES) {
      // Nothing new is the model's fault, or the budget is spent —
      // warn-but-allow; the editor surfaces per-slot warnings after Apply.
      return { ok: true };
    }

    // Mirror the main agent's rejection feedback: enumerate the violations,
    // then the legal move/ability lists for the implicated species (so the
    // model stops swapping one illegal guess for another), then a directive.
    const issues = introduced.map((w) => w.message).join(" ");
    const speciesAt = (slot: number | undefined): string | null =>
      slot === undefined ? null : patched[slot]?.species ?? null;

    const moveSpecies = new Set<string>();
    for (const w of introduced) {
      if (w.code !== "move_not_in_learnset") continue;
      const sp = speciesAt(w.slot);
      if (sp) moveSpecies.add(sp);
    }
    const legalMoveLines = [...moveSpecies].map((sp) => {
      const moves = validation.legalMoves.get(sp) ?? [];
      return `Legal moves for ${sp} in ${format}: ${moves.join(", ")}.`;
    });

    const abilitySpecies = new Set<string>();
    for (const w of introduced) {
      if (w.code !== "ability_not_for_species") continue;
      const sp = speciesAt(w.slot);
      if (sp) abilitySpecies.add(sp);
    }
    const legalAbilityLines = [...abilitySpecies].map((sp) => {
      const abilities = validation.legalAbilities.get(sp) ?? [];
      return `Legal abilities for ${sp}: ${abilities.join(", ")}.`;
    });

    const feedback =
      `Your team_patch makes the draft illegal for ${format} and was ` +
      `rejected: ${issues}` +
      [...legalMoveLines, ...legalAbilityLines]
        .map((line) => ` ${line}`)
        .join("") +
      ` Rebuild the patch choosing ONLY from the legal moves listed above ` +
      `(or call get_learnset for any other species), make sure no two members ` +
      `of the post-patch draft share a species or a held item, and call ` +
      `submit_builder_answer again.`;
    return { ok: false, feedback, traceError: "team_patch_illegal" };
  };
}

/**
 * The builder assistant's complete hooks for one request. `draftMembers` is
 * the request body's live draft — the same members array the patch semantics
 * (and the client's Apply) operate on.
 */
export function buildBuilderHooks(
  draftMembers: TeamMember[],
): AnswerRunHooks<BuilderAnswer> {
  return {
    tools: builderTools,
    dispatch: builderDispatch,
    submitToolName: "submit_builder_answer",
    answerSchema: builderAnswerSchema,
    buildSystem: (providerKind, ctx) =>
      buildBuilderSystemSegments({ provider: providerKind, mode: ctx.mode }),
    validateAnswer: buildValidateAnswer(draftMembers),
    // No enrich (no sprites/subjects in a builder answer) and no
    // finalizeAnswer (v1 scope cut: builder turns are not recorded to
    // turn_record / the admin panel — see the feature plan).
    synthesizeInsufficient: () => ({
      answer_markdown:
        "I wasn't able to put together a reliable suggestion for that this " +
        "time. Could you rephrase or narrow the request, and I'll try again?",
    }),
    synthesizeFromProse: (prose) => ({ answer_markdown: prose }),
    emptyTurnNudge: EMPTY_TURN_NUDGE,
    submitNudge: SUBMIT_NUDGE,
  };
}
