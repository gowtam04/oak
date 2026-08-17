/**
 * Derive follow-up chips from a finalized OakAnswer + turn context (CHIP-US-1 /
 * ADR-9). Chips only hop to surfaces that already exist: scope, Dex, Teams.
 *
 * Pure: no DOM, no fetch, no mutation of the answer. Caps: ≤1 scope, ≤3 Dex,
 * ≤1 team. Never invents calc / compare / add-to-team / "tell me more".
 */

import type { OakAnswer } from "@/agent/schemas";
import type { Format } from "@/data/formats";

export type FollowUpChipKind = "scope" | "dex" | "team";

export interface FollowUpChip {
  kind: FollowUpChipKind;
  label: string;
  /** Format id, subject name, or team id. */
  target: string;
}

export interface DeriveFollowUpChipsInput {
  answer: OakAnswer;
  /** Only when a *different* format is implied by the turn. */
  impliedFormat?: Format;
  /** Signed-in bound / @mentioned team. Wins over `answer.saved_team`. */
  mentionedTeam?: { id: string; name: string };
}

const DEX_CAP = 3;

/**
 * Project hop-targets from the structured answer and turn context.
 * Empty when there is nothing to hop to (no empty-row filler chips).
 */
export function deriveFollowUpChips({
  answer,
  impliedFormat,
  mentionedTeam,
}: DeriveFollowUpChipsInput): FollowUpChip[] {
  const chips: FollowUpChip[] = [];

  if (impliedFormat) {
    chips.push({
      kind: "scope",
      label: `Switch to ${impliedFormat}.`,
      target: impliedFormat,
    });
  }

  const subjects = answer.subjects;
  if (subjects && subjects.length > 0) {
    for (const subject of subjects.slice(0, DEX_CAP)) {
      chips.push({
        kind: "dex",
        label: `Open ${subject.name} in Dex`,
        target: subject.name,
      });
    }
  }

  const team = mentionedTeam ?? savedTeamRef(answer);
  if (team) {
    chips.push({
      kind: "team",
      label: `Open ${team.name}`,
      target: team.id,
    });
  }

  return chips;
}

function savedTeamRef(
  answer: OakAnswer,
): { id: string; name: string } | undefined {
  const saved = answer.saved_team;
  if (!saved) return undefined;
  return { id: saved.id, name: saved.name };
}
