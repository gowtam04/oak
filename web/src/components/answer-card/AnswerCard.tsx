"use client";

import type { AnswerCardProps } from "@/components/types";
import Masthead from "@/components/answer-card/Masthead";
import AnswerBody from "@/components/answer-card/AnswerBody";
import SpriteCard from "@/components/answer-card/SpriteCard";
import CandidateTable from "@/components/answer-card/CandidateTable";
import InferenceCallout from "@/components/answer-card/InferenceCallout";
import CaveatStrip from "@/components/answer-card/CaveatStrip";
import DamageReadout from "@/components/answer-card/DamageReadout";
import SuggestionChips from "@/components/answer-card/SuggestionChips";
import QuestionOptions from "@/components/answer-card/QuestionOptions";
import ReceiptsFooter from "@/components/answer-card/ReceiptsFooter";
import ProposedTeamCard from "@/components/teams/ProposedTeamCard";
import SavedTeamCard from "@/components/teams/SavedTeamCard";
import { useArtifactViewer } from "@/components/artifact/useArtifactViewer";
import TypeBadge from "@/components/TypeBadge";
import { plateFromSubjects } from "@/lib/plate-types";

/**
 * AnswerCard — the top-level renderer for a single `OakAnswer` (T11 /
 * output-formats.md). It fans each field of the payload out to its mapped leaf
 * component (ux-design.md "Surfaces / Components" table), in the reading order:
 *
 *   1. CaveatStrip       ← uncertainty_flags[] + generation_basis.fallback (prominent, top)
 *   2. AnswerBody        ← answer_markdown (always)
 *   3. QuestionOptions   ← question.options[] — the "stop and ask" CTA; click → follow-up turn
 *   4. SpriteCard[]      ← subjects[]
 *   5. CandidateTable    ← candidates ("N of M" when truncated)
 *   6. DamageReadout     ← damage_calc
 *   7. InferenceCallout  ← inferences[]
 *   8. SuggestionChips   ← suggestions[] (+ status) — click → follow-up turn
 *   9. ReceiptsFooter    ← reasoning_markdown + citations[] (unified expandable)
 *
 * `onFollowUp` is threaded into the interactive leaves (SuggestionChips,
 * QuestionOptions, and CandidateTable's "Show all N"). A suggestion click sends
 * the chosen name verbatim — a plain follow-up turn for the SAME session
 * (ux-design.md UI → Agent Input Map). A candidate row click instead opens that
 * Pokémon's artifact in the viewer (CandidateTable owns that, no follow-up).
 *
 * Specimen-desk plate (soul.md):
 *  - `Masthead` (status + scope tag) leads the card.
 *  - Type wash from `subjects[0].types` via `--plate-a` / `--plate-b` (ink plate
 *    when no subjects; multi accent when several subjects).
 *  - `AnswerBody` + `subjects[]` share an "evidence rail" row so sprite cards
 *    sit beside the prose instead of stranding it (media object, stacks on
 *    narrow viewports).
 *  - Reasoning + sources live in one full-width `RECEIPTS · N SOURCE(S)` footer.
 */
export default function AnswerCard({
  answer,
  onFollowUp,
  disabled = false,
}: AnswerCardProps) {
  const {
    status,
    answer_markdown,
    reasoning_markdown,
    citations,
    inferences,
    generation_basis,
    subjects,
    candidates,
    damage_calc,
    suggestions,
    question,
    uncertainty_flags,
    proposed_team,
    proposed_team_warnings,
    saved_team,
  } = answer;

  // Stable no-op so the interactive leaves always have a handler even when the
  // host did not pass one (keeps rows/chips clickable in isolation/tests). While
  // a turn is streaming (`disabled`) the alias is inert too — belt-and-suspenders
  // so a mid-stream follow-up can't abort/orphan the in-flight turn even if a
  // leaf were to fire its callback regardless of the `disabled` attribute (U2).
  const followUp = disabled ? () => {} : (onFollowUp ?? (() => {}));

  // Per-section "open in viewer" controls (B-4, AV-US-2). `openStructured` opens
  // a rich block (damage-calc, comparison) from THIS committed payload — no
  // fetch (TD-2). Its no-op default keeps the card renderable without a provider.
  const { openStructured } = useArtifactViewer();

  const plate = plateFromSubjects(subjects);
  const plateClass = ["answer-card"].filter(Boolean).join(" ");
  const subjectTypes = [
    ...new Set((subjects ?? []).flatMap((s) => s.types)),
  ];

  return (
    <div
      className={plateClass}
      data-testid="answer-card"
      data-status={status}
      data-plate={plate.kind}
    >
      {subjectTypes.length > 0 && (
        <div className="answer-card__type-row" data-testid="answer-card-types">
          {subjectTypes.map((type) => (
            <TypeBadge key={type} type={type} />
          ))}
        </div>
      )}

      <Masthead status={status} generationBasis={generation_basis} />

      <div
        className="answer-card__evidence-rail"
        data-testid="answer-card-evidence-rail"
      >
        <AnswerBody markdown={answer_markdown} />

        {subjects && subjects.length > 0 && (
          <div
            className="answer-card__subjects"
            data-testid="answer-card-subjects"
          >
            {subjects.map((subject, i) => (
              <SpriteCard key={`${subject.name}-${i}`} subject={subject} />
            ))}
            {subjects.length >= 2 && (
              <button
                type="button"
                className="answer-card__open-viewer"
                data-testid="open-comparison"
                onClick={() => openStructured({ kind: "comparison", subjects })}
              >
                Compare in viewer
              </button>
            )}
          </div>
        )}
      </div>

      {question && question.options.length > 0 && (
        <QuestionOptions
          options={question.options}
          onSelect={(label) => followUp(label)}
          disabled={disabled}
        />
      )}

      {proposed_team && (
        <ProposedTeamCard
          proposedTeam={proposed_team}
          warnings={proposed_team_warnings}
        />
      )}

      {saved_team && <SavedTeamCard savedTeam={saved_team} />}

      {candidates && (
        <CandidateTable
          candidates={candidates}
          onShowAll={() =>
            followUp(
              `Show me all ${candidates.total_count} of those, not just the top ${candidates.shown.length}.`,
            )
          }
          disabled={disabled}
        />
      )}

      {damage_calc && (
        <div className="answer-card__damage">
          <DamageReadout damageCalc={damage_calc} />
          <button
            type="button"
            className="answer-card__open-viewer"
            data-testid="open-damage-calc"
            onClick={() =>
              openStructured({ kind: "damage-calc", damageCalc: damage_calc })
            }
          >
            Open in viewer
          </button>
        </div>
      )}

      <InferenceCallout inferences={inferences} />

      <CaveatStrip
        uncertaintyFlags={uncertainty_flags ?? []}
        generationBasis={generation_basis}
      />

      {suggestions && suggestions.length > 0 && (
        <SuggestionChips
          suggestions={suggestions}
          status={status}
          onSelect={(suggestion) => followUp(suggestion)}
          disabled={disabled}
        />
      )}

      <ReceiptsFooter
        reasoningMarkdown={reasoning_markdown}
        citations={citations}
        answer={answer}
      />
    </div>
  );
}
